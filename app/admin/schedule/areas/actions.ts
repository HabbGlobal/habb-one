"use server";

// Server actions for the "Bereich Ã— Tag" schedule view.
//
// The view inverts the classic employee Ã— day matrix: rows are areas,
// columns are days. From a cell the secretary can assign or remove an
// employee on that area for that specific date.
//
// Assigning = upsert a WORK ScheduleEntry with workAreaId set. Default
// shift comes from the employee's WorkScheduleDay if available, else the
// company default 07:30â€“16:30 / 30 min break.
//
// Unassigning = clear workAreaId on the entry (we never delete the entry
// here so any other planning data stays intact).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { checkAssignment } from "@/lib/schedule/check";

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "schedule.write")) {
    throw new Error("No permission.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message);
  }
  return r.data;
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const toUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const assignSchema = z.object({
  employeeId: z.string().cuid(),
  areaId: z.string().cuid(),
  date: dateString,
});

export async function assignEmployeeToAreaOnDate(input: unknown) {
  const data = parseOrThrow(assignSchema, input);
  const user = await requireWriter();

  const [employee, area] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: { scheduleDays: true },
    }),
    prisma.workArea.findUnique({ where: { id: data.areaId } }),
  ]);
  if (!employee || employee.companyId !== user.companyId) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }
  if (!area || area.companyId !== user.companyId || area.deletedAt) {
    throw new Error("Bereich nicht gefunden.");
  }

  const [y, m] = data.date.split("-").map(Number);
  const dateUtc = toUtc(data.date);
  const weekdayIdx = (dateUtc.getUTCDay() + 6) % 7;
  const weekdayKey = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][weekdayIdx];
  const wsDay = employee.scheduleDays.find((d) => d.weekday === weekdayKey);

  const plannedStart = wsDay?.defaultStart ?? "07:30";
  const plannedEnd = wsDay?.defaultEnd ?? "16:30";
  const plannedBreakMinutes = employee.defaultBreakMinutes ?? 30;
  const plannedMinutes = computeMinutes(plannedStart, plannedEnd, plannedBreakMinutes);

  // Make sure a ScheduleMonth row exists.
  const monthRow = await prisma.scheduleMonth.upsert({
    where: { companyId_year_month: { companyId: user.companyId, year: y, month: m } },
    create: {
      companyId: user.companyId,
      year: y,
      month: m,
      status: "DRAFT",
      createdById: user.id,
    },
    update: {},
  });

  // Capacity + competency rules â€” throws ScheduleRuleError with German message.
  await checkAssignment({
    companyId: user.companyId,
    monthId: monthRow.id,
    employeeId: data.employeeId,
    areaId: data.areaId,
    date: data.date,
  });

  const wasPublished = monthRow.status === "PUBLISHED";

  const before = await prisma.scheduleEntry.findUnique({
    where: {
      scheduleMonthId_employeeId_date: {
        scheduleMonthId: monthRow.id,
        employeeId: data.employeeId,
        date: dateUtc,
      },
    },
  });

  const upserted = await prisma.scheduleEntry.upsert({
    where: {
      scheduleMonthId_employeeId_date: {
        scheduleMonthId: monthRow.id,
        employeeId: data.employeeId,
        date: dateUtc,
      },
    },
    create: {
      scheduleMonthId: monthRow.id,
      employeeId: data.employeeId,
      date: dateUtc,
      type: "WORK",
      plannedStart,
      plannedEnd,
      plannedBreakMinutes,
      plannedMinutes,
      workAreaId: data.areaId,
      createdById: user.id,
      updatedById: user.id,
    },
    update: {
      // Don't overwrite existing shift times when re-assigning a non-WORK
      // entry to a WORK area. Just enforce WORK type and set the area.
      type: "WORK",
      workAreaId: data.areaId,
      // If shift times aren't set yet, give them the defaults.
      plannedStart: before?.plannedStart ?? plannedStart,
      plannedEnd: before?.plannedEnd ?? plannedEnd,
      plannedBreakMinutes: before?.plannedBreakMinutes ?? plannedBreakMinutes,
      plannedMinutes: before?.plannedMinutes ?? plannedMinutes,
      updatedById: user.id,
    },
  });

  if (wasPublished) {
    await prisma.scheduleChangeLog.create({
      data: {
        scheduleEntryId: upserted.id,
        changedById: user.id,
        oldValue: before
          ? {
              type: before.type,
              workAreaId: before.workAreaId,
              plannedStart: before.plannedStart,
              plannedEnd: before.plannedEnd,
            }
          : { state: "absent" },
        newValue: {
          type: "WORK",
          workAreaId: data.areaId,
          plannedStart: upserted.plannedStart,
          plannedEnd: upserted.plannedEnd,
        },
        reason: "Area-view: assign",
      },
    });
    await prisma.scheduleMonth.update({
      where: { id: monthRow.id },
      data: { status: "CHANGED_AFTER_PUBLISHING" },
    });
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "UPDATE",
    entityType: "ScheduleEntry",
    entityId: upserted.id,
    newValue: {
      areaId: data.areaId,
      date: data.date,
      via: "area-view assign",
    },
  });

  revalidatePath("/admin/schedule/areas");
  revalidatePath("/admin/schedule");
}

const unassignSchema = z.object({
  employeeId: z.string().cuid(),
  date: dateString,
});

export async function unassignEmployeeFromAreaOnDate(input: unknown) {
  const data = parseOrThrow(unassignSchema, input);
  const user = await requireWriter();

  const [y, m] = data.date.split("-").map(Number);
  const monthRow = await prisma.scheduleMonth.findUnique({
    where: { companyId_year_month: { companyId: user.companyId, year: y, month: m } },
  });
  if (!monthRow) return;

  const entry = await prisma.scheduleEntry.findUnique({
    where: {
      scheduleMonthId_employeeId_date: {
        scheduleMonthId: monthRow.id,
        employeeId: data.employeeId,
        date: toUtc(data.date),
      },
    },
    include: { employee: true },
  });
  if (!entry || entry.employee.companyId !== user.companyId) return;

  const before = { workAreaId: entry.workAreaId };

  await prisma.scheduleEntry.update({
    where: { id: entry.id },
    data: { workAreaId: null, updatedById: user.id },
  });

  if (monthRow.status === "PUBLISHED" || monthRow.status === "CHANGED_AFTER_PUBLISHING") {
    await prisma.scheduleChangeLog.create({
      data: {
        scheduleEntryId: entry.id,
        changedById: user.id,
        oldValue: before,
        newValue: { workAreaId: null },
        reason: "Area-view: unassign",
      },
    });
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "UPDATE",
    entityType: "ScheduleEntry",
    entityId: entry.id,
    oldValue: before,
    newValue: { workAreaId: null },
    reason: "Area-view unassign",
  });

  revalidatePath("/admin/schedule/areas");
  revalidatePath("/admin/schedule");
}

function computeMinutes(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const grossMin = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, grossMin - breakMin);
}
