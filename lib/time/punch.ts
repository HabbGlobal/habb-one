// Mutating operations on time entries: clock in/out, break start/end, manual
// corrections. All paths go through here so business rules live in one place.

import { prisma } from "@/lib/prisma";
import { TimeEntryStatus, type PunchType, type PunchSource } from "@prisma/client";
import { localDateString, localMidnightUtc, DEFAULT_ZONE } from "./zone";
import { computeWorkedTime } from "./calc";

export class PunchError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Mandanten-Zeitzone des Mitarbeiters (Default Europe/Zurich). */
async function resolveEmployeeZone(employeeId: string): Promise<string> {
  try {
    const e = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { company: { select: { timezone: true } } },
    });
    return e?.company?.timezone || DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

async function ensureTimeEntry(employeeId: string, when: Date, zone: string) {
  const dateStr = localDateString(when, zone);
  const workDate = localMidnightUtc(dateStr);
  const existing = await prisma.timeEntry.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { punches: true, breaks: true },
  });
  if (existing) return existing;
  return prisma.timeEntry.create({
    data: {
      employeeId,
      workDate,
      status: "EMPTY",
    },
    include: { punches: true, breaks: true },
  });
}

async function refreshEntry(timeEntryId: string) {
  const entry = await prisma.timeEntry.findUniqueOrThrow({
    where: { id: timeEntryId },
    include: { punches: true, breaks: true },
  });
  const result = computeWorkedTime({
    punches: entry.punches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
    breaks: entry.breaks.map((b) => ({ startedAt: b.startedAt, endedAt: b.endedAt })),
    now: new Date(),
  });
  let status: TimeEntryStatus = "EMPTY";
  if (entry.punches.length > 0) {
    if (result.isOnBreak) status = "ON_BREAK";
    else if (result.isOpen) status = "OPEN";
    else status = "CLOSED";
  }
  const sortedPunches = [...entry.punches].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  await prisma.timeEntry.update({
    where: { id: timeEntryId },
    data: {
      status,
      workedMinutes: result.workedMinutes,
      breakMinutes: result.breakMinutes,
      firstIn: sortedPunches.find((p) => p.type === "CLOCK_IN")?.occurredAt ?? null,
      lastOut:
        [...sortedPunches]
          .reverse()
          .find((p) => p.type === "CLOCK_OUT")?.occurredAt ?? null,
    },
  });
}

interface PunchOptions {
  source?: PunchSource;
  now?: Date;
  /**
   * Defense-in-Depth: wenn gesetzt, prüft die Library dass employeeId zur
   * angegebenen Company gehört. Verhindert dass eine Kiosk-Route mit
   * verlorener Auth-Disziplin Stempelungen für fremde Mandanten erzeugt.
   * Production-Caller (z.B. /api/kiosk/punch) MÜSSEN das setzen — Tests
   * dürfen es weglassen.
   */
  expectedCompanyId?: string;
  /**
   * Audit-Felder für manuelle Korrekturen durch CEO/Sekretariat:
   * - `correctedById` = User.id des Admins, der die Korrektur durchführt
   * - `reason`        = Pflicht-Grund (z. B. "Vergessen auszustempeln")
   * Werden in TimePunch.correctedById / .reason geschrieben. Kiosk-Aufrufe
   * lassen beide weg → bleiben null wie bisher.
   */
  correctedById?: string;
  reason?: string;
}

async function assertEmployeeInCompany(
  employeeId: string,
  expectedCompanyId: string | undefined,
) {
  if (!expectedCompanyId) return;
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { companyId: true },
  });
  if (!emp || emp.companyId !== expectedCompanyId) {
    throw new PunchError(
      "CROSS_TENANT",
      `Employee ${employeeId} does not belong to expected company ${expectedCompanyId}.`,
    );
  }
}

/**
 * Validates that inserting `newType` at `newOccurredAt` keeps the punch
 * timeline for a time entry consistent. Unlike `addPunch`'s inline checks
 * (which only ever append at "now"), this replays the full sorted timeline
 * because admin corrections can backdate a punch to any point in it. Throws
 * PunchError on an exact-duplicate punch or a state-machine violation (e.g.
 * a CLOCK_OUT with no preceding CLOCK_IN).
 */
export function validatePunchInsertion(
  existingPunches: { type: PunchType; occurredAt: Date }[],
  newType: PunchType,
  newOccurredAt: Date
) {
  const isDuplicate = existingPunches.some(
    (p) => p.type === newType && p.occurredAt.getTime() === newOccurredAt.getTime()
  );
  if (isDuplicate) {
    throw new PunchError(
      "DUPLICATE_PUNCH",
      `A ${newType} punch already exists at this exact time.`
    );
  }

  const timeline = [...existingPunches, { type: newType, occurredAt: newOccurredAt }].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );

  let isClockedIn = false;
  let isOnBreak = false;
  for (const p of timeline) {
    switch (p.type) {
      case "CLOCK_IN":
        if (isClockedIn) throw new PunchError("ALREADY_CLOCKED_IN", "Already clocked in at this time.");
        isClockedIn = true;
        break;
      case "CLOCK_OUT":
        if (!isClockedIn) throw new PunchError("NOT_CLOCKED_IN", "Cannot clock out before clocking in.");
        isClockedIn = false;
        isOnBreak = false;
        break;
      case "BREAK_START":
        if (!isClockedIn) throw new PunchError("NOT_CLOCKED_IN", "Cannot start a break before clocking in.");
        if (isOnBreak) throw new PunchError("ALREADY_ON_BREAK", "Already on break at this time.");
        isOnBreak = true;
        break;
      case "BREAK_END":
        if (!isOnBreak) throw new PunchError("NOT_ON_BREAK", "No break in progress at this time.");
        isOnBreak = false;
        break;
    }
  }
}

