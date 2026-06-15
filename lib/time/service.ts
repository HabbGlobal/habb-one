// Service layer that ties Prisma data to the pure calculation logic.
// All "expensive" reads happen here so route handlers stay thin.

import { prisma } from "@/lib/prisma";
import {
  aggregateWeek,
  computeWorkedTime,
  getDailyTargetMinutes,
  weekdayFromIndex,
  type WorkScheduleDayInput,
} from "./calc";
import { localDateString, localMidnightUtc, DEFAULT_ZONE } from "./zone";
import { addDays, startOfWeek, endOfWeek, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * Löst die Zeitzone der Company eines Mitarbeiters auf (Default
 * Europe/Zurich). Server-only (prisma) — deshalb hier, nicht in zone.ts.
 */
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

export interface DayStats {
  date: string;
  weekday: string;
  targetMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  balanceMinutes: number;
  remainingMinutes: number;
  isOpen: boolean;
  isOnBreak: boolean;
  isHoliday: boolean;
  holidayName?: string;
  absence?: {
    /** Absence-Record-ID — für die Bearbeitung im Sheet-Editor. */
    id: string;
    typeKey: string;
    typeId: string;
    labelDe: string;
    labelEn: string;
    colorHex: string;
    /** Halbtag (startHalfDay || endHalfDay) → 0.5-Soll-Reduktion. */
    halfDay: boolean;
    /** true wenn die Absence über mehrere Tage geht (im Sheet read-only). */
    isMultiDay: boolean;
    reducesTarget: boolean;
    countsAsWorked: boolean;
  };
}

/** Days of the current ISO week containing `today` (Mon..Sun) as YYYY-MM-DD strings. */
export function weekDates(today: Date, zone: string = DEFAULT_ZONE): string[] {
  const local = toZonedTime(today, zone);
  const monday = startOfWeek(local, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(monday, i), "yyyy-MM-dd")
  );
}

export function monthDates(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return format(d, "yyyy-MM-dd");
  });
}

interface EmployeeWithSchedule {
  id: string;
  scheduleDays: WorkScheduleDayInput[];
}

/**
 * Default-Wochenverteilung Mo-Fr (5 Tage). Wird verwendet, wenn ein
 * Mitarbeiter `weeklyTargetHours` gesetzt hat, aber keine expliziten
 * `WorkScheduleDay`-Zeilen — typischer Zustand nach einem Bulk-Import,
 * der nur das Scalar-Feld befüllt. Ohne diesen Fallback würde der Kiosk
 * "Soll 0:00" anzeigen, obwohl die Wochenstunden konfiguriert sind.
 */
const DEFAULT_WORKDAYS: readonly WorkScheduleDayInput["weekday"][] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
];

function synthesizeScheduleFromWeekly(
  weeklyHours: number,
): WorkScheduleDayInput[] {
  const perDay = weeklyHours / DEFAULT_WORKDAYS.length;
  return DEFAULT_WORKDAYS.map((weekday) => ({
    weekday,
    targetHours: perDay,
  }));
}

async function loadEmployeeWithSchedule(employeeId: string): Promise<EmployeeWithSchedule> {
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: {
      id: true,
      weeklyTargetHours: true,
      scheduleDays: { select: { weekday: true, targetHours: true } },
    },
  });

  // Fallback: wenn KEINE explizite Wochenverteilung vorhanden ist
  // (Bulk-Import-Lücke), aber das Scalar-Feld `weeklyTargetHours` > 0,
  // synthetisieren wir die Tagesverteilung Mo-Fr at runtime. So bleibt
  // `WorkScheduleDay` weiterhin die Source-of-Truth, falls explizit
  // gesetzt — nur wenn sie fehlt, springt der Fallback ein.
  const scheduleSum = e.scheduleDays.reduce(
    (s, d) => s + d.targetHours,
    0,
  );
  const needsFallback =
    scheduleSum === 0 && (e.weeklyTargetHours ?? 0) > 0;
  const effectiveSchedule = needsFallback
    ? synthesizeScheduleFromWeekly(e.weeklyTargetHours ?? 0)
    : e.scheduleDays;

  return { id: e.id, scheduleDays: effectiveSchedule };
}

