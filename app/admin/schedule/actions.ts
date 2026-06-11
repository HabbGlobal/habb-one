"use server";

// Server actions for the secretary / admin monthly scheduling module.
//
// Lifecycle of a ScheduleMonth:
//   DRAFT → PUBLISHED → CHANGED_AFTER_PUBLISHING → PUBLISHED → ... → ARCHIVED
//
// Editing entries on a PUBLISHED month flips the month into
// CHANGED_AFTER_PUBLISHING and writes a ScheduleChangeLog row so we can show
// a "modified after publishing" indicator and audit the change.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { checkAssignment } from "@/lib/schedule/check";
import {
  autoPlan,
  type AreaSpec,
  type EmployeeSpec,
  type ExistingEntry as PlanExistingEntry,
  type AbsenceWindow,
} from "@/lib/schedule/competency";
import {
  derivePersonnelFromWorkshop,
  type WorkshopBooking,
  type MachineLite,
  type AreaSpec as DeriveAreaSpec,
  type EmployeeSpec as DeriveEmployeeSpec,
  type AbsenceWindow as DeriveAbsence,
  type ExistingScheduleEntry as DeriveExisting,
  type DeriveResult,
} from "@/lib/schedule/derive-personnel";
import { localDateString } from "@/lib/time/zone";

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "schedule.write")) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

async function requirePublisher() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "schedule.publish")) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return parsed.data;
}

function toUtcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function computePlannedMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
  breakMin: number | null | undefined
): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm) - (breakMin ?? 0);
  return Math.max(0, minutes);
}

export async function ensureScheduleMonth(year: number, month: number) {
  const user = await requireWriter();
  const existing = await prisma.scheduleMonth.findUnique({
    where: { companyId_year_month: { companyId: user.companyId, year, month } },
  });
  if (existing) return existing;
  return prisma.scheduleMonth.create({
    data: {
      companyId: user.companyId,
      year,
      month,
      status: "DRAFT",
      createdById: user.id,
    },
  });
}

const cellSchema = z.object({
  monthId: z.string().cuid(),
  employeeId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum([
    "WORK",
    "FREE",
    "VACATION",
    "SICKNESS",
    "ABSENCE",
    "COMPENSATION",
    "OTHER",
  ]),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  plannedBreakMinutes: z.coerce.number().int().min(0).max(180).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function upsertScheduleEntry(input: unknown) {
  const data = parseOrThrow(cellSchema, input);
  const user = await requireWriter();

  const month = await prisma.scheduleMonth.findUniqueOrThrow({
    where: { id: data.monthId },
  });
  if (month.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: data.employeeId },
  });
  if (employee.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  const dateUtc = toUtcMidnight(data.date);
  const plannedMinutes =
    data.type === "WORK"
      ? computePlannedMinutes(data.plannedStart, data.plannedEnd, data.plannedBreakMinutes)
      : null;

  const before = await prisma.scheduleEntry.findUnique({
    where: {
      scheduleMonthId_employeeId_date: {
        scheduleMonthId: data.monthId,
        employeeId: data.employeeId,
        date: dateUtc,
      },
    },
  });

  const entry = await prisma.scheduleEntry.upsert({
    where: {
      scheduleMonthId_employeeId_date: {
        scheduleMonthId: data.monthId,
        employeeId: data.employeeId,
        date: dateUtc,
      },
    },
    create: {
      scheduleMonthId: data.monthId,
      employeeId: data.employeeId,
      date: dateUtc,
      type: data.type,
      plannedStart: data.plannedStart || null,
      plannedEnd: data.plannedEnd || null,
      plannedBreakMinutes: data.plannedBreakMinutes ?? null,
      plannedMinutes,
      note: data.note || null,
      createdById: user.id,
      updatedById: user.id,
    },
    update: {
      type: data.type,
      plannedStart: data.plannedStart || null,
      plannedEnd: data.plannedEnd || null,
      plannedBreakMinutes: data.plannedBreakMinutes ?? null,
      plannedMinutes,
      note: data.note || null,
      updatedById: user.id,
    },
  });

  if (month.status === "PUBLISHED") {
    await prisma.scheduleMonth.update({
      where: { id: data.monthId },
      data: { status: "CHANGED_AFTER_PUBLISHING" },
    });
    await prisma.scheduleChangeLog.create({
      data: {
        scheduleEntryId: entry.id,
        changedById: user.id,
        oldValue: before
          ? {
              type: before.type,
              plannedStart: before.plannedStart,
              plannedEnd: before.plannedEnd,
              plannedBreakMinutes: before.plannedBreakMinutes,
              note: before.note,
            }
          : { state: "absent" },
        newValue: {
          type: data.type,
          plannedStart: data.plannedStart,
          plannedEnd: data.plannedEnd,
          plannedBreakMinutes: data.plannedBreakMinutes,
          note: data.note,
        },
      },
    });
  }

  revalidatePath("/admin/schedule");
  return { id: entry.id };
}

export async function deleteScheduleEntry(entryId: string) {
  const user = await requireWriter();
  const entry = await prisma.scheduleEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { scheduleMonth: true },
  });
  if (entry.scheduleMonth.companyId !== user.companyId) {
    throw new Error("Keine Berechtigung.");
  }
  await prisma.scheduleEntry.delete({ where: { id: entryId } });
  if (entry.scheduleMonth.status === "PUBLISHED") {
    await prisma.scheduleMonth.update({
      where: { id: entry.scheduleMonthId },
      data: { status: "CHANGED_AFTER_PUBLISHING" },
    });
  }
  revalidatePath("/admin/schedule");
}

