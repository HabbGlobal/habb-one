"use server";

// Rechnungs-Server-Actions.
//
// Pattern wie bei Order/Quote:
//   1) Auth + Permission
//   2) Zod-Validation
//   3) Transaktion bei Multi-Row-Mutationen
//   4) AuditLog
//   5) revalidatePath
//
// Snapshot-Regel: bei DRAFT â†’ SENT werden vatCHF, totalGrossCHF und die
// Rechnungsadresse eingefroren. Danach unverÃ¤nderlich.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  idsSchema,
  invoiceFullSchema,
  invoiceStatusChangeSchema,
  markPaidSchema,
  invoiceSettingsSchema,
} from "@/lib/validation/invoice";
import { generateInvoiceNumber } from "@/lib/invoice/numbering";
import {
  buildQrReference,
  digitsFromString,
  isValidIban,
} from "@/lib/invoice/qr-reference";
import { allowedNextInvoiceStatuses } from "@/lib/dto/invoice";
import {
  buildParameterMapFromSnapshot,
  loadAllParams,
  type SystemParameterMap,
} from "@/lib/domain/parameters/store";
import { effectiveBilledMinutes } from "@/lib/order/step-time";

const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

async function requirePerm(perm: Permission) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, perm)) {
    throw new Error("No permission.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return r.data;
}

function explainPrismaError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      if (target.includes("invoiceNumber")) {
        return "This invoice number already exists â€” please try again.";
      }
      if (target.includes("qrBillReference")) {
        return "This QR reference has already been used â€” please try again.";
      }
      return `Uniqueness conflict: ${target}`;
    }
    if (err.code === "P2025") return "Record not found.";
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcItemTotal(qty: number, price: number, discountPct: number): number {
  return round2(qty * price * (1 - discountPct / 100));
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create Manual
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createInvoice(input: unknown) {
  try {
    const user = await requirePerm("invoices.write");
  const data = parseOrThrow(invoiceFullSchema, input);

  await prisma.customer.findFirstOrThrow({
    where: { id: data.core.customerId, companyId: user.companyId },
    select: { id: true },
  });

  const itemsCalc = data.items.map((it) => ({
    ...it,
    totalCHF: calcItemTotal(it.quantity, it.unitPriceCHF, it.discountPct),
  }));
  const totalNet = round2(itemsCalc.reduce((s, it) => s + it.totalCHF, 0));
  const vatCHF = round2((totalNet * data.core.vatRate) / 100);
  const totalGross = round2(totalNet + vatCHF);

  let invoiceId = "";
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const invoiceNumber = await generateInvoiceNumber(tx, user.companyId, year);

      const created = await tx.invoice.create({
        data: {
          companyId: user.companyId,
          invoiceNumber,
          customerId: data.core.customerId,
          orderId: data.core.orderId ?? null,
          status: "DRAFT",
          issuedAt: data.core.issuedAt,
          dueAt: data.core.dueAt,
          totalNetCHF: totalNet,
          vatRate: data.core.vatRate,
          vatCHF,
          totalGrossCHF: totalGross,
          notes: data.core.notes ?? null,
          createdById: user.id,
          items: {
            create: itemsCalc.map((it) => ({
              position: it.position,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPriceCHF: it.unitPriceCHF,
              discountPct: it.discountPct,
              totalCHF: it.totalCHF,
            })),
          },
        },
      });
      return created.id;
    }, TX_OPTS);
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: invoiceId,
    newValue: { customerId: data.core.customerId, totalGross },
  });

    revalidatePath("/admin/invoices");
    return { id: invoiceId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An error occurred." };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Create from Order â€” automatisches Erfassen aus einem fertigen Auftrag
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const createFromOrderSchema = z.object({
  orderId: z.string().cuid(),
  /** Optional: Override FÃ¤lligkeit. Sonst issuedAt + paymentTerms. */
  dueDays: z.coerce.number().int().min(0).max(180).optional(),
});

export async function createInvoiceFromOrder(input: unknown) {
  const user = await requirePerm("invoices.write");
  const { orderId, dueDays } = parseOrThrow(createFromOrderSchema, input);

  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, companyId: user.companyId },
    include: {
      items: { include: { processSteps: true }, orderBy: { position: "asc" } },
      customer: true,
      billingAddress: true,
    },
  });

  const existingInvoiceCount = await prisma.invoice.count({ where: { orderId } });
  if (existingInvoiceCount > 0) {
    // Schon eine Rechnung â€” nicht duplizieren
    throw new Error("An invoice already exists for this order.");
  }
  if (order.status === "CANCELLED" || order.status === "DRAFT") {
    throw new Error(
      `Order in status ${order.status} cannot be invoiced.`,
    );
  }

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: user.companyId },
  });

  // Defensive Fallbacks: Felder wurden nachtrÃ¤glich ans Schema gehÃ¤ngt;
  // bestehende Companies kÃ¶nnen je nach Migration noch null haben.
  const paymentTermsDays =
    dueDays ??
    (typeof company.invoicePaymentTerms === "number" && company.invoicePaymentTerms > 0
      ? company.invoicePaymentTerms
      : 30);
  const rawVat = company.invoiceDefaultVatRate != null
    ? Number(company.invoiceDefaultVatRate)
    : NaN;
  const vatRate = Number.isFinite(rawVat) && rawVat >= 0 ? rawVat : 8.1;

  const issued = new Date();
  const due = new Date(issued);
  due.setDate(issued.getDate() + paymentTermsDays);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Verrechnungs-Logik:
  //
  //   1. Wenn `OrderItem.unitPriceCHF` gesetzt ist â†’ fixer StÃ¼ckpreis.
  //      (Klassische StÃ¼ckpreis-AuftrÃ¤ge wie â€ž10 GelÃ¤nder Ã  125.50".)
  //
  //   2. Sonst: pro Schritt `effectiveBilledMinutes()` Ã— Stundensatz
  //      = aufwand-basierter Preis. Die CEO-Verrechnungs-Entscheidung
  //      (ACTUAL / ESTIMATED / MANUAL pro Schritt) wird so 1:1 in den
  //      Rechnungs-Betrag Ã¼bernommen.
  //
  // Die ist-Stunden (`actualMinutes`) selber landen NICHT auf der Rechnung â€”
  // die sind nur intern in den Reports relevant.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Snapshot-Parameter laden (oder Live wenn kein Snapshot vorhanden)
  const params: SystemParameterMap = order.parameterSnapshot
    ? buildParameterMapFromSnapshot(order.parameterSnapshot as Record<string, string>)
    : await loadAllParams(prisma, user.companyId);
  const laborRateCHF =
    params.tryGetNumber("pricing.rate.labor.standard") ?? 90;

  // Maschinen-StundensÃ¤tze (fÃ¼r detailliertere Bewertung â€” wir verwenden
  // pro Schritt den Maschinen-Satz, sonst Mitarbeiter-Standardsatz)
  function rateForStep(machineType: string | null): number {
    if (!machineType) return laborRateCHF;
    const machineRate = params.tryGetNumber(`pricing.rate.machine.${machineType}`);
    return Number.isFinite(machineRate ?? NaN) ? (machineRate as number) : laborRateCHF;
  }

  const items = order.items.map((it, idx) => {
    const fixedPrice = it.unitPriceCHF != null ? Number(it.unitPriceCHF) : null;

    let unitPrice: number;
    if (fixedPrice != null && fixedPrice > 0) {
      // Fall 1: Fester StÃ¼ckpreis (z. B. â€žGelÃ¤nder 125.50")
      unitPrice = fixedPrice;
    } else {
      // Fall 2: Aufwand-basiert â€” Î£ effectiveBilledMinutes Ã— Stundensatz pro Stk.
      let priceCHF = 0;
      for (const st of it.processSteps) {
        const billedMin = effectiveBilledMinutes({
          estimatedMinutes: st.estimatedMinutes,
          actualMinutes: st.actualMinutes,
          billedMinutes: st.billedMinutes,
          billingTimeSource: st.billingTimeSource,
        });
        priceCHF += (billedMin / 60) * rateForStep(st.machineTypeRequired);
      }
      unitPrice = round2(priceCHF);
    }

    const total = calcItemTotal(it.quantity, unitPrice, 0);
    // Beschreibung um spritzwerk-relevante Stammdaten ergÃ¤nzen â€” Anwendung
    // (Innen/Aussen) ist preisrelevant und sollte auf der Rechnung sichtbar sein.
    const extras: string[] = [];
    if (it.applicationArea) {
      const map = { INDOOR: "Innen", OUTDOOR: "Aussen", BOTH: "Innen + Aussen" } as const;
      extras.push(`Anwendung: ${map[it.applicationArea]}`);
    }
    if (it.colorCode) extras.push(`Farbe: ${it.colorCode}`);
    const fullDescription = extras.length > 0
      ? `${it.description} (${extras.join(", ")})`
      : it.description;

    return {
      position: it.position || (idx + 1) * 10,
      description: fullDescription,
      quantity: it.quantity,
      unit: "Stk",
      unitPriceCHF: unitPrice,
      discountPct: 0,
      totalCHF: total,
    };
  });

  const totalNet = round2(items.reduce((s, it) => s + it.totalCHF, 0));
  const vatCHF = round2((totalNet * vatRate) / 100);
  const totalGross = round2(totalNet + vatCHF);

  let invoiceId = "";
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const year = issued.getFullYear();
      const invoiceNumber = await generateInvoiceNumber(tx, user.companyId, year);

      const created = await tx.invoice.create({
        data: {
          companyId: user.companyId,
          invoiceNumber,
          customerId: order.customerId,
          orderId: order.id,
          status: "DRAFT",
          issuedAt: issued,
          dueAt: due,
          totalNetCHF: totalNet,
          vatRate,
          vatCHF,
          totalGrossCHF: totalGross,
          notes: `Order ${order.orderNumber}`,
          createdById: user.id,
          items: {
            create: items,
          },
        },
      });
      return created.id;
    }, TX_OPTS);
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: invoiceId,
    newValue: { fromOrder: orderId, orderNumber: order.orderNumber, totalGross },
    reason: "Created from order",
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/orders/${orderId}`);
  return { id: invoiceId };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Update DRAFT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updateDraftInvoice(invoiceId: string, input: unknown) {
  try {
    const user = await requirePerm("invoices.write");
  const data = parseOrThrow(invoiceFullSchema, input);

  const before = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, companyId: user.companyId },
    select: { status: true },
  });
  if (before.status !== "DRAFT") {
    throw new Error("Only drafts can be edited.");
  }

  const itemsCalc = data.items.map((it) => ({
    ...it,
    totalCHF: calcItemTotal(it.quantity, it.unitPriceCHF, it.discountPct),
  }));
  const totalNet = round2(itemsCalc.reduce((s, it) => s + it.totalCHF, 0));
  const vatCHF = round2((totalNet * data.core.vatRate) / 100);
  const totalGross = round2(totalNet + vatCHF);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        customerId: data.core.customerId,
        orderId: data.core.orderId ?? null,
        issuedAt: data.core.issuedAt,
        dueAt: data.core.dueAt,
        vatRate: data.core.vatRate,
        totalNetCHF: totalNet,
        vatCHF,
        totalGrossCHF: totalGross,
        notes: data.core.notes ?? null,
        items: {
          create: itemsCalc.map((it) => ({
            position: it.position,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPriceCHF: it.unitPriceCHF,
            discountPct: it.discountPct,
            totalCHF: it.totalCHF,
          })),
        },
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: invoiceId,
    newValue: { totalGross, itemCount: data.items.length },
  });

    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/invoices/${invoiceId}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An error occurred." };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Status workflow
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function changeInvoiceStatus(invoiceId: string, input: unknown) {
  const user = await requirePerm("invoices.write");
  const { toStatus, comment } = parseOrThrow(invoiceStatusChangeSchema, input);

  const before = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, companyId: user.companyId },
    include: { customer: { include: { addresses: true } } },
  });

  if (!allowedNextInvoiceStatuses(before.status).includes(toStatus)) {
    throw new Error(`Transition ${before.status} â†’ ${toStatus} not allowed.`);
  }
  if (toStatus === "PAID" && !hasPermission(user.role, "invoices.markPaid")) {
    throw new Error("No permission to mark as paid.");
  }

  const updateData: Prisma.InvoiceUpdateInput = { status: toStatus };

  // DRAFT â†’ SENT: QR-Referenz erzeugen + Adresse-Snapshot freezen + sentAt
  if (before.status === "DRAFT" && toStatus === "SENT") {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
    });
    if (!company.qrIban) {
      throw new Error(
        "No QR-IBAN configured â€” please set it in System â†’ Settings.",
      );
    }
    if (!isValidIban(company.qrIban)) {
      throw new Error("Configured QR-IBAN is invalid.");
    }

    // QR-Referenz erzeugen
    const companyDigits = digitsFromString(user.companyId).slice(0, 7);
    const invoiceDigits = digitsFromString(before.id).slice(0, 19);
    const qrRef = buildQrReference({
      companyDigits,
      invoiceDigits,
    });

    // Billing-Address-Snapshot
    const billingAddress =
      before.customer.addresses.find(
        (a) => (a.type === "BILLING" || a.type === "BOTH") && a.isDefault,
      ) ??
      before.customer.addresses.find((a) => a.type === "BILLING" || a.type === "BOTH") ??
      before.customer.addresses[0];
    const ba = billingAddress
      ? {
          name: before.customer.companyName ?? "â€”",
          street: billingAddress.street,
          zip: billingAddress.zip,
          city: billingAddress.city,
          country: billingAddress.country,
          vatNumber: before.customer.vatNumber ?? undefined,
        }
      : null;

    updateData.qrBillReference = qrRef;
    updateData.billingAddressSnapshot = ba ?? Prisma.DbNull;
    updateData.sentAt = new Date();
  }

  // OVERDUE wird automatisch beim Page-Load gesetzt â€” manueller
  // Ãœbergang ist auch erlaubt (Ã¤ndert nichts).

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: updateData,
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: invoiceId,
    oldValue: { status: before.status },
    newValue: { status: toStatus },
    reason: comment ?? null,
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Mark as Paid (mit optionalem Teilbetrag)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function markInvoicePaid(invoiceId: string, input: unknown) {
  const user = await requirePerm("invoices.markPaid");
  const data = parseOrThrow(markPaidSchema, input);

  const before = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, companyId: user.companyId },
  });
  if (!["SENT", "OVERDUE"].includes(before.status)) {
    throw new Error("Invoice can only be marked paid from status SENT/OVERDUE.");
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "PAID",
      paidAt: data.paidAt,
      paidAmountCHF: data.paidAmountCHF ?? before.totalGrossCHF,
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: invoiceId,
    newValue: { paidAt: data.paidAt, paidAmount: data.paidAmountCHF },
    reason: "Marked as paid",
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Reminder erhÃ¶hen
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function sendInvoiceReminder(invoiceId: string) {
  const user = await requirePerm("invoices.write");
  const before = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, companyId: user.companyId },
  });
  if (!["SENT", "OVERDUE"].includes(before.status)) {
    throw new Error("Reminders only make sense for open invoices.");
  }
  const newLevel = Math.min(3, before.reminderLevel + 1);
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      reminderLevel: newLevel,
      lastReminderAt: new Date(),
      status: "OVERDUE", // automatisch markieren falls noch SENT
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: invoiceId,
    newValue: { reminderLevel: newLevel },
    reason: `Reminder level ${newLevel}`,
  });
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auto-Overdue-Update
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Setzt alle SENT-Rechnungen mit dueAt in der Vergangenheit auf OVERDUE.
 * Wird beim Laden der Listen-Seite triggered (idempotent).
 *
 * companyId kommt aus der Server-Session â€” NIE aus einem Argument. Sonst
 * kÃ¶nnte ein bÃ¶swilliger Client diese Action mit einer fremden companyId
 * aufrufen und Rechnungen anderer Mandanten flippen.
 */
export async function refreshOverdueInvoices(): Promise<number> {
  const user = await requirePerm("invoices.read");
  const result = await prisma.invoice.updateMany({
    where: {
      companyId: user.companyId,
      status: "SENT",
      dueAt: { lt: new Date() },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Bulk
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function bulkArchiveInvoices(rawIds: unknown) {
  const user = await requirePerm("invoices.write");
  const ids = parseOrThrow(idsSchema, rawIds);
  await prisma.invoice.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "Invoice", entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/invoices");
}

export async function bulkDeleteDraftInvoices(rawIds: unknown) {
  const user = await requirePerm("invoices.write");
  const ids = parseOrThrow(idsSchema, rawIds);
  // Nur DRAFT lÃ¶schen â€” versendete bleiben Audit-pflichtig.
  const owned = await prisma.invoice.findMany({
    where: { id: { in: ids }, companyId: user.companyId, status: "DRAFT" },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error(
      "Only drafts can be deleted. Sent invoices are retained.",
    );
  }
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Invoice", entityId: id,
      reason: "Bulk delete (DRAFT)",
    });
  }
  await prisma.invoice.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId, status: "DRAFT" },
  });
  revalidatePath("/admin/invoices");
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Settings update (Banking)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updateInvoiceSettings(input: unknown) {
  const user = await requirePerm("settings.write");
  const data = parseOrThrow(invoiceSettingsSchema, input);

  // IBAN normalisieren + validieren
  const iban = data.qrIban.replace(/\s+/g, "").toUpperCase();
  if (iban && !isValidIban(iban)) {
    throw new Error("IBAN check digit is invalid.");
  }

  await prisma.company.update({
    where: { id: user.companyId },
    data: {
      qrIban: iban || null,
      invoiceCreditorName: data.invoiceCreditorName ?? null,
      vatNumber: data.vatNumber ?? null,
      invoicePaymentTerms: data.invoicePaymentTerms,
      invoiceDefaultVatRate: data.invoiceDefaultVatRate,
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: user.companyId,
    reason: "Invoice settings updated",
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/invoices");
}
