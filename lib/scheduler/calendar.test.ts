// Tests für die Calendar-/Working-Time-Logik.
//
// Standardprofil Tschannen: Mo-Fr 07:30-12:00 + 13:00-17:00, Mittagspause
// 12:00-13:00, Sa+So frei. Alle Tests in Europe/Zurich.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKING_HOURS,
  addWorkingMinutes,
  nextWorkingMoment,
  previousWorkingMoment,
  subtractWorkingMinutes,
  workWindowsForDay,
  parseWorkingHours,
} from "./calendar";
import { fromZonedTime } from "date-fns-tz";

const ZONE = "Europe/Zurich";
const ch = (iso: string) => fromZonedTime(iso, ZONE);
const NO_HOLIDAYS = new Set<string>();
const NO_BLACKOUTS: { start: Date; end: Date }[] = [];

describe("workWindowsForDay", () => {
  it("liefert beide Fenster an einem normalen Mo-Fr-Tag", () => {
    const w = workWindowsForDay(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, "2026-05-04");
    expect(w).toHaveLength(2);
    expect(w[0].start).toEqual(ch("2026-05-04T07:30:00"));
    expect(w[0].end).toEqual(ch("2026-05-04T12:00:00"));
    expect(w[1].start).toEqual(ch("2026-05-04T13:00:00"));
    expect(w[1].end).toEqual(ch("2026-05-04T17:00:00"));
  });

  it("Samstag/Sonntag haben keine Fenster", () => {
    expect(workWindowsForDay(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, "2026-05-09")).toEqual([]);
    expect(workWindowsForDay(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, "2026-05-10")).toEqual([]);
  });

  it("Feiertag blockiert den ganzen Tag", () => {
    const holidays = new Set(["2026-05-04"]);
    expect(workWindowsForDay(DEFAULT_WORKING_HOURS, holidays, NO_BLACKOUTS, "2026-05-04")).toEqual([]);
  });

  it("Wartung blockiert genau das angegebene Intervall", () => {
    const blackouts = [
      { start: ch("2026-05-04T09:00:00"), end: ch("2026-05-04T10:30:00") },
    ];
    const w = workWindowsForDay(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, blackouts, "2026-05-04");
    expect(w).toHaveLength(3);
    expect(w[0]).toEqual({ start: ch("2026-05-04T07:30:00"), end: ch("2026-05-04T09:00:00") });
    expect(w[1]).toEqual({ start: ch("2026-05-04T10:30:00"), end: ch("2026-05-04T12:00:00") });
    expect(w[2]).toEqual({ start: ch("2026-05-04T13:00:00"), end: ch("2026-05-04T17:00:00") });
  });
});

describe("nextWorkingMoment", () => {
  it("morgens vor Schichtstart → 07:30", () => {
    const r = nextWorkingMoment(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      ch("2026-05-04T06:00:00"),
    );
    expect(r).toEqual(ch("2026-05-04T07:30:00"));
  });

  it("mitten in Mittagspause → 13:00", () => {
    const r = nextWorkingMoment(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      ch("2026-05-04T12:30:00"),
    );
    expect(r).toEqual(ch("2026-05-04T13:00:00"));
  });

  it("nach Feierabend → nächster Morgen 07:30", () => {
    const r = nextWorkingMoment(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      ch("2026-05-04T18:00:00"),
    );
    expect(r).toEqual(ch("2026-05-05T07:30:00"));
  });

  it("Freitag-Abend → Montag-Morgen", () => {
    const r = nextWorkingMoment(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      ch("2026-05-08T18:00:00"),
    );
    expect(r).toEqual(ch("2026-05-11T07:30:00"));
  });

  it("springt über Feiertag", () => {
    const holidays = new Set(["2026-05-04"]);
    const r = nextWorkingMoment(
      DEFAULT_WORKING_HOURS,
      holidays,
      NO_BLACKOUTS,
      ch("2026-05-04T08:00:00"),
    );
    expect(r).toEqual(ch("2026-05-05T07:30:00"));
  });

  it("mitten im Arbeitsfenster → unverändert", () => {
    const t = ch("2026-05-04T10:00:00");
    expect(nextWorkingMoment(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, t)).toEqual(t);
  });
});