export async function publishScheduleMonth(monthId: string) {
  const user = await requirePublisher();
  const month = await prisma.scheduleMonth.findUniqueOrThrow({ where: { id: monthId } });
  if (month.companyId !== user.companyId) throw new Error("Keine Berechtigung.");
  await prisma.scheduleMonth.update({
    where: { id: monthId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedById: user.id,
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "PUBLISH_SCHEDULE",
    entityType: "ScheduleMonth",
    entityId: monthId,
    newValue: { year: month.year, month: month.month },
  });
  revalidatePath("/admin/schedule");
}

export async function revertToDraft(monthId: string) {
  const user = await requirePublisher();
  const month = await prisma.scheduleMonth.findUniqueOrThrow({ where: { id: monthId } });
  if (month.companyId !== user.companyId) throw new Error("Keine Berechtigung.");
  await prisma.scheduleMonth.update({
    where: { id: monthId },
    data: { status: "DRAFT" },
  });
  revalidatePath("/admin/schedule");
}

// ─────────────────────────────────────────
// Bulk range planning
// ─────────────────────────────────────────

const bulkSchema = z.object({
  monthId: z.string().cuid().optional().nullable(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employeeId: z.string().cuid(),
  // List of YYYY-MM-DD dates the change should apply to.
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(366),
  type: z.enum([
    "WORK",
    "FREE",
    "VACATION",
    "SICKNESS",
    "ABSENCE",
    "COMPENSATION",
    "OTHER",
  ]),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  plannedBreakMinutes: z.coerce.number().int().min(0).max(180).optional().nullable(),
  workAreaId: z.string().cuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  // If false, dates that already have an entry are skipped.
  overwrite: z.boolean().default(true),
});

export async function bulkUpsertScheduleEntries(input: unknown) {
  const data = parseOrThrow(bulkSchema, input);
  const user = await requireWriter();

  // Verify employee
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: data.employeeId },
  });
  if (employee.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  // All dates must be within the target month so a range editor can't bleed
  // entries into a different ScheduleMonth row.
  for (const d of data.dates) {
    const [y, m] = d.split("-").map(Number);
    if (y !== data.year || m !== data.month) {
      throw new Error(`Datum ausserhalb des Monats: ${d}`);
    }
  }

  // Ensure month row exists
  let monthRow = data.monthId
    ? await prisma.scheduleMonth.findUnique({ where: { id: data.monthId } })
    : await prisma.scheduleMonth.findUnique({
        where: {
          companyId_year_month: {
            companyId: user.companyId,
            year: data.year,
            month: data.month,
          },
        },
      });
  if (!monthRow) {
    monthRow = await prisma.scheduleMonth.create({
      data: {
        companyId: user.companyId,
        year: data.year,
        month: data.month,
        status: "DRAFT",
        createdById: user.id,
      },
    });
  }
  if (monthRow.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  const plannedMinutes =
    data.type === "WORK"
      ? computePlannedMinutes(data.plannedStart, data.plannedEnd, data.plannedBreakMinutes)
      : null;

  // Pre-load existing entries to know which to skip if !overwrite, and to
  // produce a meaningful audit / change log.
  const existing = await prisma.scheduleEntry.findMany({
    where: {
      scheduleMonthId: monthRow.id,
      employeeId: data.employeeId,
      date: { in: data.dates.map(toUtcMidnight) },
    },
  });
  const existingByDate = new Map(
    existing.map((e) => [e.date.toISOString().slice(0, 10), e])
  );

  const datesToWrite = data.overwrite
    ? data.dates
    : data.dates.filter((d) => !existingByDate.has(d));

  if (datesToWrite.length === 0) {
    return { written: 0, skipped: data.dates.length };
  }

  const wasPublished = monthRow.status === "PUBLISHED";

  // Validate workArea (must belong to same company) and pre-check that
  // every target date can accept the assignment under capacity rules.
  if (data.workAreaId && data.type === "WORK") {
    for (const date of datesToWrite) {
      await checkAssignment({
        companyId: user.companyId,
        monthId: monthRow.id,
        employeeId: data.employeeId,
        areaId: data.workAreaId,
        date,
      });
    }
  }

  // Write everything in a transaction. Use individual upserts so we get
  // back the created/updated entry id (needed for change-log rows).
  await prisma.$transaction(async (tx) => {
    for (const d of datesToWrite) {
      const dateUtc = toUtcMidnight(d);
      const before = existingByDate.get(d);

      const upserted = await tx.scheduleEntry.upsert({
        where: {
          scheduleMonthId_employeeId_date: {
            scheduleMonthId: monthRow!.id,
            employeeId: data.employeeId,
            date: dateUtc,
          },
        },
        create: {
          scheduleMonthId: monthRow!.id,
          employeeId: data.employeeId,
          date: dateUtc,
          type: data.type,
          plannedStart: data.plannedStart || null,
          plannedEnd: data.plannedEnd || null,
          plannedBreakMinutes: data.plannedBreakMinutes ?? null,
          plannedMinutes,
          workAreaId: data.workAreaId || null,
          note: data.note || null,
          createdById: user.id,
          updatedById: user.id,
        },
        update: {
          type: data.type,
          plannedStart: data.plannedStart || null,
          plannedEnd: data.plannedEnd || null,
          plannedBreakMinutes: data.plannedBreakMinutes ?? null,
          plannedMinutes,
          workAreaId: data.workAreaId || null,
          note: data.note || null,
          updatedById: user.id,
        },
      });

      if (wasPublished) {
        await tx.scheduleChangeLog.create({
          data: {
            scheduleEntryId: upserted.id,
            changedById: user.id,
            oldValue: before
              ? {
                  type: before.type,
                  plannedStart: before.plannedStart,
                  plannedEnd: before.plannedEnd,
                  plannedBreakMinutes: before.plannedBreakMinutes,
                  workAreaId: before.workAreaId,
                }
              : { state: "absent" },
            newValue: {
              type: data.type,
              plannedStart: data.plannedStart,
              plannedEnd: data.plannedEnd,
              plannedBreakMinutes: data.plannedBreakMinutes,
              workAreaId: data.workAreaId,
            },
            reason: "Bulk range planning",
          },
        });
      }
    }

    if (wasPublished) {
      await tx.scheduleMonth.update({
        where: { id: monthRow!.id },
        data: { status: "CHANGED_AFTER_PUBLISHING" },
      });
    }
  }, {
    // Bulk range can hit 30+ upserts; default 5 s isn't always enough on
    // a remote DB.
    maxWait: 10_000,
    timeout: 60_000,
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "UPDATE",
    entityType: "ScheduleEntry",
    entityId: monthRow.id,
    newValue: {
      bulk: true,
      written: datesToWrite.length,
      skipped: data.dates.length - datesToWrite.length,
      type: data.type,
      plannedStart: data.plannedStart,
      plannedEnd: data.plannedEnd,
    },
    reason: "Bulk range planning",
  });

  revalidatePath("/admin/schedule");
  return {
    written: datesToWrite.length,
    skipped: data.dates.length - datesToWrite.length,
  };
}

export async function copyFromPreviousMonth(year: number, month: number) {
  const user = await requireWriter();

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const prev = await prisma.scheduleMonth.findUnique({
    where: {
      companyId_year_month: {
        companyId: user.companyId,
        year: prevYear,
        month: prevMonth,
      },
    },
    include: { entries: true },
  });
  if (!prev || prev.entries.length === 0) {
    throw new Error("Vormonat enthält keine Planung.");
  }

  const target = await ensureScheduleMonth(year, month);

  // Build a per-employee, per-weekday template from the previous month.
  const pattern = new Map<string, Map<number, (typeof prev.entries)[number]>>();
  for (const e of prev.entries) {
    const weekday = (e.date.getUTCDay() + 6) % 7; // Mon=0
    if (!pattern.has(e.employeeId)) pattern.set(e.employeeId, new Map());
    const m = pattern.get(e.employeeId)!;
    if (!m.has(weekday)) m.set(weekday, e);
  }

  const daysInTarget = new Date(year, month, 0).getDate();
  const newRows: Array<{
    scheduleMonthId: string;
    employeeId: string;
    date: Date;
    type: (typeof prev.entries)[number]["type"];
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedBreakMinutes: number | null;
    plannedMinutes: number | null;
    workAreaId: string | null;
    note: string | null;
    source: "COPIED";
    createdById: string;
    updatedById: string;
  }> = [];

  for (let day = 1; day <= daysInTarget; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const targetDate = toUtcMidnight(dateStr);
    const weekday = (targetDate.getUTCDay() + 6) % 7;
    for (const [employeeId, empPattern] of pattern) {
      const tpl = empPattern.get(weekday);
      if (!tpl) continue;
      newRows.push({
        scheduleMonthId: target.id,
        employeeId,
        date: targetDate,
        type: tpl.type,
        plannedStart: tpl.plannedStart,
        plannedEnd: tpl.plannedEnd,
        plannedBreakMinutes: tpl.plannedBreakMinutes,
        plannedMinutes: tpl.plannedMinutes,
        workAreaId: tpl.workAreaId,
        note: tpl.note,
        source: "COPIED",
        createdById: user.id,
        updatedById: user.id,
      });
    }
  }

  // skipDuplicates so existing entries in the target month are preserved.
  const result = await prisma.scheduleEntry.createMany({
    data: newRows,
    skipDuplicates: true,
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "ScheduleMonth",
    entityId: target.id,
    newValue: {
      copiedFrom: { year: prevYear, month: prevMonth },
      created: result.count,
    },
    reason: "Copy from previous month",
  });

  revalidatePath("/admin/schedule");
  return { created: result.count };
}

// ─────────────────────────────────────────
// Auto-planner: distribute employees across areas for the month
// ─────────────────────────────────────────

const autoPlanSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  /** When true, replace existing WORK entries that already have an area. */
  overwriteExisting: z.boolean().default(false),
  /** Default shift settings for newly-created WORK entries. */
  defaultStart: z.string().regex(/^\d{2}:\d{2}$/).default("07:30"),
  defaultEnd: z.string().regex(/^\d{2}:\d{2}$/).default("16:30"),
  defaultBreakMinutes: z.coerce.number().int().min(0).max(180).default(30),
});

