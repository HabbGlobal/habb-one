import { describe, expect, it } from "vitest";
import {
  aggregateWeek,
  applyRounding,
  calculateVacationBalance,
  computeWorkedTime,
  detectLongWorkday,
  detectMissingBreak,
  detectMissingClockOut,
  getDailyTargetMinutes,
  weekdayFromIndex,
} from "./calc";

const d = (iso: string) => new Date(iso);

describe("getDailyTargetMinutes", () => {
  const fullTimeSchedule = [
    { weekday: "MON" as const, targetHours: 8.4 },
    { weekday: "TUE" as const, targetHours: 8.4 },
    { weekday: "WED" as const, targetHours: 8.4 },
    { weekday: "THU" as const, targetHours: 8.4 },
    { weekday: "FRI" as const, targetHours: 8.4 },
    { weekday: "SAT" as const, targetHours: 0 },
    { weekday: "SUN" as const, targetHours: 0 },
  ];

  it("returns scheduled target for a regular weekday", () => {
    expect(getDailyTargetMinutes("MON", { scheduleDays: fullTimeSchedule })).toBe(504);
  });

  it("returns 0 for non-working day", () => {
    expect(getDailyTargetMinutes("SAT", { scheduleDays: fullTimeSchedule })).toBe(0);
  });

  it("zeroes target on a full holiday", () => {
    expect(
      getDailyTargetMinutes("MON", { scheduleDays: fullTimeSchedule, isHoliday: true })
    ).toBe(0);
  });

  it("halves target on a half-day holiday", () => {
    expect(
      getDailyTargetMinutes("MON", {
        scheduleDays: fullTimeSchedule,
        isHoliday: true,
        holidayFraction: 0.5,
      })
    ).toBe(252);
  });

  it("zeroes target on a full-day vacation", () => {
    expect(
      getDailyTargetMinutes("MON", {
        scheduleDays: fullTimeSchedule,
        absenceReducesFraction: 1,
      })
    ).toBe(0);
  });

  it("halves target on a half-day vacation", () => {
    expect(
      getDailyTargetMinutes("MON", {
        scheduleDays: fullTimeSchedule,
        absenceReducesFraction: 0.5,
      })
    ).toBe(252);
  });
});

describe("computeWorkedTime", () => {
  it("computes a single closed work block minus break", () => {
    const result = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T07:30:00Z") },
        { type: "CLOCK_OUT", occurredAt: d("2026-05-04T16:00:00Z") },
      ],
      breaks: [
        { startedAt: d("2026-05-04T12:00:00Z"), endedAt: d("2026-05-04T12:30:00Z") },
      ],
    });
    // 8h30 gross - 30min break = 8h
    expect(result.workedMinutes).toBe(480);
    expect(result.breakMinutes).toBe(30);
    expect(result.isOpen).toBe(false);
  });

  it("supports multiple work blocks (e.g. lunch break by clocking out and in)", () => {
    const result = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T07:30:00Z") },
        { type: "CLOCK_OUT", occurredAt: d("2026-05-04T12:00:00Z") },
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T13:00:00Z") },
        { type: "CLOCK_OUT", occurredAt: d("2026-05-04T17:15:00Z") },
      ],
      breaks: [],
    });
    // 4h30 + 4h15 = 8h45
    expect(result.workedMinutes).toBe(525);
  });

  it("extends an open clock-in to `now`", () => {
    const now = d("2026-05-04T11:00:00Z");
    const result = computeWorkedTime({
      punches: [{ type: "CLOCK_IN", occurredAt: d("2026-05-04T08:00:00Z") }],
      breaks: [],
      now,
    });
    expect(result.isOpen).toBe(true);
    expect(result.workedMinutes).toBe(180);
  });

  it("flags on-break state", () => {
    const result = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T08:00:00Z") },
        { type: "BREAK_START", occurredAt: d("2026-05-04T12:00:00Z") },
      ],
      breaks: [{ startedAt: d("2026-05-04T12:00:00Z"), endedAt: null }],
      now: d("2026-05-04T12:15:00Z"),
    });
    expect(result.isOnBreak).toBe(true);
    expect(result.isOpen).toBe(true);
    // Gross 4h15, minus 15-min open break = 4h
    expect(result.workedMinutes).toBe(240);
  });

  it("does not produce negative worked minutes when break exceeds gross", () => {
    const result = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T08:00:00Z") },
        { type: "CLOCK_OUT", occurredAt: d("2026-05-04T08:30:00Z") },
      ],
      breaks: [
        { startedAt: d("2026-05-04T08:00:00Z"), endedAt: d("2026-05-04T09:00:00Z") },
      ],
    });
    expect(result.workedMinutes).toBe(0);
  });
});