/** Pull holidays + absences for a date range so we can derive per-day target reductions. */
async function loadDayContext(
  employeeId: string,
  dates: string[],
  zone: string = DEFAULT_ZONE,
) {
  if (dates.length === 0) {
    return { holidays: new Map(), absences: new Map() };
  }
  const start = localMidnightUtc(dates[0]);
  const end = localMidnightUtc(dates[dates.length - 1]);

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { companyId: true },
  });

  const [holidays, absences] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        companyId: employee.companyId,
        date: { gte: start, lte: end },
        // Archived/deleted holidays no longer affect target hours.
        archivedAt: null,
        deletedAt: null,
      },
    }),
    prisma.absence.findMany({
      where: {
        employeeId,
        status: { in: ["APPROVED", "REQUESTED"] },
        startDate: { lte: end },
        endDate: { gte: start },
        archivedAt: null,
        deletedAt: null,
      },
      include: { absenceType: true },
    }),
  ]);

  const holidayMap = new Map<string, (typeof holidays)[number]>();
  holidays.forEach((h) => holidayMap.set(localDateString(h.date, zone), h));

  const absenceMap = new Map<string, (typeof absences)[number]>();
  for (const a of absences) {
    const start = localDateString(a.startDate, zone);
    const end = localDateString(a.endDate, zone);
    // Walk inclusive range
    let cursor = start;
    while (cursor <= end) {
      absenceMap.set(cursor, a);
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      cursor = format(next, "yyyy-MM-dd");
    }
  }

  return { holidays: holidayMap, absences: absenceMap };
}

/**
 * Defense-in-Depth-Helper: stellt sicher dass `employeeId` zur erwarteten
 * Company gehört, bevor wir teure Time-Queries fahren. Caller, die schon
 * vorher per Page-Auth scopen, müssen das nicht doppelt machen — aber wenn
 * eine Route die Employee-ID direkt aus dem URL nimmt, sollte sie es tun.
 */
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
    throw new Error(
      `Time-Service: Employee ${employeeId} does not belong to the expected company.`,
    );
  }
}

export interface TimeServiceOptions {
  /** Wenn gesetzt, wird employeeId.companyId === expectedCompanyId
   *  durchgesetzt — Defense-in-Depth gegen Cross-Tenant-Aufrufe. */
  expectedCompanyId?: string;
  /** Mandanten-Zeitzone (IANA). Wenn nicht gesetzt, wird sie aus der
   *  Company des Mitarbeiters aufgelöst (Default Europe/Zurich). */
  zone?: string;
}

