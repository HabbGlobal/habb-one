"use server";

// Order server actions. All mutations:
//   1. require permission via `lib/permissions.ts`,
//   2. validate input via Zod (errors mapped to German messages),
//   3. run inside a Prisma transaction when multiple rows change,
//   4. write an `AuditLog` entry + an `OrderStatusHistory` row on transitions.
//
// Snapshot-Regeln (siehe docs/parameters.md):
//   • DRAFT          → liest LIVE-Parameter, recalc bei jeder Änderung
//   • CONFIRMED+     → friert `parameterSnapshot` ein, danach unveränderlich

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  idsSchema,
  orderFullSchema,
  orderItemSchema,
  orderStatusChangeSchema,
} from "@/lib/validation/order";
import { generateOrderNumber } from "@/lib/order/numbering";
import { expandTemplate, PROCESS_RESOURCES } from "@/lib/order/process-templates";
import {
  suggestProcessSteps,
  type SuggestionInput,
} from "@/lib/order/process-suggestion";
import {
  loadAllParams,
  snapshotKeys,
  type SystemParameterMap,
} from "@/lib/domain/parameters/store";
import {
  calcOrderItemPrice,
  calcProcessStepMinutes,
  type PriceStepInput,
} from "@/lib/domain/calculation";
import { allowedNextStatuses } from "@/lib/dto/order";

// ─────────────────────────────────────────
// Transaction timeouts
// ─────────────────────────────────────────
//
// Default Prisma-Transaktions-Timeout sind 5 s; das reicht über Supabase
// (Singapore, ~200 ms RTT) bei verschachtelten Order-Creates (Order +
// OrderItem + ProcessStep[] + OrderStatusHistory) nicht. Wir setzen
// grosszügig 30 s damit auch Aufträge mit vielen Positionen durchgehen.
const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

// ─────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────

async function requirePerm(perm: Permission) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, perm)) {
    throw new Error("Keine Berechtigung.");
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
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "Feld";
      if (target.includes("orderNumber")) {
        return "Diese Auftragsnummer existiert bereits — bitte erneut versuchen.";
      }
      return `Eindeutigkeits-Konflikt: ${target}`;
    }
    if (err.code === "P2025") return "Datensatz nicht gefunden.";
  }
  return null;
}

// ─────────────────────────────────────────
// Calc helpers
// ─────────────────────────────────────────

function computeStepMinutes(
  step: { processCode: Parameters<typeof calcProcessStepMinutes>[0]["processCode"] },
  item: { surfaceM2: number; material: Parameters<typeof calcProcessStepMinutes>[0]["material"]; complexity: Parameters<typeof calcProcessStepMinutes>[0]["complexity"] },
  params: SystemParameterMap,
): number {
  return calcProcessStepMinutes({
    processCode: step.processCode,
    surfaceM2: item.surfaceM2,
    material: item.material,
    complexity: item.complexity,
    params,
  });
}

function computeOrderTotals(
  items: z.infer<typeof orderItemSchema>[],
  params: SystemParameterMap,
  isExpress: boolean,
  customerDiscountPct: number,
): { totalNetCHF: number; perItemSteps: number[][] } {
  let totalNetCHF = 0;
  const perItemSteps: number[][] = [];
  for (const it of items) {
    const stepMinutes: PriceStepInput[] = it.steps.map((s) => {
      const mins = computeStepMinutes(
        { processCode: s.processCode },
        { surfaceM2: it.surfaceM2, material: it.material, complexity: it.complexity },
        params,
      );
      return {
        processCode: s.processCode,
        estimatedMinutes: mins,
        machineType: s.machineTypeRequired ?? undefined,
      };
    });
    perItemSteps.push(stepMinutes.map((s) => s.estimatedMinutes));
    const price = calcOrderItemPrice({
      steps: stepMinutes,
      params,
      customerDiscountPct,
      isExpress,
    });
    // Sum per quantity (each piece is calculated identically).
    totalNetCHF += price.totalNetCHF * it.quantity;
  }
  return { totalNetCHF: Math.round(totalNetCHF * 100) / 100, perItemSteps };
}

// ─────────────────────────────────────────
// Create
// ─────────────────────────────────────────

