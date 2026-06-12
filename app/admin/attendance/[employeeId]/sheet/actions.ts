"use server";

// Server-Actions für das SAP-Style Stundenblatt.
//
// Zwei Operationen für CEO/Sekretariat:
//   1. `forceClockOut`         — Admin-Override-Ausstempel mit Pflicht-Grund.
//                                Wenn der Mitarbeiter LIVE eingestempelt ist
//                                und kein PIN zur Hand ist, kann der Admin
//                                ihn ausstempeln. Audit: ADMIN_CORRECTION
//                                + correctedById + reason auf TimePunch.
//   2. `replaceTimeEntryDay`   — Voll-Bearbeitung eines Tages: wipe + recreate
//                                aller TimePunches/BreakEntries aus
//                                den Edit-Formular-Blöcken.
//                                ▶︎ BLOCKIERT wenn der Tag aktuell OPEN/ON_BREAK
//                                   ist — Live-Lock-Garantie.
//
// Berechtigung: `timeEntries.correct` (Default nun: ADMIN + PLANNER).
// Tenant-Isolation: Employee MUSS in der Firma der Session sein.
// Audit: jede Mutation landet in `AuditLog` mit Before/After + Pflicht-Grund.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  clockOut,
  breakEnd,
  getCurrentKioskState,
  PunchError,
} from "@/lib/time/punch";
import {
  combineDateAndTime,
  localMidnightUtc,
  localDateString,
  DEFAULT_ZONE,
} from "@/lib/time/zone";
import { computeWorkedTime } from "@/lib/time/calc";
import { validateDayBlocks } from "@/lib/time/day-blocks";

/** Tenant timezone (default Europe/Zurich). */
async function resolveCompanyZone(companyId: string): Promise<string> {
  try {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    return c?.timezone || DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

/**
 * Strukturiertes Action-Ergebnis. WICHTIG: Server-Actions, die einen
 * Fehler WERFEN, bekommen in Production eine generische, maskierte
 * Next.js-Meldung ("An error occurred in the Server Components render…").
 * Damit der User die ECHTE, hilfreiche Meldung sieht, geben erwartete
 * Fehler (Validierung, Berechtigung, Live-Lock) ein `{ ok:false, error }`
 * zurück statt zu werfen. Nur wirklich unerwartete Fehler dürfen werfen.
 */
export type SheetActionResult = { ok: true } | { ok: false; error: string };

/** Erwarteter (fachlicher) Fehler — wird zu `{ ok:false }` konvertiert. */
class SheetError extends Error {}

// ─────────────────────────────────────────
// Auth + Tenant Helpers
// ─────────────────────────────────────────

async function requireCorrector() {
  const session = await auth();
  if (!session?.user) throw new SheetError("Not logged in.");
  if (!hasPermission(session.user.role, "timeEntries.correct")) {
    throw new SheetError(
      "No permission — the CEO or Secretary role is required (timeEntries.correct).",
    );
  }
  return session.user;
}

async function loadEmployeeOrThrow(employeeId: string, companyId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!emp) throw new SheetError("Employee not found.");
  if (emp.companyId !== companyId) {
    throw new SheetError("Employee does not belong to your company.");
  }
  return emp;
}

// ─────────────────────────────────────────
// 1) Force-Clock-Out (Admin-Override)
// ─────────────────────────────────────────

const forceClockOutSchema = z.object({
  employeeId: z.string().min(1),
  reason: z
    .string()
    .min(5, "Please provide a reason (at least 5 characters).")
    .max(500),
});

export async function forceClockOut(
  input: z.input<typeof forceClockOutSchema>,
): Promise<SheetActionResult> {
  try {
    const user = await requireCorrector();
    const data = forceClockOutSchema.parse(input);

    const emp = await loadEmployeeOrThrow(data.employeeId, user.companyId);

    const state = await getCurrentKioskState(emp.id, {
      expectedCompanyId: user.companyId,
    });
    if (state.status === "OUT" || state.status === "EMPTY" || state.status === "CLOSED") {
      throw new SheetError("Employee is not clocked in.");
    }

    // End pause (if active), then clock out. Both marked as
    // ADMIN_CORRECTION with correctedById + reason.
    const reasonPrefix = `Admin-Override durch ${user.name || user.email}: `;
    const reason = reasonPrefix + data.reason;
    try {
      if (state.status === "ON_BREAK") {
        await breakEnd(emp.id, {
          expectedCompanyId: user.companyId,
          source: "ADMIN_CORRECTION",
          correctedById: user.id,
          reason,
        });
      }
      await clockOut(emp.id, {
        expectedCompanyId: user.companyId,
        source: "ADMIN_CORRECTION",
        correctedById: user.id,
        reason,
      });
    } catch (e) {
      if (e instanceof PunchError) {
        throw new SheetError(`Stempel-Fehler: ${e.code}`);
      }
      throw e;
    }

    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: emp.id,
      action: "UPDATE",
      entityType: "TimePunch",
      entityId: emp.id,
      reason,
      newValue: { adminOverrideClockOut: true, originalStatus: state.status },
    });

    revalidatePath(`/admin/attendance/${emp.id}/sheet`);
    revalidatePath(`/admin/attendance`);
    return { ok: true };
  } catch (e) {
    if (e instanceof SheetError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    }
    throw e; // unexpected → masked (real bug)
  }
}

