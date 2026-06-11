"use server";

// Server actions für die Werkstatt-Scan-Page.
//
// Sicherheits-Modell:
//   - Jede Aktion verlangt EmployeeNumber + 4-stellige PIN.
//   - Rate-Limiting + Locking via `verifyEmployeePin` (5 Fehlversuche → 5 min lock).
//   - Keine User-Session erforderlich — die Seite ist über QR-Code öffentlich
//     erreichbar, aber jede Mutation ist PIN-gesichert.
//
// Live-Sync:
//   - Nach jedem Event wird die Order-Detail-Seite revalidiert + die Scan-Page
//     selbst, sodass alle Browser binnen 5 s den neuen State sehen.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyEmployeePin, PinError } from "@/lib/pin";
import { recordAudit } from "@/lib/audit";
import {
  deriveStateFromEvents,
  isActionAllowed,
  calcStableActualMinutes,
} from "@/lib/order/step-time";
import type { ProcessStepEventType } from "@prisma/client";

// ─────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────

const scanInputSchema = z.object({
  stepId: z.string().cuid(),
  employeeNumber: z.string().trim().min(1).max(20),
  pin: z.string().regex(/^\d{4}$/, "PIN muss 4 Ziffern haben."),
  action: z.enum(["START", "PAUSE", "RESUME", "END"]),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

// ─────────────────────────────────────────
// Lookup employee by company + employeeNumber, then verify PIN
// ─────────────────────────────────────────

async function authenticateScanner(
  companyId: string,
  employeeNumber: string,
  pin: string,
) {
  const employee = await prisma.employee.findUnique({
    where: { companyId_employeeNumber: { companyId, employeeNumber } },
  });
  if (!employee || !employee.isActive || employee.deletedAt || employee.archivedAt) {
    throw new Error("Mitarbeiter:in unbekannt oder nicht aktiv.");
  }
  return verifyEmployeePin(employee.id, pin);
}

// ─────────────────────────────────────────
// Public: aktuellen Schritt-State + Stamm-Infos liefern
// ─────────────────────────────────────────

export async function getStepStatus(stepId: string) {
  const step = await prisma.processStep.findUnique({
    where: { id: stepId },
    include: {
      orderItem: {
        include: {
          order: {
            include: {
              customer: { include: { contacts: true } },
            },
          },
        },
      },
      timeEvents: {
        orderBy: { occurredAt: "asc" },
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
      },
    },
  });
  if (!step) {
    throw new Error("Prozessschritt nicht gefunden.");
  }

  const order = step.orderItem.order;
  const state = deriveStateFromEvents(step.timeEvents);

  return {
    step: {
      id: step.id,
      sequence: step.sequence,
      processCode: step.processCode,
      machineTypeRequired: step.machineTypeRequired,
      skillRequired: step.skillRequired,
      estimatedMinutes: step.estimatedMinutes,
      actualMinutes: step.actualMinutes,
      status: step.status,
      notes: step.notes,
    },
    item: {
      id: step.orderItem.id,
      position: step.orderItem.position,
      description: step.orderItem.description,
      quantity: step.orderItem.quantity,
      surfaceM2: Number(step.orderItem.surfaceM2),
      material: step.orderItem.material,
      colorCode: step.orderItem.colorCode,
    },
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      customerDisplayName:
        order.customer.companyName ??
        `${order.customer.contacts[0]?.firstName ?? ""} ${order.customer.contacts[0]?.lastName ?? ""}`.trim(),
      promisedAt: order.promisedAt,
      priority: order.priority,
    },
    scanState: state,
    events: step.timeEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
      employeeNumber: e.employee.employeeNumber,
      note: e.note,
    })),
  };
}

// ─────────────────────────────────────────
// Public: Event aufzeichnen
// ─────────────────────────────────────────