export async function autoPlanMonth(input: unknown) {
  const data = parseOrThrow(autoPlanSchema, input);
  const user = await requireWriter();

  // Determine the work-date range and pull holidays / absences within it.
  const daysInMonth = new Date(data.year, data.month, 0).getDate();
  const monthStart = new Date(`${data.year}-${String(data.month).padStart(2, "0")}-01T00:00:00.000Z`);
  const monthEnd = new Date(`${data.year}-${String(data.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}T23:59:59.999Z`);

  // workDates = Mon..Fri only. Saturday/Sunday excluded by default.
  const workDates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${data.year}-${String(data.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) workDates.push(dateStr);
  }

  const monthRow = await prisma.scheduleMonth.upsert({
    where: { companyId_year_month: { companyId: user.companyId, year: data.year, month: data.month } },
    create: {
      companyId: user.companyId,
      year: data.year,
      month: data.month,
      status: "DRAFT",
      createdById: user.id,
    },
    update: {},
  });

  const [areas, employees, absences, holidays, existing] = await Promise.all([
    prisma.workArea.findMany({
      where: { companyId: user.companyId, archivedAt: null, deletedAt: null },
      include: { _count: { select: { members: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: { companyId: user.companyId, archivedAt: null, deletedAt: null, isActive: true },
      include: { workAreas: { select: { workAreaId: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.absence.findMany({
      where: {
        employee: { companyId: user.companyId },
        status: { in: ["APPROVED", "REQUESTED"] },
        archivedAt: null,
        deletedAt: null,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: { absenceType: true },
    }),
    prisma.holiday.findMany({
      where: {
        companyId: user.companyId,
        date: { gte: monthStart, lte: monthEnd },
        archivedAt: null,
        deletedAt: null,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: { scheduleMonthId: monthRow.id },
    }),
  ]);

  // Areas with limited capacity first, then unlimited; ties by sortOrder.
  const areaSpecs: AreaSpec[] = [...areas]
    .sort((a, b) => {
      const ac = a.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
      const bc = b.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
      if (ac !== bc) return ac - bc;
      return a.sortOrder - b.sortOrder;
    })
    .map((a) => ({
      id: a.id,
      name: a.name,
      minEmployeesPerDay: a.minEmployeesPerDay,
      maxEmployeesPerDay: a.maxEmployeesPerDay,
    }));

  const employeeSpecs: EmployeeSpec[] = employees.map((e) => ({
    id: e.id,
    name: `${e.lastName}, ${e.firstName}`,
    competencyAreaIds: e.workAreas.map((w) => w.workAreaId),
    weekdayTargets: [],
  }));

  const absenceWindows: AbsenceWindow[] = absences.map((a) => ({
    employeeId: a.employeeId,
    startDate: a.startDate.toISOString().slice(0, 10),
    endDate: a.endDate.toISOString().slice(0, 10),
    reducesTarget: a.absenceType.reducesTarget,
  }));

  const existingEntries: PlanExistingEntry[] = existing.map((e) => ({
    employeeId: e.employeeId,
    date: e.date.toISOString().slice(0, 10),
    type: e.type,
    workAreaId: e.workAreaId,
  }));

  const result = autoPlan({
    workDates,
    holidayDates: holidays.map((h) => h.date.toISOString().slice(0, 10)),
    areas: areaSpecs,
    employees: employeeSpecs,
    absences: absenceWindows,
    existingEntries,
    overwriteExisting: data.overwriteExisting,
  });

  // Compute duration for the default shift (used when creating fresh WORK rows).
  const [sh, sm] = data.defaultStart.split(":").map(Number);
  const [eh, em] = data.defaultEnd.split(":").map(Number);
  const grossMinutes = eh * 60 + em - (sh * 60 + sm);
  const defaultPlannedMinutes = Math.max(0, grossMinutes - data.defaultBreakMinutes);

  // Apply assignments inside a transaction so we never leave the month
  // half-planned on error.
  const wasPublished = monthRow.status === "PUBLISHED";
  let written = 0;
  await prisma.$transaction(async (tx) => {
    for (const a of result.assignments) {
      const dateUtc = new Date(`${a.date}T00:00:00.000Z`);
      const before = existingEntries.find(
        (e) => e.employeeId === a.employeeId && e.date === a.date
      );
      await tx.scheduleEntry.upsert({
        where: {
          scheduleMonthId_employeeId_date: {
            scheduleMonthId: monthRow.id,
            employeeId: a.employeeId,
            date: dateUtc,
          },
        },
        create: {
          scheduleMonthId: monthRow.id,
          employeeId: a.employeeId,
          date: dateUtc,
          type: "WORK",
          plannedStart: data.defaultStart,
          plannedEnd: data.defaultEnd,
          plannedBreakMinutes: data.defaultBreakMinutes,
          plannedMinutes: defaultPlannedMinutes,
          workAreaId: a.areaId,
          // Markiere Eintrag als auto-generiert, damit Bulk-Delete ihn
          // selektiv wegputzen kann ohne manuelle Schichten anzufassen.
          source: "AUTO",
          createdById: user.id,
          updatedById: user.id,
        },
        update: {
          type: "WORK",
          workAreaId: a.areaId,
          // Keep existing shift times if already set; otherwise apply defaults.
          plannedStart: before?.type === "WORK" ? undefined : data.defaultStart,
          plannedEnd: before?.type === "WORK" ? undefined : data.defaultEnd,
          plannedBreakMinutes:
            before?.type === "WORK" ? undefined : data.defaultBreakMinutes,
          plannedMinutes: before?.type === "WORK" ? undefined : defaultPlannedMinutes,
          // ABSICHTLICH KEIN source-Update: ein manuell editierter Eintrag
          // bleibt MANUAL, auch wenn der Auto-Planner ihn neu zuweist.
          updatedById: user.id,
        },
      });
      written++;
    }
    if (wasPublished && written > 0) {
      await tx.scheduleMonth.update({
        where: { id: monthRow.id },
        data: { status: "CHANGED_AFTER_PUBLISHING" },
      });
    }
  }, {
    // Sequential upserts × ~100 entries can take 5-15 s on a remote DB.
    // Bump well beyond Prisma's 5 s default to avoid the transaction being
    // closed mid-loop.
    maxWait: 10_000,
    timeout: 60_000,
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "ScheduleMonth",
    entityId: monthRow.id,
    newValue: {
      autoPlanned: true,
      written,
      unfilled: result.unfilledSlots.length,
    },
    reason: `Auto-Plan ${data.year}-${data.month}`,
  });

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/areas");
  return {
    written,
    unfilled: result.unfilledSlots.map((u) => ({
      areaId: u.areaId,
      areaName: areas.find((a) => a.id === u.areaId)?.name ?? "?",
      date: u.date,
      reason: u.reason,
    })),
  };
}

// ─────────────────────────────────────────
// Bulk-Delete: Auto-Planung wegputzen
// ─────────────────────────────────────────

const bulkDeleteSchema = z.object({
  /** Bereich: Woche oder ganzer Monat. */
  scope: z.enum(["week", "month"]),
  /**
   * Anker-Datum für den Bereich.
   *  - scope=week: Beliebiger Tag in der ISO-Woche → Mo-So wird abgeleitet.
   *  - scope=month: Beliebiger Tag im Monat → der ganze Monat wird genommen.
   */
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /**
   * Welche Quelle gelöscht wird:
   *  - "AUTO": nur automatisch geplante Einträge
   *  - "AUTO_AND_COPIED": auto + aus Vormonat kopierte (alles "nicht-manuell")
   *  - "ALL": alles im Bereich (auch manuell). Als letzte Reset-Option.
   */
  filter: z.enum(["AUTO", "AUTO_AND_COPIED", "ALL"]),
  /** Optional: nur für eine Liste von Mitarbeitenden. Leer = alle. */
  employeeIds: z.array(z.string().cuid()).optional(),
  /** Optional: nur für einen Bereich. */
  workAreaId: z.string().cuid().optional().nullable(),
});

export type BulkDeleteInput = z.input<typeof bulkDeleteSchema>;

/**
 * Berechnet das (UTC-)Datums-Fenster für `scope` + `anchorDate`.
 * Woche = ISO-Woche Mo-So.
 */
function rangeFor(scope: "week" | "month", anchorDate: string): { from: Date; to: Date } {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  if (scope === "week") {
    const wd = (anchor.getUTCDay() + 6) % 7; // Mo=0, So=6
    const monday = new Date(anchor);
    monday.setUTCDate(monday.getUTCDate() - wd);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return { from: monday, to: sunday };
  }
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  last.setUTCHours(23, 59, 59, 999);
  return { from: first, to: last };
}

function sourceFilterToWhere(
  filter: "AUTO" | "AUTO_AND_COPIED" | "ALL",
): { source?: { in: ("AUTO" | "COPIED" | "MANUAL")[] } } {
  switch (filter) {
    case "AUTO":
      return { source: { in: ["AUTO"] } };
    case "AUTO_AND_COPIED":
      return { source: { in: ["AUTO", "COPIED"] } };
    case "ALL":
      return {}; // kein Filter — auch MANUAL wird gelöscht
  }
}

/**
 * Zählt nur, wie viele Einträge die gegebenen Filter-Kriterien matchen würden.
 * Wird vom UI VOR dem Löschen aufgerufen, damit der Bestätigungs-Dialog
 * sagen kann: "23 Einträge werden gelöscht."
 */
export async function countBulkDeletableEntries(input: unknown): Promise<{
  total: number;
  byEmployee: { employeeId: string; employeeName: string; count: number }[];
}> {
  const data = parseOrThrow(bulkDeleteSchema, input);
  const user = await requireWriter();
  const { from, to } = rangeFor(data.scope, data.anchorDate);

  const where = {
    scheduleMonth: { companyId: user.companyId },
    date: { gte: from, lte: to },
    ...sourceFilterToWhere(data.filter),
    ...(data.employeeIds && data.employeeIds.length > 0
      ? { employeeId: { in: data.employeeIds } }
      : {}),
    ...(data.workAreaId ? { workAreaId: data.workAreaId } : {}),
  };

  const total = await prisma.scheduleEntry.count({ where });
  const grouped = await prisma.scheduleEntry.groupBy({
    by: ["employeeId"],
    where,
    _count: { _all: true },
  });

  const employees = await prisma.employee.findMany({
    where: { id: { in: grouped.map((g) => g.employeeId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const empName = new Map(
    employees.map((e) => [e.id, `${e.lastName}, ${e.firstName}`]),
  );

  return {
    total,
    byEmployee: grouped
      .map((g) => ({
        employeeId: g.employeeId,
        employeeName: empName.get(g.employeeId) ?? "?",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Löscht ScheduleEntries gemäss Filter im gewählten Zeitraum.
 *
 * Sicherheitsnetz:
 *   - Nur User mit `schedule.write`-Permission.
 *   - Tenant-isoliert über `scheduleMonth.companyId`.
 *   - Audit-Log-Eintrag mit gelöschter Anzahl + Filter-Beschreibung.
 *   - Wenn der betroffene Monat PUBLISHED war: Status auf
 *     CHANGED_AFTER_PUBLISHING setzen (analog zu allen anderen Mutationen).
 */
export async function bulkDeleteScheduleEntries(input: unknown): Promise<{
  deleted: number;
  scope: "week" | "month";
  filter: "AUTO" | "AUTO_AND_COPIED" | "ALL";
}> {
  const data = parseOrThrow(bulkDeleteSchema, input);
  const user = await requireWriter();
  const { from, to } = rangeFor(data.scope, data.anchorDate);

  const where = {
    scheduleMonth: { companyId: user.companyId },
    date: { gte: from, lte: to },
    ...sourceFilterToWhere(data.filter),
    ...(data.employeeIds && data.employeeIds.length > 0
      ? { employeeId: { in: data.employeeIds } }
      : {}),
    ...(data.workAreaId ? { workAreaId: data.workAreaId } : {}),
  };

  // Vorab betroffene Monate finden, damit wir PUBLISHED → CHANGED setzen können.
  const affectedMonths = await prisma.scheduleEntry.findMany({
    where,
    select: { scheduleMonthId: true },
    distinct: ["scheduleMonthId"],
  });
  const affectedMonthIds = affectedMonths.map((m) => m.scheduleMonthId);

  const result = await prisma.$transaction(
    async (tx) => {
      const del = await tx.scheduleEntry.deleteMany({ where });
      // Monate, die vorher PUBLISHED waren, auf CHANGED_AFTER_PUBLISHING setzen.
      if (affectedMonthIds.length > 0 && del.count > 0) {
        await tx.scheduleMonth.updateMany({
          where: {
            id: { in: affectedMonthIds },
            status: "PUBLISHED",
          },
          data: { status: "CHANGED_AFTER_PUBLISHING" },
        });
      }
      return del;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "DELETE",
    entityType: "ScheduleEntry",
    entityId: data.anchorDate, // kein einzelnes Subjekt — Datum als Anker
    newValue: {
      bulkDelete: true,
      scope: data.scope,
      anchorDate: data.anchorDate,
      filter: data.filter,
      deleted: result.count,
      affectedMonthIds,
      employeeIds: data.employeeIds ?? null,
      workAreaId: data.workAreaId ?? null,
    },
    reason: `Bulk-Delete ${data.filter} im ${data.scope === "week" ? "Wochen" : "Monats"}-Bereich`,
  });

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/areas");

  return { deleted: result.count, scope: data.scope, filter: data.filter };
}

// ─────────────────────────────────────────
// Aus Werkstatt-Plan → Personal-Plan ableiten
// ─────────────────────────────────────────

const deriveSchema = z.object({
  /** Anker — beliebiger Tag im Zielmonat (oder Mo der Zielwoche). */
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Bereich: Woche oder Monat. */
  scope: z.enum(["week", "month"]),
  /** Wenn true: bereits vorhandene AUTO-Einträge dürfen überschrieben werden. */
  overwriteAuto: z.boolean().default(false),
  /** Wenn true: nur rechnen + Konflikte zurückgeben, nichts schreiben. */
  dryRun: z.boolean().default(false),
  /** Standard-Schicht für neu erzeugte WORK-Einträge. */
  defaultStart: z.string().regex(/^\d{2}:\d{2}$/).default("07:30"),
  defaultEnd: z.string().regex(/^\d{2}:\d{2}$/).default("16:30"),
  defaultBreakMinutes: z.coerce.number().int().min(0).max(180).default(30),
});

export type DerivePersonnelInput = z.input<typeof deriveSchema>;

function rangeForDerive(
  scope: "week" | "month",
  anchorDate: string,
): { from: Date; to: Date; year: number; month: number } {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  if (scope === "week") {
    const wd = (anchor.getUTCDay() + 6) % 7;
    const monday = new Date(anchor);
    monday.setUTCDate(monday.getUTCDate() - wd);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return {
      from: monday,
      to: sunday,
      year: monday.getUTCFullYear(),
      month: monday.getUTCMonth() + 1,
    };
  }
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  last.setUTCHours(23, 59, 59, 999);
  return {
    from: first,
    to: last,
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
  };
}

/**
 * Liest den Werkstatt-Plan für den gewählten Zeitraum, mappt Maschinen-
 * Buchungen über `Machine.workAreaId` auf WorkAreas, und ergänzt im
 * Personal-Plan automatisch WORK-Einträge für die nötigen Mitarbeiter.
 *
 * Sicherheits-Pattern:
 *   - SCHREIBT NIE über MANUAL- oder COPIED-Einträge.
 *   - AUTO-Einträge werden nur überschrieben, wenn `overwriteAuto=true`.
 *   - Mit `dryRun=true` kann das UI eine Vorschau zeigen, bevor geschrieben wird.
 */
export async function derivePersonnelFromWorkshopPlan(
  input: unknown,
): Promise<DeriveResult & { written: number }> {
  const data = parseOrThrow(deriveSchema, input);
  const user = await requireWriter();
  const { from, to, year, month } = rangeForDerive(data.scope, data.anchorDate);

  // 1) Werkstatt-Buchungen im Zeitraum laden
  // Lifecycle-Filter: nur Aufträge aktiver Kunden, nicht archiviert/gelöscht.
  // Stornierte Aufträge schließen wir explizit aus — sie sollen keinen
  // Personal-Bedarf auslösen.
  const bookings = await prisma.orderScheduleEntry.findMany({
    where: {
      order: {
        companyId: user.companyId,
        archivedAt: null,
        deletedAt: null,
        status: { not: "CANCELLED" },
        customer: { deletedAt: null },
      },
      plannedStart: { gte: from },
      plannedEnd: { lte: to },
    },
    select: {
      machineId: true,
      plannedStart: true,
      plannedEnd: true,
    },
  });

  // 2) Maschinen, Bereiche, Mitarbeiter, Absences laden — alles parallel
  const [machineRows, areaRows, employeeRows, absenceRows, existingRows] =
    await Promise.all([
      prisma.machine.findMany({
        where: { companyId: user.companyId, archivedAt: null, deletedAt: null },
        select: { id: true, workAreaId: true },
      }),
      prisma.workArea.findMany({
        where: { companyId: user.companyId, archivedAt: null, deletedAt: null },
        select: {
          id: true,
          name: true,
          minEmployeesPerDay: true,
          maxEmployeesPerDay: true,
        },
      }),
      prisma.employee.findMany({
        where: {
          companyId: user.companyId,
          isActive: true,
          archivedAt: null,
          deletedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          workAreas: { select: { workAreaId: true } },
        },
      }),
      prisma.absence.findMany({
        where: {
          employee: { companyId: user.companyId },
          archivedAt: null,
          deletedAt: null,
          status: { in: ["APPROVED", "REQUESTED"] },
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          employeeId: true,
          startDate: true,
          endDate: true,
        },
      }),
      // Bestehende Personal-Plan-Einträge im Zeitraum
      prisma.scheduleEntry.findMany({
        where: {
          scheduleMonth: { companyId: user.companyId },
          date: { gte: from, lte: to },
        },
        select: {
          employeeId: true,
          date: true,
          type: true,
          source: true,
          workAreaId: true,
        },
      }),
    ]);

  // 3) Pure-Logic-Inputs zusammenbauen
  const workshopBookings: WorkshopBooking[] = [];
  for (const b of bookings) {
    if (!b.machineId) continue;
    const minutes = Math.max(
      0,
      Math.round((b.plannedEnd.getTime() - b.plannedStart.getTime()) / 60_000),
    );
    if (minutes === 0) continue;
    workshopBookings.push({
      date: localDateString(b.plannedStart),
      machineId: b.machineId,
      minutes,
    });
  }

  const machines: MachineLite[] = machineRows.map((m) => ({
    id: m.id,
    workAreaId: m.workAreaId,
  }));
  const areas: DeriveAreaSpec[] = areaRows.map((a) => ({
    id: a.id,
    name: a.name,
    minEmployeesPerDay: a.minEmployeesPerDay,
    maxEmployeesPerDay: a.maxEmployeesPerDay,
  }));
  const employees: DeriveEmployeeSpec[] = employeeRows.map((e) => ({
    id: e.id,
    name: `${e.lastName}, ${e.firstName}`,
    areaIds: e.workAreas.map((wa) => wa.workAreaId),
  }));
  const absences: DeriveAbsence[] = absenceRows.map((a) => ({
    employeeId: a.employeeId,
    startDate: localDateString(a.startDate),
    endDate: localDateString(a.endDate),
  }));
  const existing: DeriveExisting[] = existingRows.map((e) => ({
    employeeId: e.employeeId,
    date: localDateString(e.date),
    type: e.type,
    source: e.source,
    workAreaId: e.workAreaId,
  }));

  // 4) Logik laufen lassen
  const result = derivePersonnelFromWorkshop({
    bookings: workshopBookings,
    machines,
    areas,
    employees,
    absences,
    existing,
    options: {
      overwriteAuto: data.overwriteAuto,
    },
  });

  if (data.dryRun) {
    return { ...result, written: 0 };
  }

  // 5) Persistieren — Monats-Row(s) sicherstellen + Einträge upserten
  const computeMinutes = (start: string, end: string, breakMin: number): number => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return Math.max(0, eh * 60 + em - (sh * 60 + sm) - breakMin);
  };
  const plannedMinutes = computeMinutes(
    data.defaultStart,
    data.defaultEnd,
    data.defaultBreakMinutes,
  );

  // ScheduleMonth-Rows pro betroffenem (year, month) sicherstellen
  const monthYearKeys = new Set<string>();
  for (const a of result.assignments) {
    const [y, m] = a.date.split("-").map(Number);
    monthYearKeys.add(`${y}|${m}`);
  }
  const monthRowMap = new Map<string, string>(); // "y|m" → monthId
  for (const key of monthYearKeys) {
    const [y, m] = key.split("|").map(Number);
    const row = await prisma.scheduleMonth.upsert({
      where: {
        companyId_year_month: {
          companyId: user.companyId,
          year: y,
          month: m,
        },
      },
      create: {
        companyId: user.companyId,
        year: y,
        month: m,
        status: "DRAFT",
        createdById: user.id,
      },
      update: {},
    });
    monthRowMap.set(key, row.id);
  }

  // PUBLISHED-Months tracken (Status-Flip nach dem Schreiben)
  const publishedMonthIds: string[] = [];
  for (const [key, id] of monthRowMap) {
    const [y, m] = key.split("|").map(Number);
    const r = await prisma.scheduleMonth.findUnique({
      where: { companyId_year_month: { companyId: user.companyId, year: y, month: m } },
      select: { status: true },
    });
    if (r?.status === "PUBLISHED") publishedMonthIds.push(id);
  }

  let written = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const a of result.assignments) {
        const [y, m] = a.date.split("-").map(Number);
        const monthId = monthRowMap.get(`${y}|${m}`);
        if (!monthId) continue;
        const dateUtc = new Date(`${a.date}T00:00:00.000Z`);
        await tx.scheduleEntry.upsert({
          where: {
            scheduleMonthId_employeeId_date: {
              scheduleMonthId: monthId,
              employeeId: a.employeeId,
              date: dateUtc,
            },
          },
          create: {
            scheduleMonthId: monthId,
            employeeId: a.employeeId,
            date: dateUtc,
            type: "WORK",
            plannedStart: data.defaultStart,
            plannedEnd: data.defaultEnd,
            plannedBreakMinutes: data.defaultBreakMinutes,
            plannedMinutes,
            workAreaId: a.workAreaId,
            source: "AUTO",
            createdById: user.id,
            updatedById: user.id,
          },
          update: {
            // Nur überschreiben wenn der bestehende Eintrag überschreibbar ist.
            // Die Logik hat das schon vorgeprüft — hier vertrauen wir darauf.
            type: "WORK",
            workAreaId: a.workAreaId,
            source: "AUTO",
            updatedById: user.id,
          },
        });
        written++;
      }
      if (publishedMonthIds.length > 0 && written > 0) {
        await tx.scheduleMonth.updateMany({
          where: { id: { in: publishedMonthIds } },
          data: { status: "CHANGED_AFTER_PUBLISHING" },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "ScheduleMonth",
    entityId: data.anchorDate,
    newValue: {
      derivePersonnelFromWorkshop: true,
      scope: data.scope,
      written,
      conflicts: result.conflicts.length,
    },
    reason: `Personal aus Werkstatt-Plan abgeleitet (${data.scope})`,
  });

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/areas");

  return { ...result, written };
}