// ─────────────────────────────────────────
// 2) Full editing of a day
// ─────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const blockSchema = z
  .object({
    type: z.enum(["WORK", "HOME_OFFICE", "BREAK"]),
    start: z.string().regex(HHMM_RE, "Format HH:MM"),
    end: z.string().regex(HHMM_RE, "Format HH:MM"),
    note: z.string().max(200).optional(),
  })
  .refine((b) => b.start < b.end, {
    message: "End must be after start.",
  });

// Optional single-day absence selected in the day editor.
// `absenceTypeId === null` (or omitted) = no absence for the day.
const dayAbsenceSchema = z
  .object({
    absenceTypeId: z.string().min(1),
    halfDay: z.boolean().default(false),
  })
  .nullable()
  .optional();

const replaceDaySchema = z.object({
  employeeId: z.string().min(1),
  // ISO-Datum YYYY-MM-DD (lokal, Europe/Zurich)
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z
    .string()
    .min(5, "Please provide a reason (at least 5 characters).")
    .max(500),
  blocks: z.array(blockSchema).max(20),
  /** Single-day absence for this day (or null = remove). */
  absence: dayAbsenceSchema,
});

export type ReplaceDayInput = z.input<typeof replaceDaySchema>;

export async function replaceTimeEntryDay(
  input: ReplaceDayInput,
): Promise<SheetActionResult> {
  try {
    return await replaceTimeEntryDayImpl(input);
  } catch (e) {
    if (e instanceof SheetError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
    }
    throw e; // unexpected → masked (real bug)
  }
}

