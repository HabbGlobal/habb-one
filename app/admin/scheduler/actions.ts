"use server";

// Auto-Scheduler Server Actions.
//
// Pattern like other ERP actions:
//   1) Auth + permission ("schedule.write")
//   2) Load DB data → convert into pure inputs
//   3) Call `runScheduler`
//   4) Persist proposals into OrderScheduleEntry
//   5) Store conflicts in ScheduleConflict
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

// ───────────────────────────────
// Auth helper
// ───────────────────────────────

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "schedule.write")) {
    throw new Error("No permission.");
  }
  return session.user;
}

// ───────────────────────────────
// Loader: DB → Pure Scheduler Inputs
// ───────────────────────────────

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
  // Machines + maintenance
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

    // Bookings: existing schedule entries
    // locked → treated as fixed bookings
    // unlocked → ignored for capacity calculation (will be regenerated)
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

  // Orders
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
          globalSequence: item.position * 1000 + s.sequence,
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

  // Holidays
  const holidayRows = await prisma.holiday.findMany({
    where: { companyId },
    select: { date: true },
  });

  const holidays = new Set<string>(
    holidayRows.map((h) => h.date.toISOString().slice(0, 10)),
  );

  // Skill inventory
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

// ───────────────────────────────
// Persist: proposals → DB
// ───────────────────────────────

async function persistProposals(
  companyId: string,
  userId: string,
  result: SchedulerResult,
  options: { onlyOrderId?: string; statuses?: string[] },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const stepIds = new Set(result.proposed.map((p) => p.stepId));
    if (stepIds.size === 0) return;

    const steps = await tx.processStep.findMany({
      where: { id: { in: [...stepIds] } },
      select: { id: true, orderItem: { select: { orderId: true } } },
    });

    const orderIds = [...new Set(steps.map((s) => s.orderItem.orderId))];

    // delete non-locked schedules
    await tx.orderScheduleEntry.deleteMany({
      where: {
        orderId: { in: orderIds },
        isLocked: false,
      },
    });

    // insert proposals
    for (const p of result.proposed) {
      const step = steps.find((s) => s.id === p.stepId);
      if (!step) continue;

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

    // conflicts
    await tx.scheduleConflict.deleteMany({
      where: {
        entry: { orderId: { in: orderIds } },
        resolvedAt: null,
      },
    });

    for (const c of result.conflicts) {
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

// ───────────────────────────────
// Public Actions
// ───────────────────────────────

/**
 * Re-schedule a single order.
 * Locked entries remain unchanged; all others are regenerated.
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

  if (!order) throw new Error("Order not found.");

  if (!["CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(order.status)) {
    throw new Error(
      `Order status ${order.status} cannot be scheduled — only CONFIRMED/IN_PROGRESS/ON_HOLD allowed.`,
    );
  }

  const inputs = await loadSchedulerInputs(user.companyId, { id: orderId });
  await mergeInOtherBookings(user.companyId, inputs);

  const result = runScheduler(inputs, {
    now: new Date(),
    bufferDays: 1,
    ignoreExistingAutoSchedule: false,
  });

  await persistProposals(user.companyId, user.id, result, {
    onlyOrderId: orderId,
  });

  revalidatePath("/admin/scheduler");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");

  return {
    proposedCount: result.proposed.length,
    conflictCount: result.conflicts.length,
  };
}

/**
 * Re-schedule all active orders.
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
 * Merge bookings from other active orders
 * so slot search respects real capacity usage.
 */
async function mergeInOtherBookings(companyId: string, inputs: LoadResult) {
  const otherEntries = await prisma.orderScheduleEntry.findMany({
    where: {
      order: {
        companyId,
        archivedAt: null,
        deletedAt: null,
        status: { in: ["CONFIRMED", "IN_PROGRESS", "ON_HOLD"] },
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

// ───────────────────────────────
// Lock / Unlock
// ───────────────────────────────

export async function lockScheduleEntry(entryId: string) {
  const user = await requireWriter();

  const entry = await prisma.orderScheduleEntry.findUnique({
    where: { id: entryId },
    include: { order: { select: { companyId: true, id: true } } },
  });

  if (!entry || entry.order.companyId !== user.companyId) {
    throw new Error("Entry not found.");
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
    throw new Error("Entry not found.");
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

/** Delete full schedule for an order (including locked entries). */
export async function clearOrderSchedule(orderId: string) {
  const user = await requireWriter();

  const order = await prisma.order.findFirst({
    where: { id: orderId, companyId: user.companyId },
    select: { id: true },
  });

  if (!order) throw new Error("Order not found.");

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