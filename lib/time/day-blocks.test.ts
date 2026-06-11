import { describe, it, expect } from "vitest";
import { validateDayBlocks } from "./day-blocks";
import { computeWorkedTime } from "./calc";

describe("validateDayBlocks — Pausen innerhalb Arbeitszeit", () => {
  it("akzeptiert Anwesenheit + Pause innerhalb (der eigentliche Use-Case)", () => {
    // 08:00–17:15 Anwesenheit, Mittag 12:00–12:30 darin
    expect(
      validateDayBlocks([
        { type: "WORK", start: "08:00", end: "17:15" },
        { type: "BREAK", start: "12:00", end: "12:30" },
      ]),
    ).toBeNull();
  });

  it("akzeptiert mehrere Pausen innerhalb einer Arbeitszeit", () => {
    expect(
      validateDayBlocks([
        { type: "WORK", start: "08:00", end: "17:15" },
        { type: "BREAK", start: "09:30", end: "09:45" },
        { type: "BREAK", start: "12:00", end: "12:30" },
      ]),
    ).toBeNull();
  });

  it("akzeptiert Pause exakt an den Arbeitszeit-Grenzen", () => {
    expect(
      validateDayBlocks([
        { type: "WORK", start: "08:00", end: "12:00" },
        { type: "BREAK", start: "08:00", end: "08:15" },
      ]),
    ).toBeNull();
  });

  it("leerer Tag ist gültig", () => {
    expect(validateDayBlocks([])).toBeNull();
  });

  it("lehnt überlappende Arbeitszeiten ab", () => {
    const err = validateDayBlocks([
      { type: "WORK", start: "08:00", end: "12:30" },
      { type: "WORK", start: "12:00", end: "17:00" },
    ]);
    expect(err).toMatch(/Arbeitszeiten überlappen/);
  });

  it("lehnt eine Pause AUSSERHALB jeder Arbeitszeit ab", () => {
    const err = validateDayBlocks([
      { type: "WORK", start: "08:00", end: "12:00" },
      // Pause 12:00–12:30 liegt in der Lücke, NICHT innerhalb der Arbeit
      { type: "BREAK", start: "12:00", end: "12:30" },
    ]);
    expect(err).toMatch(/innerhalb einer Arbeitszeit/);
  });

  it("lehnt eine Pause ganz ohne Arbeitszeit ab", () => {
    const err = validateDayBlocks([{ type: "BREAK", start: "12:00", end: "12:30" }]);
    expect(err).toMatch(/ohne Arbeitszeit/);
  });

  it("lehnt sich überlappende Pausen ab", () => {
    const err = validateDayBlocks([
      { type: "WORK", start: "08:00", end: "17:00" },
      { type: "BREAK", start: "12:00", end: "12:45" },
      { type: "BREAK", start: "12:30", end: "13:00" },
    ]);
    expect(err).toMatch(/Pausen überlappen/);
  });

  it("lehnt Ende vor Beginn ab", () => {
    const err = validateDayBlocks([{ type: "WORK", start: "17:00", end: "08:00" }]);
    expect(err).toMatch(/Ende muss nach Beginn/);
  });

  it("lehnt ungültiges Zeitformat ab", () => {
    const err = validateDayBlocks([{ type: "WORK", start: "8:00", end: "17:00" }]);
    expect(err).toMatch(/Ungültige Beginn-Zeit/);
  });

  it("akzeptiert Home Office als Anwesenheit + Pause darin", () => {
    expect(
      validateDayBlocks([
        { type: "HOME_OFFICE", start: "08:00", end: "17:15" },
        { type: "BREAK", start: "12:00", end: "12:30" },
      ]),
    ).toBeNull();
  });

  it("akzeptiert gemischt Arbeit + Home Office ohne Überlappung", () => {
    expect(
      validateDayBlocks([
        { type: "WORK", start: "08:00", end: "12:00" },
        { type: "HOME_OFFICE", start: "13:00", end: "17:00" },
        { type: "BREAK", start: "13:30", end: "13:45" },
      ]),
    ).toBeNull();
  });

  it("lehnt Home Office ab, das sich mit Arbeit überlappt", () => {
    const err = validateDayBlocks([
      { type: "WORK", start: "08:00", end: "13:00" },
      { type: "HOME_OFFICE", start: "12:00", end: "17:00" },
    ]);
    expect(err).toMatch(/Arbeitszeiten überlappen/);
  });
});

describe("computeWorkedTime — Pause wird abgezogen, nie dazugezählt", () => {
  function d(hhmm: string): Date {
    return new Date(`2026-06-05T${hhmm}:00.000Z`);
  }

  it("Anwesenheit 08:00–17:15 mit Pause 12:00–12:30 → 8:45 Arbeit", () => {
    const res = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("08:00") },
        { type: "BREAK_START", occurredAt: d("12:00") },
        { type: "BREAK_END", occurredAt: d("12:30") },
        { type: "CLOCK_OUT", occurredAt: d("17:15") },
      ],
      breaks: [{ startedAt: d("12:00"), endedAt: d("12:30") }],
      now: d("18:00"),
    });
    // Anwesenheit 9:15 = 555 min, minus Pause 30 min = 525 min = 8:45
    expect(res.workedMinutes).toBe(525);
    expect(res.breakMinutes).toBe(30);
  });

  it("zwei Pausen werden beide abgezogen", () => {
    const res = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("08:00") },
        { type: "CLOCK_OUT", occurredAt: d("17:00") },
      ],
      breaks: [
        { startedAt: d("09:30"), endedAt: d("09:45") }, // 15
        { startedAt: d("12:00"), endedAt: d("12:30") }, // 30
      ],
      now: d("18:00"),
    });
    // 9:00 = 540 min − 45 min = 495 min
    expect(res.workedMinutes).toBe(495);
    expect(res.breakMinutes).toBe(45);
  });

  it("ohne Pause = volle Anwesenheit", () => {
    const res = computeWorkedTime({
      punches: [
        { type: "CLOCK_IN", occurredAt: d("08:00") },
        { type: "CLOCK_OUT", occurredAt: d("16:00") },
      ],
      breaks: [],
      now: d("18:00"),
    });
    expect(res.workedMinutes).toBe(480);
    expect(res.breakMinutes).toBe(0);
  });
});
