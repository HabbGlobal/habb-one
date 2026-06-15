"use server";

// Auto-Scheduler Server Actions.
//
// Pattern wie bei den anderen ERP-Aktionen:
//   1) Auth + Permission ("schedule.write")
//   2) DB-Daten laden, in pure Inputs Ã¼berfÃ¼hren
//   3) `runScheduler` aufrufen
//   4) VorschlÃ¤ge in OrderScheduleEntry persistieren
//   5) Konflikte als ScheduleConflict speichern
//   6) AuditLog
//   7) revalidatePath

import { revalidatePath } from "next/cache";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  runScheduler,
  type SchedulableOrder,
  type SchedulableStep,
  type SchedulerResult,
} from "@/lib/scheduler/scheduler";
import {
  parseWorkingHours,
  DEFAULT_WORKING_HOURS,
  type BlackoutInterval,
} from "@/lib/scheduler/calendar";
import type { MachineRow, Booking } from "@/lib/scheduler/resource-graph";

const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auth helper
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "schedule.write")) {
    throw new Error("No permission.");
  }
  return session.user;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Loader: DB â†’ Pure-Scheduler-Inputs
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface LoadResult {
  orders: SchedulableOrder[];
  machines: MachineRow[];
  holidays: Set<string>;
  qualifiedSkills: Set<string>;
}

