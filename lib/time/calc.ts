// Pure calculation logic. Has no I/O; takes plain data and returns plain
// results. This makes it cheap to unit-test and reuse on the server.
//
// Domain notes:
//   - Worked time = sum of (clock_out - clock_in) intervals minus break time
//     fully contained inside those intervals. Open intervals (still clocked
//     in) are extended to a "now" timestamp passed by the caller so the
//     kiosk can show live counters.
//   - Targets are determined by the employee's WorkScheduleDay rows.
//     Holidays and absences with `reducesTarget` reduce the day's target
//     to zero (or proportionally for half-days).
//   - Hourly-wage employees with no weekly target never accrue negative
//     balances unless an admin explicitly defines daily targets for them.

import { WeekDay } from "@prisma/client";

export const WEEKDAY_ORDER: WeekDay[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

export interface WorkScheduleDayInput {
  weekday: WeekDay;
  targetHours: number;
}

export interface PunchInput {
  type: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
  occurredAt: Date;
}

export interface BreakInput {
  startedAt: Date;
  endedAt: Date | null;
}

export interface DailyTargetContext {
  scheduleDays: WorkScheduleDayInput[];
  isHoliday?: boolean;
  holidayFraction?: number; // 0..1
  /** Sum of fractions of the day covered by absences that reduce the target. */
  absenceReducesFraction?: number;
}

/** Map a JS-style Mon=0..Sun=6 index to the Prisma WeekDay enum. */
export function weekdayFromIndex(idx: number): WeekDay {
  return WEEKDAY_ORDER[((idx % 7) + 7) % 7];
}

export function getDailyTargetMinutes(
  weekday: WeekDay,
  ctx: DailyTargetContext
): number {
  const day = ctx.scheduleDays.find((d) => d.weekday === weekday);
  const baseMinutes = Math.round((day?.targetHours ?? 0) * 60);
  if (baseMinutes === 0) return 0;

  // Holiday reduces target proportionally.
  if (ctx.isHoliday) {
    const fraction = ctx.holidayFraction ?? 1;
    const remaining = Math.max(0, 1 - fraction);
    return Math.round(baseMinutes * remaining);
  }

  // Absences reduce target proportionally.
  const absenceFraction = Math.min(1, Math.max(0, ctx.absenceReducesFraction ?? 0));
  if (absenceFraction > 0) {
    return Math.round(baseMinutes * (1 - absenceFraction));
  }

  return baseMinutes;
}

export interface WorkedTimeContext {
  punches: PunchInput[];
  breaks: BreakInput[];
  /** Used to extend an open clock-in interval. Defaults to last clock-in time. */
  now?: Date;
}

export interface WorkedTimeResult {
  workedMinutes: number;
  breakMinutes: number;
  /** True if there is a CLOCK_IN without a matching CLOCK_OUT. */
  isOpen: boolean;
  /** True if last meaningful state was BREAK_START without BREAK_END. */
  isOnBreak: boolean;
  /** Pairs of clock-in/clock-out used for further analysis. */
  intervals: { start: Date; end: Date; open: boolean }[];
}

/**
 * Compute worked + break minutes from raw punches and breaks.
 * Tolerant to slightly inconsistent ordering by sorting by occurredAt.
 */
export function computeWorkedTime(ctx: WorkedTimeContext): WorkedTimeResult {
  const punches = [...ctx.punches].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );

  // Build clock-in / clock-out intervals.
  const intervals: { start: Date; end: Date; open: boolean }[] = [];
  let currentStart: Date | null = null;
  let isOnBreak = false;

  for (const p of punches) {
    if (p.type === "CLOCK_IN" && !currentStart) {
      currentStart = p.occurredAt;
      isOnBreak = false;
    } else if (p.type === "CLOCK_OUT" && currentStart) {
      intervals.push({ start: currentStart, end: p.occurredAt, open: false });
      currentStart = null;
      isOnBreak = false;
    } else if (p.type === "BREAK_START") {
      isOnBreak = true;
    } else if (p.type === "BREAK_END") {
      isOnBreak = false;
    }
  }

  // If still clocked in, extend interval to "now".
  const now = ctx.now ?? new Date();
  if (currentStart) {
    intervals.push({ start: currentStart, end: now, open: true });
  }

  // Compute break minutes (closed breaks; for an open break, extend to now).
  let breakMinutes = 0;
  for (const b of ctx.breaks) {
    const end = b.endedAt ?? now;
    breakMinutes += Math.max(0, Math.round((end.getTime() - b.startedAt.getTime()) / 60000));
  }

  // Sum of worked intervals minus breaks (clamped to >= 0).
  const grossMinutes = intervals.reduce(
    (acc, i) => acc + Math.round((i.end.getTime() - i.start.getTime()) / 60000),
    0
  );
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  return {
    workedMinutes,
    breakMinutes,
    isOpen: currentStart !== null,
    isOnBreak,
    intervals,
  };
}

export function applyRounding(minutes: number, roundingMinutes: number): number {
  if (!roundingMinutes || roundingMinutes <= 0) return minutes;
  return Math.round(minutes / roundingMinutes) * roundingMinutes;
}

export interface WeeklyAggregate {
  targetMinutes: number;
  workedMinutes: number;
  balanceMinutes: number;
  remainingMinutes: number;
}

export function aggregateWeek(days: { targetMinutes: number; workedMinutes: number }[]): WeeklyAggregate {
  const target = days.reduce((s, d) => s + d.targetMinutes, 0);
  const worked = days.reduce((s, d) => s + d.workedMinutes, 0);
  return {
    targetMinutes: target,
    workedMinutes: worked,
    balanceMinutes: worked - target,
    remainingMinutes: Math.max(0, target - worked),
  };
}

/** Detect missing clock-out: a CLOCK_IN punch from a previous day with no CLOCK_OUT. */
export function detectMissingClockOut(punches: PunchInput[]): boolean {
  const sorted = [...punches].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
  );
  let inOpen = false;
  for (const p of sorted) {
    if (p.type === "CLOCK_IN") inOpen = true;
    if (p.type === "CLOCK_OUT") inOpen = false;
  }
  return inOpen;
}

/** Detect long workday (gross > maxDailyMinutes). */
export function detectLongWorkday(workedMinutes: number, maxDailyMinutes: number): boolean {
  return workedMinutes > maxDailyMinutes;
}

/** Detect missing break for workdays > 5.5 h (Swiss ArG threshold for 30-min break). */
export function detectMissingBreak(workedMinutes: number, breakMinutes: number): boolean {
  return workedMinutes > 5.5 * 60 && breakMinutes < 30;
}

/** Vacation balance for the year: entitlement + carry-over - used. */
export interface VacationContext {
  annualDays: number;
  carryOverDays: number;
  usedDays: number; // includes approved + already-taken
  plannedDays: number; // requested but not yet decided
}

export interface VacationBalance {
  totalDays: number;
  usedDays: number;
  plannedDays: number;
  remainingDays: number;
}

export function calculateVacationBalance(ctx: VacationContext): VacationBalance {
  const total = ctx.annualDays + ctx.carryOverDays;
  return {
    totalDays: total,
    usedDays: ctx.usedDays,
    plannedDays: ctx.plannedDays,
    remainingDays: total - ctx.usedDays - ctx.plannedDays,
  };
}