describe("addWorkingMinutes", () => {
  it("60 Min ab 07:30 → 08:30", () => {
    expect(
      addWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T07:30:00"),
        60,
      ),
    ).toEqual(ch("2026-05-04T08:30:00"));
  });

  it("springt über Mittagspause", () => {
    // 11:30 + 60 Min Arbeit = 11:30→12:00 (30) + 13:00→13:30 (30) = 13:30
    expect(
      addWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T11:30:00"),
        60,
      ),
    ).toEqual(ch("2026-05-04T13:30:00"));
  });

  it("springt über Wochenende", () => {
    // Fr 16:30 + 60 Min = Fr 16:30→17:00 (30) + Mo 07:30→08:00 (30) = Mo 08:00
    expect(
      addWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-08T16:30:00"),
        60,
      ),
    ).toEqual(ch("2026-05-11T08:00:00"));
  });

  it("8.5 h (volle Schicht) ab Schichtstart → genau Schichtende", () => {
    // 8.5 h = 510 Min — passt in eine Schicht (4.5 + 4)
    expect(
      addWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T07:30:00"),
        510,
      ),
    ).toEqual(ch("2026-05-04T17:00:00"));
  });

  it("0 Minuten → Start unverändert", () => {
    const t = ch("2026-05-04T08:00:00");
    expect(addWorkingMinutes(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, t, 0)).toEqual(t);
  });
});

describe("previousWorkingMoment", () => {
  it("morgens vor Schichtstart → vorheriger Schichtschluss", () => {
    // Mo 06:00 → Fr letzter Woche 17:00
    expect(
      previousWorkingMoment(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T06:00:00"),
      ),
    ).toEqual(ch("2026-05-01T17:00:00"));
  });

  it("mitten in Mittagspause → 12:00", () => {
    expect(
      previousWorkingMoment(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T12:30:00"),
      ),
    ).toEqual(ch("2026-05-04T12:00:00"));
  });

  it("mitten im Arbeitsfenster → unverändert", () => {
    const t = ch("2026-05-04T10:00:00");
    expect(
      previousWorkingMoment(DEFAULT_WORKING_HOURS, NO_HOLIDAYS, NO_BLACKOUTS, t),
    ).toEqual(t);
  });
});

describe("subtractWorkingMinutes", () => {
  it("60 Min vor 17:00 → 16:00", () => {
    expect(
      subtractWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T17:00:00"),
        60,
      ),
    ).toEqual(ch("2026-05-04T16:00:00"));
  });

  it("springt rückwärts über Mittagspause", () => {
    // 13:30 - 60 Min Arbeit = 13:00 (30) + 12:00→11:30 (30) = 11:30
    expect(
      subtractWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-04T13:30:00"),
        60,
      ),
    ).toEqual(ch("2026-05-04T11:30:00"));
  });

  it("springt rückwärts über Wochenende", () => {
    // Mo 08:00 - 60 Min = Mo 07:30 (30 Min) + Fr 16:30→17:00 (30 Min) = Fr 16:30
    expect(
      subtractWorkingMinutes(
        DEFAULT_WORKING_HOURS,
        NO_HOLIDAYS,
        NO_BLACKOUTS,
        ch("2026-05-11T08:00:00"),
        60,
      ),
    ).toEqual(ch("2026-05-08T16:30:00"));
  });

  it("Round-trip: add+subtract derselben Minutenzahl", () => {
    const start = ch("2026-05-04T08:00:00");
    const minutes = 240;
    const end = addWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      start,
      minutes,
    );
    const back = subtractWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      NO_HOLIDAYS,
      NO_BLACKOUTS,
      end,
      minutes,
    );
    expect(back).toEqual(start);
  });
});

describe("parseWorkingHours", () => {
  it("akzeptiert das Standardformat aus dem Seed", () => {
    const r = parseWorkingHours(DEFAULT_WORKING_HOURS);
    expect(r.mon).toEqual([
      { from: "07:30", to: "12:00" },
      { from: "13:00", to: "17:00" },
    ]);
    expect(r.sat).toEqual([]);
  });

  it("ungültige Eingabe → leere Wochenstruktur", () => {
    const r = parseWorkingHours(null);
    expect(r.mon).toEqual([]);
    expect(r.sun).toEqual([]);
  });

  it("ignoriert kaputte Einträge", () => {
    const r = parseWorkingHours({ mon: [{ from: "08:00", to: "16:00" }, { foo: "bar" }] });
    expect(r.mon).toEqual([{ from: "08:00", to: "16:00" }]);
  });
});
