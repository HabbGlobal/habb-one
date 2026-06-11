import { describe, expect, it } from "vitest";
import {
  localDateString,
  localMidnightUtc,
  combineDateAndTime,
  formatTimeLocal,
} from "./zone";

describe("localMidnightUtc", () => {
  it("returns UTC midnight of the given local date string", () => {
    // Critical for Postgres @db.Date columns: the stored DATE must equal the
    // string we passed in, regardless of session timezone. UTC midnight does
    // that — CH midnight (UTC-2 in summer) would truncate to the prior day.
    expect(localMidnightUtc("2026-05-01").toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(localMidnightUtc("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(localMidnightUtc("2026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("localDateString", () => {
  it("formats UTC instants as the corresponding CH local date", () => {
    // 2026-05-01T00:00:00Z is 02:00 CH summer → still 2026-05-01.
    expect(localDateString(new Date("2026-05-01T00:00:00Z"))).toBe("2026-05-01");
    // 2026-04-30T22:30:00Z is 00:30 CH on May 1 → 2026-05-01.
    expect(localDateString(new Date("2026-04-30T22:30:00Z"))).toBe("2026-05-01");
    // 2026-04-30T21:30:00Z is 23:30 CH on Apr 30 → 2026-04-30.
    expect(localDateString(new Date("2026-04-30T21:30:00Z"))).toBe("2026-04-30");
  });
});

describe("combineDateAndTime", () => {
  it("interprets HH:mm in CH timezone (summer, UTC+2)", () => {
    expect(combineDateAndTime("2026-05-01", "07:30").toISOString()).toBe(
      "2026-05-01T05:30:00.000Z"
    );
  });
  it("interprets HH:mm in CH timezone (winter, UTC+1)", () => {
    expect(combineDateAndTime("2026-01-15", "07:30").toISOString()).toBe(
      "2026-01-15T06:30:00.000Z"
    );
  });
});

describe("Mandanten-Zeitzone (zone-Parameter)", () => {
  it("Default ohne zone-Parameter ist Europe/Zurich", () => {
    expect(localDateString(new Date("2026-06-05T17:00:00Z"))).toBe(
      localDateString(new Date("2026-06-05T17:00:00Z"), "Europe/Zurich"),
    );
  });

  it("Asia/Colombo (UTC+5:30): 08:00 lokal → 02:30 UTC", () => {
    // Colombo hat keine Sommerzeit, immer UTC+5:30.
    expect(
      combineDateAndTime("2026-06-05", "08:00", "Asia/Colombo").toISOString(),
    ).toBe("2026-06-05T02:30:00.000Z");
  });

  it("Asia/Colombo bucketet einen späten UTC-Abend korrekt auf den Folgetag", () => {
    // 2026-06-05T19:30:00Z = 01:00 Colombo am 6. Juni → Tag 2026-06-06.
    expect(localDateString(new Date("2026-06-05T19:30:00Z"), "Asia/Colombo")).toBe(
      "2026-06-06",
    );
    // Gleicher Instant in Zürich (21:30) → noch 2026-06-05.
    expect(localDateString(new Date("2026-06-05T19:30:00Z"), "Europe/Zurich")).toBe(
      "2026-06-05",
    );
  });

  it("formatTimeLocal respektiert die Zeitzone", () => {
    const instant = new Date("2026-06-05T02:30:00Z");
    expect(formatTimeLocal(instant, "Asia/Colombo")).toBe("08:00");
    expect(formatTimeLocal(instant, "Europe/Zurich")).toBe("04:30");
  });
});