export async function createOrder(input: unknown) {
  const user = await requirePerm("orders.write");
  const data = parseOrThrow(orderFullSchema, input);

  // Verify customer ownership.
  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: data.core.customerId, companyId: user.companyId },
    select: { id: true, defaultDiscount: true },
  });
  const discountPct = customer.defaultDiscount ? Number(customer.defaultDiscount) : 0;

  const params = await loadAllParams(prisma, user.companyId);
  const isExpress = data.core.priority === "EXPRESS";
  const totals = computeOrderTotals(data.items, params, isExpress, discountPct);

  let orderId = "";
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const orderNumber = await generateOrderNumber(tx, user.companyId, year);

      const created = await tx.order.create({
        data: {
          companyId: user.companyId,
          orderNumber,
          customerId: customer.id,
          contactPersonId: data.core.contactPersonId ?? null,
          shippingAddressId: data.core.shippingAddressId ?? null,
          billingAddressId: data.core.billingAddressId ?? null,
          status: "DRAFT",
          priority: data.core.priority,
          receivedAt: data.core.receivedAt,
          promisedAt: data.core.promisedAt,
          internalDeadline: data.core.internalDeadline ?? null,
          notes: data.core.notes ?? null,
          customerNotes: data.core.customerNotes ?? null,
          totalNetCHF: totals.totalNetCHF,
          createdById: user.id,
          items: {
            create: data.items.map((it, idx) => ({
              position: it.position,
              description: it.description,
              quantity: it.quantity,
              surfaceM2: it.surfaceM2,
              weightKg: it.weightKg ?? null,
              thicknessMm: it.thicknessMm ?? null,
              material: it.material,
              complexity: it.complexity,
              colorCode: it.colorCode ?? null,
              colorSystem: it.colorSystem ?? null,
              glossLevel: it.glossLevel ?? null,
              applicationArea: it.applicationArea ?? null,
              unitPriceCHF: it.unitPriceCHF ?? null,
              notes: it.notes ?? null,
              processSteps: {
                create: it.steps.map((st, sIdx) => ({
                  sequence: st.sequence,
                  processCode: st.processCode,
                  machineTypeRequired: st.machineTypeRequired ?? null,
                  skillRequired: st.skillRequired,
                  estimatedMinutes: totals.perItemSteps[idx][sIdx],
                  waitMinutesAfter: st.waitMinutesAfter,
                  notes: st.notes ?? null,
                })),
              },
            })),
          },
          statusHistory: {
            create: [
              {
                fromStatus: null,
                toStatus: "DRAFT",
                changedById: user.id,
                comment: "Auftrag erfasst",
              },
            ],
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
    entityType: "Order",
    entityId: orderId,
    newValue: {
      customerId: customer.id,
      itemCount: data.items.length,
      totalNetCHF: totals.totalNetCHF,
    },
  });

  revalidatePath("/admin/orders");
  return { id: orderId };
}

// ─────────────────────────────────────────
// Update DRAFT order (full payload — items rebuilt)
// ─────────────────────────────────────────

export async function updateDraftOrder(orderId: string, input: unknown) {
  const user = await requirePerm("orders.write");
  const data = parseOrThrow(orderFullSchema, input);

  const before = await prisma.order.findFirstOrThrow({
    where: { id: orderId, companyId: user.companyId },
    select: { status: true, customerId: true },
  });
  if (before.status !== "DRAFT") {
    throw new Error("Nur DRAFT-Aufträge können vollständig editiert werden.");
  }

  const customer = await prisma.customer.findFirstOrThrow({
    where: { id: data.core.customerId, companyId: user.companyId },
    select: { defaultDiscount: true },
  });
  const discountPct = customer.defaultDiscount ? Number(customer.defaultDiscount) : 0;

  const params = await loadAllParams(prisma, user.companyId);
  const isExpress = data.core.priority === "EXPRESS";
  const totals = computeOrderTotals(data.items, params, isExpress, discountPct);

  await prisma.$transaction(async (tx) => {
    // Items + Steps werden komplett neu aufgebaut — einfacher als Diff,
    // bleibt korrekt weil DRAFT noch nicht in der Planung ist.
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.order.update({
      where: { id: orderId },
      data: {
        customerId: data.core.customerId,
        contactPersonId: data.core.contactPersonId ?? null,
        shippingAddressId: data.core.shippingAddressId ?? null,
        billingAddressId: data.core.billingAddressId ?? null,
        priority: data.core.priority,
        receivedAt: data.core.receivedAt,
        promisedAt: data.core.promisedAt,
        internalDeadline: data.core.internalDeadline ?? null,
        notes: data.core.notes ?? null,
        customerNotes: data.core.customerNotes ?? null,
        totalNetCHF: totals.totalNetCHF,
        items: {
          create: data.items.map((it, idx) => ({
            position: it.position,
            description: it.description,
            quantity: it.quantity,
            surfaceM2: it.surfaceM2,
            weightKg: it.weightKg ?? null,
            thicknessMm: it.thicknessMm ?? null,
            material: it.material,
            complexity: it.complexity,
            colorCode: it.colorCode ?? null,
            colorSystem: it.colorSystem ?? null,
            glossLevel: it.glossLevel ?? null,
            applicationArea: it.applicationArea ?? null,
            unitPriceCHF: it.unitPriceCHF ?? null,
            notes: it.notes ?? null,
            processSteps: {
              create: it.steps.map((st, sIdx) => ({
                sequence: st.sequence,
                processCode: st.processCode,
                machineTypeRequired: st.machineTypeRequired ?? null,
                skillRequired: st.skillRequired,
                estimatedMinutes: totals.perItemSteps[idx][sIdx],
                waitMinutesAfter: st.waitMinutesAfter,
                notes: st.notes ?? null,
              })),
            },
          })),
        },
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Order",
    entityId: orderId,
    newValue: { totalNetCHF: totals.totalNetCHF, itemCount: data.items.length },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

// ─────────────────────────────────────────
// Status workflow
// ─────────────────────────────────────────

export async function changeOrderStatus(orderId: string, input: unknown) {
  const user = await requirePerm("orders.write");
  const { toStatus, comment } = parseOrThrow(orderStatusChangeSchema, input);

  const before = await prisma.order.findFirstOrThrow({
    where: { id: orderId, companyId: user.companyId },
  });

  // Special permissions per transition
  if (toStatus === "CONFIRMED" && !hasPermission(user.role, "orders.confirm")) {
    throw new Error("Keine Berechtigung zum Bestätigen.");
  }
  if (toStatus === "CANCELLED" && !hasPermission(user.role, "orders.cancel")) {
    throw new Error("Keine Berechtigung zum Stornieren.");
  }

  if (!allowedNextStatuses(before.status).includes(toStatus)) {
    throw new Error(
      `Übergang ${before.status} → ${toStatus} nicht erlaubt.`,
    );
  }

  // Snapshot freezes at DRAFT → CONFIRMED.
  let snapshot: Record<string, string> | undefined;
  if (before.status === "DRAFT" && toStatus === "CONFIRMED") {
    const params = await loadAllParams(prisma, user.companyId);
    const allKeys = params.keys();
    const relevant = snapshotKeys(allKeys);
    const full = params.serialize();
    snapshot = Object.fromEntries(
      relevant.map((k) => [k, full[k]]).filter(([, v]) => v != null),
    ) as Record<string, string>;
  }

  // Auto timestamps per status
  const now = new Date();
  const stamps: Record<string, Date | null> = {};
  if (toStatus === "IN_PROGRESS" && !before.startedAt) stamps.startedAt = now;
  if (toStatus === "COMPLETED" && !before.completedAt) stamps.completedAt = now;
  if (toStatus === "DELIVERED" && !before.deliveredAt) stamps.deliveredAt = now;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        ...stamps,
        ...(snapshot ? { parameterSnapshot: snapshot } : {}),
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: before.status,
        toStatus,
        changedById: user.id,
        comment: comment ?? null,
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Order",
    entityId: orderId,
    oldValue: { status: before.status },
    newValue: { status: toStatus, snapshotFrozen: !!snapshot },
    reason: comment ?? null,
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

// ─────────────────────────────────────────
// Single OrderItem update (DRAFT only)
// ─────────────────────────────────────────

export async function updateOrderItem(
  itemId: string,
  input: unknown,
) {
  const user = await requirePerm("orders.write");
  const data = parseOrThrow(orderItemSchema, input);

  const before = await prisma.orderItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { order: true },
  });
  if (before.order.companyId !== user.companyId) throw new Error("Keine Berechtigung.");
  if (before.order.status !== "DRAFT") {
    throw new Error("Position kann nur im Status DRAFT geändert werden.");
  }

  const params = await loadAllParams(prisma, user.companyId);
  // Recalc step minutes for this item
  const stepMinutes = data.steps.map((s) =>
    computeStepMinutes(
      { processCode: s.processCode },
      { surfaceM2: data.surfaceM2, material: data.material, complexity: data.complexity },
      params,
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.processStep.deleteMany({ where: { orderItemId: itemId } });
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        position: data.position,
        description: data.description,
        quantity: data.quantity,
        surfaceM2: data.surfaceM2,
        weightKg: data.weightKg ?? null,
        thicknessMm: data.thicknessMm ?? null,
        material: data.material,
        complexity: data.complexity,
        colorCode: data.colorCode ?? null,
        colorSystem: data.colorSystem ?? null,
        glossLevel: data.glossLevel ?? null,
        unitPriceCHF: data.unitPriceCHF ?? null,
        notes: data.notes ?? null,
        processSteps: {
          create: data.steps.map((st, idx) => ({
            sequence: st.sequence,
            processCode: st.processCode,
            machineTypeRequired: st.machineTypeRequired ?? null,
            skillRequired: st.skillRequired,
            estimatedMinutes: stepMinutes[idx],
            waitMinutesAfter: st.waitMinutesAfter,
            notes: st.notes ?? null,
          })),
        },
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrderItem",
    entityId: itemId,
  });

  revalidatePath(`/admin/orders/${before.orderId}`);
}

// ─────────────────────────────────────────
// Process-template apply (returns step skeletons; client wires into form)
// ─────────────────────────────────────────

export async function applyProcessTemplate(args: { templateId: string }) {
  const user = await requirePerm("orders.write");

  // Priorität 1: DB-Vorlage (kann Admin editieren).
  // ID kann entweder die DB-cuid sein ODER ein stabiler Code-Key wie
  // "powder-standard" — in dem Fall lookup via key.
  const dbTpl = args.templateId.length > 20
    ? await prisma.processTemplate.findFirst({
        where: { id: args.templateId, companyId: user.companyId, deletedAt: null },
        include: { steps: { orderBy: { sequence: "asc" } } },
      })
    : await prisma.processTemplate.findFirst({
        where: {
          companyId: user.companyId,
          key: args.templateId,
          deletedAt: null,
        },
        include: { steps: { orderBy: { sequence: "asc" } } },
      });

  if (dbTpl) {
    return dbTpl.steps.map((s, i) => ({
      sequence: (i + 1) * 10,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      waitMinutesAfter: s.defaultWaitMinutes,
    }));
  }

  // Fallback: Code-Vorlage (sollte nach Seed nicht vorkommen)
  const skeletons = expandTemplate(args.templateId);
  return skeletons;
}

/** Returns the static resource map — used by the wizard so it can show
 *  a default skill/machine when the user adds a step manually. */
export async function getProcessResources() {
  await requirePerm("orders.read");
  return PROCESS_RESOURCES;
}

// ─────────────────────────────────────────
// Bulk lifecycle
// ─────────────────────────────────────────

async function authorizeBulk(ids: string[]) {
  const user = await requirePerm("orders.write");
  const owned = await prisma.order.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true, status: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("Mindestens ein Auftrag gehört nicht zu dieser Firma.");
  }
  return { user, owned };
}

export async function bulkArchiveOrders(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const { user, owned } = await authorizeBulk(ids);
  const blocked = owned.filter((o) =>
    ["IN_PROGRESS", "ON_HOLD"].includes(o.status),
  );
  if (blocked.length > 0) {
    throw new Error(
      "Aufträge in Arbeit können nicht archiviert werden — bitte zuerst abschliessen oder stornieren.",
    );
  }
  await prisma.order.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "Order", entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/orders");
}

export async function bulkDeleteOrders(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const { user } = await authorizeBulk(ids);
  await prisma.order.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { deletedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Order", entityId: id,
      reason: "Bulk soft-delete (revDSG)",
    });
  }
  revalidatePath("/admin/orders");
}

export async function bulkRestoreOrders(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const { user } = await authorizeBulk(ids);
  await prisma.order.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: null, deletedAt: null },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "Order", entityId: id,
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/orders");
}

export async function bulkHardDeleteOrders(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const { user } = await authorizeBulk(ids);
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Order", entityId: id,
      reason: "Bulk hard delete",
    });
  }
  await prisma.order.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId },
  });
  revalidatePath("/admin/orders");
}