async function addPunch(
  employeeId: string,
  type: PunchType,
  options: PunchOptions = {}
) {
  await assertEmployeeInCompany(employeeId, options.expectedCompanyId);
  const when = options.now ?? new Date();
  const zone = await resolveEmployeeZone(employeeId);
  const entry = await ensureTimeEntry(employeeId, when, zone);
  // State validation
  const sorted = [...entry.punches].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  const lastClockIn = [...sorted].reverse().find((p) => p.type === "CLOCK_IN");
  const lastClockOut = [...sorted].reverse().find((p) => p.type === "CLOCK_OUT");
  const isClockedIn =
    lastClockIn && (!lastClockOut || lastClockIn.occurredAt > lastClockOut.occurredAt);
  const lastBreakStart = [...sorted].reverse().find((p) => p.type === "BREAK_START");
  const lastBreakEnd = [...sorted].reverse().find((p) => p.type === "BREAK_END");
  const isOnBreak =
    lastBreakStart && (!lastBreakEnd || lastBreakStart.occurredAt > lastBreakEnd.occurredAt);

  switch (type) {
    case "CLOCK_IN":
      if (isClockedIn) throw new PunchError("ALREADY_CLOCKED_IN", "Already clocked in.");
      break;
    case "CLOCK_OUT":
      if (!isClockedIn) throw new PunchError("NOT_CLOCKED_IN", "Not clocked in.");
      if (isOnBreak) {
        // Auto-end the break before clocking out.
        await prisma.timePunch.create({
          data: {
            timeEntryId: entry.id,
            employeeId,
            type: "BREAK_END",
            occurredAt: when,
            source: options.source ?? "KIOSK",
            correctedById: options.correctedById,
            reason: options.reason,
          },
        });
        await prisma.breakEntry.updateMany({
          where: { timeEntryId: entry.id, endedAt: null },
          data: {
            endedAt: when,
          },
        });
      }
      break;
    case "BREAK_START":
      if (!isClockedIn) throw new PunchError("NOT_CLOCKED_IN", "Not clocked in.");
      if (isOnBreak) throw new PunchError("ALREADY_ON_BREAK", "Already on break.");
      break;
    case "BREAK_END":
      if (!isOnBreak) throw new PunchError("NOT_ON_BREAK", "No break in progress.");
      break;
  }

  await prisma.timePunch.create({
    data: {
      timeEntryId: entry.id,
      employeeId,
      type,
      occurredAt: when,
      source: options.source ?? "KIOSK",
      correctedById: options.correctedById,
      reason: options.reason,
    },
  });

  if (type === "BREAK_START") {
    await prisma.breakEntry.create({
      data: { timeEntryId: entry.id, startedAt: when, source: options.source ?? "KIOSK" },
    });
  }
  if (type === "BREAK_END") {
    const open = await prisma.breakEntry.findFirst({
      where: { timeEntryId: entry.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (open) {
      const minutes = Math.max(
        0,
        Math.round((when.getTime() - open.startedAt.getTime()) / 60000)
      );
      await prisma.breakEntry.update({
        where: { id: open.id },
        data: { endedAt: when, minutes },
      });
    }
  }

  await refreshEntry(entry.id);
}

export const clockIn = (employeeId: string, options?: PunchOptions) =>
  addPunch(employeeId, "CLOCK_IN", options);
export const clockOut = (employeeId: string, options?: PunchOptions) =>
  addPunch(employeeId, "CLOCK_OUT", options);
export const breakStart = (employeeId: string, options?: PunchOptions) =>
  addPunch(employeeId, "BREAK_START", options);
export const breakEnd = (employeeId: string, options?: PunchOptions) =>
  addPunch(employeeId, "BREAK_END", options);

/** Determine the next sensible action for the kiosk. */
export async function getCurrentKioskState(
  employeeId: string,
  options: { expectedCompanyId?: string } = {},
) {
  await assertEmployeeInCompany(employeeId, options.expectedCompanyId);
  const zone = await resolveEmployeeZone(employeeId);
  const today = localDateString(new Date(), zone);
  const workDate = localMidnightUtc(today);
  const entry = await prisma.timeEntry.findUnique({
    where: { employeeId_workDate: { employeeId, workDate } },
    include: { punches: { orderBy: { occurredAt: "asc" } } },
  });
  if (!entry) return { status: "OUT" as const };
  return { status: entry.status, lastIn: entry.firstIn, lastOut: entry.lastOut };
}