async function loadSchedulerInputs(
  companyId: string,
  orderFilter: { id?: string; statuses?: string[] },
): Promise<LoadResult> {
  // Maschinen + Wartung
  const machineRows = await prisma.machine.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    include: {
      maintenanceWindows: true,
      scheduleEntries: {
        select: {
          id: true,
          plannedStart: true,
          plannedEnd: true,
          isLocked: true,
          processStep: { select: { id: true } },
        },
      },
    },
  });

  const machines: MachineRow[] = machineRows.map((m) => {
    const blackouts: BlackoutInterval[] = m.maintenanceWindows.map((w) => ({
      start: w.startsAt,
      end: w.endsAt,
    }));
    // Bookings: existierende Schedule-Entries â€” locked werden 1:1 Ã¼bernommen,
    // unlocked werden spÃ¤ter (beim Re-Plan) gelÃ¶scht und durch neue VorschlÃ¤ge
    // ersetzt. Wir schlieÃŸen unlocked aus damit die Slot-Suche nicht denkt
    // sie wÃ¤ren besetzt.
    const bookings: Booking[] = m.scheduleEntries
      .filter((e) => e.isLocked)
      .map((e) => ({
        entryId: e.id,
        start: e.plannedStart,
        end: e.plannedEnd,
        isLocked: true,
      }));
    return {
      id: m.id,
      name: m.name,
      type: m.type,
      workingHours: parseWorkingHours(m.workingHours),
      blackouts,
      bookings,
    };
  });

  // AuftrÃ¤ge â€” Customer ebenfalls filtern, damit AuftrÃ¤ge gelÃ¶schter
  // Kunden nicht im Werkstatt-Plan auftauchen (Lifecycle-Konsistenz).
  const orderWhere: Prisma.OrderWhereInput = {
    companyId,
    archivedAt: null,
    deletedAt: null,
    customer: { deletedAt: null },
    ...(orderFilter.id ? { id: orderFilter.id } : {}),
    ...(orderFilter.statuses
      ? { status: { in: orderFilter.statuses as OrderStatus[] } }
      : {}),
  };

  const orderRows = await prisma.order.findMany({
    where: orderWhere,
    include: {
      items: {
        include: { processSteps: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const orders: SchedulableOrder[] = orderRows.map((o) => {
    const steps: SchedulableStep[] = [];
    for (const item of o.items) {
      const sortedSteps = [...item.processSteps].sort(
        (a, b) => a.sequence - b.sequence,
      );
      for (const s of sortedSteps) {
        steps.push({
          id: s.id,
          orderItemId: item.id,
          globalSequence: item.position * 1_000 + s.sequence,
          estimatedMinutes: s.estimatedMinutes,
          waitMinutesAfter: s.waitMinutesAfter,
          machineTypeRequired: s.machineTypeRequired,
          skillRequired: s.skillRequired,
        });
      }
    }
    steps.sort((a, b) => a.globalSequence - b.globalSequence);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      priority: o.priority,
      promisedAt: o.promisedAt,
      internalDeadline: o.internalDeadline,
      steps,
    };
  });

  // Feiertage als YYYY-MM-DD
  const holidayRows = await prisma.holiday.findMany({
    where: { companyId },
    select: { date: true },
  });
  const holidays = new Set<string>(
    holidayRows.map((h) => h.date.toISOString().slice(0, 10)),
  );

  // Skill-Inventar: alle Skill-Codes, die im aktiven Personalbestand
  // mindestens einmal vorhanden sind. Quellen:
  //   - EmployeeSkill direkt am Employee (neue Quelle aus PR 6)
  //   - UserSkill via User der mit einem Employee verknÃ¼pft ist (Legacy)
  // Aktiv heisst: Employee.isActive + nicht archiviert/gelÃ¶scht.
  const [employeeSkills, userSkills] = await Promise.all([
    prisma.employeeSkill.findMany({
      where: {
        employee: {
          companyId,
          isActive: true,
          archivedAt: null,
          deletedAt: null,
        },
      },
      select: { skillCode: true },
    }),
    prisma.userSkill.findMany({
      where: {
        user: {
          companyId,
          isActive: true,
          deletedAt: null,
          lockedAt: null,
          employee: { isActive: true, archivedAt: null, deletedAt: null },
        },
      },
      select: { skillCode: true },
    }),
  ]);
  const qualifiedSkills = new Set<string>([
    ...employeeSkills.map((s) => s.skillCode),
    ...userSkills.map((s) => s.skillCode),
  ]);

  return { orders, machines, holidays, qualifiedSkills };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Persist: VorschlÃ¤ge â†’ DB
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function persistProposals(
  companyId: string,
  userId: string,
  result: SchedulerResult,
  options: { onlyOrderId?: string; statuses?: string[] },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1) Bestehende NICHT-locked Schedule-Entries aller betroffenen AuftrÃ¤ge lÃ¶schen
    const orderIdsTouched = new Set(result.proposed.map((p) => p.stepId));
    if (orderIdsTouched.size === 0) return;

    // Map stepId â†’ orderId via DB
    const steps = await tx.processStep.findMany({
      where: { id: { in: [...orderIdsTouched] } },
      select: { id: true, orderItem: { select: { orderId: true } } },
    });
    const orderIds = [...new Set(steps.map((s) => s.orderItem.orderId))];

    await tx.orderScheduleEntry.deleteMany({
      where: {
        orderId: { in: orderIds },
        isLocked: false,
      },
    });

    // 2) VorschlÃ¤ge eintragen
    for (const p of result.proposed) {
      const step = steps.find((s) => s.id === p.stepId);
      if (!step) continue;
      // Skip falls Step bereits einen locked Eintrag hat
      const existing = await tx.orderScheduleEntry.findFirst({
        where: { processStepId: p.stepId, isLocked: true },
        select: { id: true },
      });
      if (existing) continue;

      await tx.orderScheduleEntry.create({
        data: {
          processStepId: p.stepId,
          orderId: step.orderItem.orderId,
          machineId: p.machineId,
          plannedStart: p.plannedStart,
          plannedEnd: p.plannedEnd,
          isAutoPlanned: true,
          isLocked: false,
        },
      });
    }

    // 3) Konflikte schreiben â€” alte Konflikte fÃ¼r betroffene AuftrÃ¤ge erst lÃ¶schen
    await tx.scheduleConflict.deleteMany({
      where: {
        entry: { orderId: { in: orderIds } },
        resolvedAt: null,
      },
    });
    for (const c of result.conflicts) {
      // Konflikt braucht eine OrderScheduleEntry-ID â€” wir hÃ¤ngen ihn an den
      // ersten Eintrag des betroffenen Auftrags.
      const firstEntry = await tx.orderScheduleEntry.findFirst({
        where: { orderId: c.orderId },
        select: { id: true },
      });
      if (!firstEntry) continue;
      await tx.scheduleConflict.create({
        data: {
          scheduleEntryId: firstEntry.id,
          type: c.type,
          severity: c.severity,
          message: c.message,
        },
      });
    }
  }, TX_OPTS);

  await recordAudit({
    companyId,
    userId,
    action: "UPDATE",
    entityType: "Order",
    entityId: options.onlyOrderId ?? null,
    reason: options.onlyOrderId
      ? `Auto-Scheduling for order ${options.onlyOrderId}`
      : `Auto-Scheduling Bulk (${result.proposed.length} steps, ${result.conflicts.length} conflicts)`,
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public Actions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Plant einen einzelnen Auftrag neu. Locked-EintrÃ¤ge bleiben unverÃ¤ndert,
 * alle anderen EintrÃ¤ge werden gelÃ¶scht und aus dem aktuellen Vorschlag
 * neu erzeugt.
 */
export async function scheduleOrder(orderId: string): Promise<{
  proposedCount: number;
  conflictCount: number;
}> {
  const user = await requireWriter();

  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: user.companyId },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("Auftrag nicht gefunden.");
  if (!["CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(order.status)) {
    throw new Error(
      `Auftrag im Status ${order.status} kann nicht geplant werden â€” nur CONFIRMED/IN_PROGRESS/ON_HOLD.`,
    );
  }

  const inputs = await loadSchedulerInputs(user.companyId, { id: orderId });
  // Bei Single-Order-Plan brauchen wir auch die Buchungen aller anderen
  // AuftrÃ¤ge auf den Maschinen (unlocked) â€” sonst denkt der Scheduler
  // die Maschinen wÃ¤ren leer und Ã¼berbucht.
  await mergeInOtherBookings(user.companyId, inputs);

  const result = runScheduler(inputs, {
    now: new Date(),
    bufferDays: 1,
    ignoreExistingAutoSchedule: false,
  });

  await persistProposals(user.companyId, user.id, result, { onlyOrderId: orderId });

  revalidatePath("/admin/scheduler");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { proposedCount: result.proposed.length, conflictCount: result.conflicts.length };
}

/**
 * Plant alle aktiven AuftrÃ¤ge (CONFIRMED/IN_PROGRESS/ON_HOLD) der Firma
 * komplett neu. Locked-EintrÃ¤ge bleiben.
 */
export async function scheduleAll(): Promise<{
  proposedCount: number;
  conflictCount: number;
  orderCount: number;
}> {
  const user = await requireWriter();

  const inputs = await loadSchedulerInputs(user.companyId, {
    statuses: ["CONFIRMED", "IN_PROGRESS", "ON_HOLD"],
  });

  const result = runScheduler(inputs, {
    now: new Date(),
    bufferDays: 1,
    ignoreExistingAutoSchedule: false,
  });

  await persistProposals(user.companyId, user.id, result, {
    statuses: ["CONFIRMED", "IN_PROGRESS", "ON_HOLD"],
  });

  revalidatePath("/admin/scheduler");
  revalidatePath("/admin/orders");
  return {
    proposedCount: result.proposed.length,
    conflictCount: result.conflicts.length,
    orderCount: inputs.orders.length,
  };
}

/**
 * Bei Single-Order-Planung: lade die Buchungen aller anderen aktiven
 * AuftrÃ¤ge dazu, damit unsere Slot-Suche sie als belegt erkennt.
 */
async function mergeInOtherBookings(companyId: string, inputs: LoadResult) {
  const otherEntries = await prisma.orderScheduleEntry.findMany({
    where: {
      order: {
        companyId,
        archivedAt: null,
        deletedAt: null,
        status: { in: ["CONFIRMED", "IN_PROGRESS", "ON_HOLD"] },
        // Alle ausser denen die wir gerade neu planen
        id: { notIn: inputs.orders.map((o) => o.id) },
      },
    },
    select: {
      id: true,
      machineId: true,
      plannedStart: true,
      plannedEnd: true,
      isLocked: true,
    },
  });
  const byMachine = new Map<string, typeof otherEntries>();
  for (const e of otherEntries) {
    if (!e.machineId) continue;
    const arr = byMachine.get(e.machineId) ?? [];
    arr.push(e);
    byMachine.set(e.machineId, arr);
  }
  for (const m of inputs.machines) {
    const adds = byMachine.get(m.id) ?? [];
    for (const e of adds) {
      m.bookings.push({
        entryId: e.id,
        start: e.plannedStart,
        end: e.plannedEnd,
        isLocked: e.isLocked,
      });
    }
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lock / Unlock
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function lockScheduleEntry(entryId: string) {
  const user = await requireWriter();
  const entry = await prisma.orderScheduleEntry.findUnique({
    where: { id: entryId },
    include: { order: { select: { companyId: true, id: true } } },
  });
  if (!entry || entry.order.companyId !== user.companyId) {
    throw new Error("Eintrag nicht gefunden.");
  }
  await prisma.orderScheduleEntry.update({
    where: { id: entryId },
    data: { isLocked: true },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrderScheduleEntry",
    entityId: entryId,
    reason: "Lock",
  });
  revalidatePath("/admin/scheduler");
  revalidatePath(`/admin/orders/${entry.order.id}`);
}

export async function unlockScheduleEntry(entryId: string) {
  const user = await requireWriter();
  const entry = await prisma.orderScheduleEntry.findUnique({
    where: { id: entryId },
    include: { order: { select: { companyId: true, id: true } } },
  });
  if (!entry || entry.order.companyId !== user.companyId) {
    throw new Error("Eintrag nicht gefunden.");
  }
  await prisma.orderScheduleEntry.update({
    where: { id: entryId },
    data: { isLocked: false },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "OrderScheduleEntry",
    entityId: entryId,
    reason: "Unlock",
  });
  revalidatePath("/admin/scheduler");
  revalidatePath(`/admin/orders/${entry.order.id}`);
}

/** Komplette Planung eines Auftrags lÃ¶schen (auch locked). */
export async function clearOrderSchedule(orderId: string) {
  const user = await requireWriter();
  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: user.companyId },
    select: { id: true },
  });
  if (!order) throw new Error("Auftrag nicht gefunden.");

  await prisma.orderScheduleEntry.deleteMany({
    where: { orderId },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "DELETE",
    entityType: "Order",
    entityId: orderId,
    reason: "Schedule cleared",
  });
  revalidatePath("/admin/scheduler");
  revalidatePath(`/admin/orders/${orderId}`);
}