export async function recordStepScan(input: unknown) {
  const data = (() => {
    const r = scanInputSchema.safeParse(input);
    if (!r.success) {
      const issue = r.error.issues[0];
      throw new Error(issue.message);
    }
    return r.data;
  })();

  // Step + Order laden (für companyId-Bindung).
  const step = await prisma.processStep.findUnique({
    where: { id: data.stepId },
    include: {
      timeEvents: { orderBy: { occurredAt: "asc" } },
      orderItem: { include: { order: true } },
    },
  });
  if (!step) throw new Error("Schritt nicht gefunden.");

  const companyId = step.orderItem.order.companyId;

  // PIN prüfen
  let employee;
  try {
    employee = await authenticateScanner(companyId, data.employeeNumber, data.pin);
  } catch (err) {
    if (err instanceof PinError) {
      if (err.code === "LOCKED") {
        throw new Error("Zu viele Fehlversuche — PIN ist 5 Minuten gesperrt.");
      }
      if (err.code === "INACTIVE") {
        throw new Error("Mitarbeiter:in unbekannt oder nicht aktiv.");
      }
      throw new Error("Falsche PIN.");
    }
    throw err;
  }

  // Order-Status muss IN_PROGRESS sein damit Scans erlaubt sind — DRAFT/CANCELLED
  // / DELIVERED dürfen nicht mehr gescant werden.
  const orderStatus = step.orderItem.order.status;
  if (!["CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(orderStatus)) {
    throw new Error(
      `Auftrag im Status ${orderStatus} — Scans nicht erlaubt. Auftrag muss bestätigt und in Arbeit sein.`,
    );
  }

  // State-Validierung
  const currentState = deriveStateFromEvents(step.timeEvents);
  if (!isActionAllowed(currentState, data.action)) {
    throw new Error(
      `Aktion „${data.action}" im Status „${currentState}" nicht erlaubt.`,
    );
  }

  // Event speichern + ProcessStep + Order aktualisieren
  await prisma.$transaction(async (tx) => {
    await tx.processStepTimeEvent.create({
      data: {
        processStepId: step.id,
        employeeId: employee.id,
        eventType: data.action as ProcessStepEventType,
        note: data.note ?? null,
      },
    });

    // Schritt-Status anpassen + actualMinutes finalisieren bei END.
    const newEvents = [
      ...step.timeEvents,
      { eventType: data.action as ProcessStepEventType, occurredAt: new Date() },
    ];
    const newState = deriveStateFromEvents(newEvents);

    const stepUpdate: {
      status?: "PENDING" | "IN_PROGRESS" | "DONE";
      actualMinutes?: number | null;
    } = {};
    if (newState === "RUNNING" && step.status !== "IN_PROGRESS") {
      stepUpdate.status = "IN_PROGRESS";
    }
    if (newState === "DONE") {
      stepUpdate.status = "DONE";
      stepUpdate.actualMinutes = calcStableActualMinutes(newEvents) ?? 0;
    }
    if (Object.keys(stepUpdate).length > 0) {
      await tx.processStep.update({
        where: { id: step.id },
        data: stepUpdate,
      });
    }

    // Order automatisch in IN_PROGRESS setzen, falls erster Schritt startet.
    if (data.action === "START" && orderStatus === "CONFIRMED") {
      await tx.order.update({
        where: { id: step.orderItem.orderId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: step.orderItem.orderId,
          fromStatus: "CONFIRMED",
          toStatus: "IN_PROGRESS",
          // Wir haben hier keinen User — Werkstatt-Scan ist Employee-getrieben.
          // Wir loggen den Admin-User, der den Auftrag erstellt hat, als
          // technischen Trigger; der echte Verursacher steht im AuditLog.
          changedById: step.orderItem.order.createdById,
          comment: `Automatisch durch Scan: ${employee.firstName} ${employee.lastName}`,
        },
      });
    }
  });

  await recordAudit({
    companyId,
    employeeId: employee.id,
    action: "UPDATE",
    entityType: "ProcessStep",
    entityId: step.id,
    newValue: { eventType: data.action, employeeNumber: data.employeeNumber },
  });

  revalidatePath(`/scan/${step.id}`);
  revalidatePath(`/admin/orders/${step.orderItem.orderId}`);
  revalidatePath("/admin/orders");
}

// ─────────────────────────────────────────
// CEO-Action: Billing-Source pro Schritt setzen
// ─────────────────────────────────────────

const billingSchema = z.object({
  stepId: z.string().cuid(),
  billingTimeSource: z.enum(["ACTUAL", "ESTIMATED", "MANUAL"]),
  billedMinutes: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().int().min(0).max(60_000).nullable(),
    )
    .optional(),
});

export async function setStepBilling(input: unknown) {
  const { auth } = await import("@/lib/auth");
  const { hasPermission } = await import("@/lib/permissions");

  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "orders.write")) {
    throw new Error("Keine Berechtigung.");
  }
  // Nur ADMIN darf Billing-Source ändern.
  if (session.user.role !== "ADMIN") {
    throw new Error("Nur ADMIN darf die Verrechnungs-Quelle ändern.");
  }

  const r = billingSchema.safeParse(input);
  if (!r.success) {
    throw new Error(r.error.issues[0].message);
  }
  const { stepId, billingTimeSource, billedMinutes } = r.data;

  const step = await prisma.processStep.findUnique({
    where: { id: stepId },
    include: { orderItem: { include: { order: true } } },
  });
  if (!step) throw new Error("Schritt nicht gefunden.");
  if (step.orderItem.order.companyId !== session.user.companyId) {
    throw new Error("Keine Berechtigung.");
  }

  if (billingTimeSource === "MANUAL" && billedMinutes == null) {
    throw new Error("Bei MANUAL muss eine Minutenzahl angegeben werden.");
  }

  await prisma.processStep.update({
    where: { id: stepId },
    data: {
      billingTimeSource,
      billedMinutes: billingTimeSource === "MANUAL" ? billedMinutes! : null,
    },
  });

  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "ProcessStep",
    entityId: stepId,
    newValue: { billingTimeSource, billedMinutes },
    reason: "Billing source updated",
  });

  revalidatePath(`/admin/orders/${step.orderItem.orderId}`);
  revalidatePath("/admin/orders");
}