describe("applyRounding", () => {
  it("returns input when rounding is 0", () => {
    expect(applyRounding(457, 0)).toBe(457);
  });
  it("rounds to 5", () => {
    expect(applyRounding(457, 5)).toBe(455);
  });
  it("rounds to 15", () => {
    // 457 / 15 = 30.466... → 30 * 15 = 450
    expect(applyRounding(457, 15)).toBe(450);
    // 460 / 15 = 30.666... → 31 * 15 = 465
    expect(applyRounding(460, 15)).toBe(465);
  });
});

describe("aggregateWeek", () => {
  it("computes target/worked/balance/remaining", () => {
    const week = aggregateWeek([
      { targetMinutes: 504, workedMinutes: 510 },
      { targetMinutes: 504, workedMinutes: 480 },
      { targetMinutes: 504, workedMinutes: 504 },
      { targetMinutes: 504, workedMinutes: 0 },
      { targetMinutes: 504, workedMinutes: 504 },
    ]);
    expect(week.targetMinutes).toBe(2520);
    expect(week.workedMinutes).toBe(1998);
    expect(week.balanceMinutes).toBe(-522);
    expect(week.remainingMinutes).toBe(522);
  });
});

describe("detectors", () => {
  it("detectMissingClockOut: clock-in without out", () => {
    expect(
      detectMissingClockOut([
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T07:30:00Z") },
      ])
    ).toBe(true);
  });
  it("detectMissingClockOut: balanced", () => {
    expect(
      detectMissingClockOut([
        { type: "CLOCK_IN", occurredAt: d("2026-05-04T07:30:00Z") },
        { type: "CLOCK_OUT", occurredAt: d("2026-05-04T16:00:00Z") },
      ])
    ).toBe(false);
  });
  it("detectLongWorkday: > threshold", () => {
    expect(detectLongWorkday(11 * 60, 10 * 60)).toBe(true);
    expect(detectLongWorkday(9 * 60, 10 * 60)).toBe(false);
  });
  it("detectMissingBreak: > 5.5h with <30min break", () => {
    expect(detectMissingBreak(6 * 60, 0)).toBe(true);
    expect(detectMissingBreak(6 * 60, 30)).toBe(false);
    expect(detectMissingBreak(5 * 60, 0)).toBe(false);
  });
});

describe("calculateVacationBalance", () => {
  it("computes remaining days correctly", () => {
    expect(
      calculateVacationBalance({
        annualDays: 25,
        carryOverDays: 3,
        usedDays: 10,
        plannedDays: 5,
      })
    ).toEqual({
      totalDays: 28,
      usedDays: 10,
      plannedDays: 5,
      remainingDays: 13,
    });
  });
});

describe("weekdayFromIndex", () => {
  it("maps 0..6 to MON..SUN", () => {
    expect(weekdayFromIndex(0)).toBe("MON");
    expect(weekdayFromIndex(4)).toBe("FRI");
    expect(weekdayFromIndex(6)).toBe("SUN");
    expect(weekdayFromIndex(7)).toBe("MON");
  });
});