async function replaceTimeEntryDayImpl(
  input: ReplaceDayInput,
): Promise<SheetActionResult> {
  const user = await requireCorrector();
  const data = replaceDaySchema.parse(input);
  // Breaks MAY lie within working time (are deducted).
  // Forbidden: Work∩Work, Break∩Break, Break outside any work.
  const blockError = validateDayBlocks(data.blocks);
  if (blockError) throw new SheetError(blockError);

  const emp = await loadEmployeeOrThrow(data.employeeId, user.companyId);

  // Tenant timezone — determines which calendar day "today" is and
  // how "HH:MM" inputs are converted to UTC (e.g. Asia/Colombo).
  const zone = await resolveCompanyZone(user.companyId);

  // Live lock: ONLY relevant when the edited day is TODAY — only
  // today can have a running (open) time entry. A different day
  // (past/future) is never "live", so being clocked in today MUST
  // NOT block editing of other days.
  // (Previously it blocked globally whenever the employee was clocked
  // in today — which prevented editing OTHER days.)
  const today = localDateString(new Date(), zone);
  if (data.workDate === today) {
    const state = await getCurrentKioskState(emp.id, {
      expectedCompanyId: user.companyId,
    });
    if (state.status === "OPEN" || state.status === "ON_BREAK") {
      throw new SheetError(
        "Today cannot be edited while the employee is clocked in live. " +
          "Please clock out first (via PIN or admin override).",
      );
    }
  }

  const workDate = localMidnightUtc(data.workDate);

  // Before snapshot for audit
  const before = await prisma.timeEntry.findUnique({
    where: { employeeId_workDate: { employeeId: emp.id, workDate } },
    include: { punches: true, breaks: true },
  });

  // Transaction: wipe + recreate
  await prisma.$transaction(async (tx) => {
    if (before) {
      await tx.timePunch.deleteMany({ where: { timeEntryId: before.id } });
      await tx.breakEntry.deleteMany({ where: { timeEntryId: before.id } });
      await tx.timeEntry.delete({ where: { id: before.id } });
    }

    if (data.blocks.length === 0) {
      // Empty day → we leave the TimeEntry row completely out
      return;
    }

    const newEntry = await tx.timeEntry.create({
      data: {
        employeeId: emp.id,
        workDate,
        status: "EMPTY", // wird gleich neu berechnet
      },
    });

    // Per block: create matching TimePunches.
    //   WORK / HOME_OFFICE → CLOCK_IN + CLOCK_OUT (Home Office with
    //                        isHomeOffice=true; computationally identical)
    //   BREAK              → BREAK_START + BREAK_END + BreakEntry row
    const reasonTag = `Sheet-Update durch ${user.name || user.email}: ${data.reason}`;
    const allPunches: Array<{
      type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
      occurredAt: Date;
    }> = [];
    for (const b of data.blocks) {
      const start = combineDateAndTime(data.workDate, b.start, zone);
      const end = combineDateAndTime(data.workDate, b.end, zone);
      if (b.type === "WORK" || b.type === "HOME_OFFICE") {
        const isHomeOffice = b.type === "HOME_OFFICE";
        await tx.timePunch.create({
          data: {
            timeEntryId: newEntry.id,
            employeeId: emp.id,
            type: "CLOCK_IN",
            occurredAt: start,
            source: "ADMIN_CORRECTION",
            isHomeOffice,
            correctedById: user.id,
            reason: reasonTag + (b.note ? ` — ${b.note}` : ""),
          },
        });
        await tx.timePunch.create({
          data: {
            timeEntryId: newEntry.id,
            employeeId: emp.id,
            type: "CLOCK_OUT",
            occurredAt: end,
            source: "ADMIN_CORRECTION",
            isHomeOffice,
            correctedById: user.id,
            reason: reasonTag + (b.note ? ` — ${b.note}` : ""),
          },
        });
        allPunches.push(
          { type: "CLOCK_IN", occurredAt: start },
          { type: "CLOCK_OUT", occurredAt: end },
        );
      } else {
        await tx.timePunch.create({
          data: {
            timeEntryId: newEntry.id,
            employeeId: emp.id,
            type: "BREAK_START",
            occurredAt: start,
            source: "ADMIN_CORRECTION",
            correctedById: user.id,
            reason: reasonTag,
          },
        });
        await tx.timePunch.create({
          data: {
            timeEntryId: newEntry.id,
            employeeId: emp.id,
            type: "BREAK_END",
            occurredAt: end,
            source: "ADMIN_CORRECTION",
            correctedById: user.id,
            reason: reasonTag,
          },
        });
        const minutes = Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 60000),
        );
        await tx.breakEntry.create({
          data: {
            timeEntryId: newEntry.id,
            startedAt: start,
            endedAt: end,
            minutes,
            source: "ADMIN_CORRECTION",
          },
        });
        allPunches.push(
          { type: "BREAK_START", occurredAt: start },
          { type: "BREAK_END", occurredAt: end },
        );
      }
    }

    // Recalculate aggregates — same logic as refreshEntry() in punch.ts
    const result = computeWorkedTime({
      punches: allPunches,
      breaks: data.blocks
        .filter((b) => b.type === "BREAK")
        .map((b) => ({
          startedAt: combineDateAndTime(data.workDate, b.start, zone),
          endedAt: combineDateAndTime(data.workDate, b.end, zone),
        })),
      now: new Date(),
    });
    const sortedPunches = [...allPunches].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    await tx.timeEntry.update({
      where: { id: newEntry.id },
      data: {
        status: allPunches.length === 0 ? "EMPTY" : "CLOSED",
        workedMinutes: result.workedMinutes,
        breakMinutes: result.breakMinutes,
        firstIn:
          sortedPunches.find((p) => p.type === "CLOCK_IN")?.occurredAt ?? null,
        lastOut:
          [...sortedPunches]
            .reverse()
            .find((p) => p.type === "CLOCK_OUT")?.occurredAt ?? null,
      },
    });
  });

  // ── Manage single-day absence ──────────────────────────────
  // The sheet editor manages EXCLUSIVELY single-day absences
  // (startDate == endDate == workDate). Multi-day absences remain
  // untouched — those are managed via /admin/absences.
  // `data.absence === undefined` → don't touch absences (backward compat).
  // `data.absence === null`      → remove single-day absence for this day.
  // `data.absence === {…}`       → set/update single-day absence.
  if (data.absence !== undefined) {
    const existingSingleDay = await prisma.absence.findFirst({
      where: {
        employeeId: emp.id,
        startDate: workDate,
        endDate: workDate,
        deletedAt: null,
        archivedAt: null,
      },
    });

    if (data.absence === null) {
      if (existingSingleDay) {
        await prisma.absence.update({
          where: { id: existingSingleDay.id },
          data: { deletedAt: new Date() },
        });
      }
    } else {
      // Guard: don't create a single-day absence if a multi-day absence
      // already covers this day — otherwise two overlapping records.
      const coveringMultiDay = await prisma.absence.findFirst({
        where: {
          employeeId: emp.id,
          startDate: { lte: workDate },
          endDate: { gte: workDate },
          deletedAt: null,
          archivedAt: null,
          NOT: { id: existingSingleDay?.id ?? "__none__" },
          status: { in: ["APPROVED", "REQUESTED"] },
        },
        select: { id: true, startDate: true, endDate: true },
      });
      if (coveringMultiDay) {
        throw new SheetError(
          "A multi-day absence already exists for this day. " +
            "Please edit via Holidays & Absences.",
        );
      }

      const type = await prisma.absenceType.findFirst({
        where: {
          id: data.absence.absenceTypeId,
          companyId: user.companyId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!type) throw new SheetError("Unknown absence type.");

      const absenceData = {
        absenceTypeId: type.id,
        startHalfDay: data.absence.halfDay,
        endHalfDay: false,
        status: "APPROVED" as const,
        reason: data.reason,
        decidedById: user.id,
        decidedAt: new Date(),
      };

      if (existingSingleDay) {
        await prisma.absence.update({
          where: { id: existingSingleDay.id },
          data: { ...absenceData, deletedAt: null, archivedAt: null },
        });
      } else {
        await prisma.absence.create({
          data: {
            employeeId: emp.id,
            startDate: workDate,
            endDate: workDate,
            ...absenceData,
          },
        });
      }
    }
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: emp.id,
    action: before ? "UPDATE" : "CREATE",
    entityType: "TimeEntry",
    entityId: emp.id, // logisch genug — der Tag ist die Identifikation
    reason: data.reason,
    oldValue: before
      ? {
          workDate: data.workDate,
          punches: before.punches.map((p) => ({
            type: p.type,
            occurredAt: p.occurredAt.toISOString(),
          })),
          breaks: before.breaks.map((b) => ({
            startedAt: b.startedAt.toISOString(),
            endedAt: b.endedAt?.toISOString() ?? null,
          })),
        }
      : { workDate: data.workDate, empty: true },
    newValue: {
      workDate: data.workDate,
      blocks: data.blocks,
      absence: data.absence ?? null,
    },
  });

  revalidatePath(`/admin/attendance/${emp.id}/sheet`);
  revalidatePath(`/admin/attendance`);
  revalidatePath(`/admin/time-entries`);
  revalidatePath(`/admin/absences`);
  return { ok: true };
}