/** Return per-day stats for the given dates. */
export async function getDayStatsForRange(
  employeeId: string,
  dates: string[],
  now: Date = new Date(),
  options: TimeServiceOptions = {},
): Promise<DayStats[]> {
  await assertEmployeeInCompany(employeeId, options.expectedCompanyId);
  if (dates.length === 0) return [];
  const zone = options.zone ?? (await resolveEmployeeZone(employeeId));
  const employee = await loadEmployeeWithSchedule(employeeId);
  const { holidays, absences } = await loadDayContext(employeeId, dates, zone);

  const start = localMidnightUtc(dates[0]);
  const end = localMidnightUtc(dates[dates.length - 1]);
  const entries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      workDate: { gte: start, lte: end },
    },
    include: { punches: true, breaks: true },
  });
  const entryMap = new Map(entries.map((e) => [localDateString(e.workDate, zone), e]));

  return dates.map((date) => {
    const wd = weekdayFromIndex(weekdayIndex(date, zone));
    const holiday = holidays.get(date);
    const absence = absences.get(date);
    const isHalfDay = !!(absence && (absence.startHalfDay || absence.endHalfDay));
    const absenceFraction = absence?.absenceType.reducesTarget
      ? isHalfDay
        ? 0.5
        : 1
      : 0;

    // Basis-Soll OHNE Absence-Reduktion — Referenz für countsAsWorked.
    const baseTarget = getDailyTargetMinutes(wd, {
      scheduleDays: employee.scheduleDays,
      isHoliday: !!holiday,
      holidayFraction: holiday?.fraction ?? 1,
    });
    // Effektives Soll MIT Absence-Reduktion (reducesTarget-Typen).
    const target = getDailyTargetMinutes(wd, {
      scheduleDays: employee.scheduleDays,
      isHoliday: !!holiday,
      holidayFraction: holiday?.fraction ?? 1,
      absenceReducesFraction: absenceFraction,
    });

    const entry = entryMap.get(date);
    let workedMinutes = 0;
    let breakMinutes = 0;
    let isOpen = false;
    let isOnBreak = false;
    if (entry) {
      const result = computeWorkedTime({
        punches: entry.punches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
        breaks: entry.breaks.map((b) => ({ startedAt: b.startedAt, endedAt: b.endedAt })),
        now,
      });
      workedMinutes = result.workedMinutes;
      breakMinutes = result.breakMinutes;
      isOpen = result.isOpen;
      isOnBreak = result.isOnBreak;
    }

    // countsAsWorked: Typen wie "bezahlter Arzttermin" / "Weiterbildung"
    // schreiben ihre Stunden der Ist-Zeit gut. Quelle der Stunden:
    //   1. explizite absence.hours (falls gesetzt)
    //   2. sonst Basis-Soll des Tages × Fraction (Halbtag → 0.5)
    if (absence?.absenceType.countsAsWorked) {
      const fraction = isHalfDay ? 0.5 : 1;
      const creditedMinutes =
        absence.hours != null
          ? Math.round(absence.hours * 60)
          : Math.round(baseTarget * fraction);
      workedMinutes += creditedMinutes;
    }

    return {
      date,
      weekday: wd,
      targetMinutes: target,
      workedMinutes,
      breakMinutes,
      balanceMinutes: workedMinutes - target,
      remainingMinutes: Math.max(0, target - workedMinutes),
      isOpen,
      isOnBreak,
      isHoliday: !!holiday,
      holidayName: holiday?.nameDe,
      absence: absence
        ? {
            id: absence.id,
            typeKey: absence.absenceType.key,
            typeId: absence.absenceTypeId,
            labelDe: absence.absenceType.labelDe,
            labelEn: absence.absenceType.labelEn,
            colorHex: absence.absenceType.colorHex,
            halfDay: isHalfDay,
            isMultiDay:
              localDateString(absence.startDate, zone) !==
              localDateString(absence.endDate, zone),
            reducesTarget: absence.absenceType.reducesTarget,
            countsAsWorked: absence.absenceType.countsAsWorked,
          }
        : undefined,
    };
  });
}

function weekdayIndex(dateStr: string, zone: string = DEFAULT_ZONE): number {
  const d = localMidnightUtc(dateStr);
  const local = toZonedTime(d, zone);
  return (local.getDay() + 6) % 7; // Mon = 0
}

export async function getEmployeeKioskSummary(
  employeeId: string,
  now: Date = new Date(),
  options: TimeServiceOptions = {},
) {
  const zone = options.zone ?? (await resolveEmployeeZone(employeeId));
  const today = localDateString(now, zone);
  const week = weekDates(now, zone);
  const days = await getDayStatsForRange(employeeId, week, now, { ...options, zone });
  const todayStats = days.find((d) => d.date === today);
  const weekTotals = aggregateWeek(days);
  return { today: todayStats, week: days, weekTotals };
}

export async function getMonthlyTotals(
  employeeId: string,
  year: number,
  month: number,
  now: Date = new Date(),
  options: TimeServiceOptions = {},
) {
  const zone = options.zone ?? (await resolveEmployeeZone(employeeId));
  const dates = monthDates(year, month);
  const days = await getDayStatsForRange(employeeId, dates, now, { ...options, zone });
  const totals = aggregateWeek(days); // structurally identical aggregation
  return { days, totals };
}