// ─────────────────────────────────────────
// Spritzwerk-Recommender — Schritte vorschlagen
// (analog zu recommendQuoteProcessSteps)
// ─────────────────────────────────────────

const recommendOrderSchema = z.object({
  material: z.enum([
    "STEEL_S235", "STEEL_HIGH_C", "STAINLESS", "ALUMINIUM",
    "GALVANIZED", "CAST_IRON", "OTHER",
  ]),
  complexity: z.enum(["SIMPLE", "NORMAL", "COMPLEX", "VERY_COMPLEX"]).nullable().optional(),
  applicationArea: z.enum(["INDOOR", "OUTDOOR", "BOTH"]).nullable().optional(),
  glossLevel: z.enum(["MATT", "SEMI_GLOSS", "GLOSSY", "HIGH_GLOSS"]).nullable().optional(),
  colorSystem: z.enum(["RAL", "NCS", "PANTONE", "CUSTOM"]).nullable().optional(),
  coatingMode: z.enum(["WET_PAINT", "POWDER"]).nullable().optional(),
});

export async function recommendOrderProcessSteps(input: unknown) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "orders.read")) {
    throw new Error("Keine Berechtigung 'Aufträge lesen'.");
  }
  const data = recommendOrderSchema.parse(input);
  const result = suggestProcessSteps(data as SuggestionInput);
  return {
    steps: result.steps.map((s) => ({
      sequence: s.sequence,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      waitMinutesAfter: s.waitMinutesAfter,
      rationale: s.rationale,
    })),
    warnings: result.warnings,
  };
}
