// Calendar-/Working-Time-Helper für den Auto-Scheduler.
//
// Konzept:
//   - Maschinen haben pro Wochentag 0..N Arbeits-Fenster (z. B. 07:30-12:00 +
//     13:00-17:00 mit Mittagspause).
//   - Feiertage (Holiday-Tabelle) und Maschinen-Wartung (MachineMaintenance)
//     blockieren Arbeitszeit.
//   - Alle Funktionen sind PURE — DB-Daten werden vom Caller injiziert.
//
// Zeitzone: Wir interpretieren Arbeits-Fenster in Europe/Zurich. Alle Date-
// Objekte sind UTC-Zeitpunkte; der Vergleich mit "07:30" erfolgt über
// `formatInTimeZone`/`fromZonedTime`.

import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { ZONE } from "@/lib/time/zone";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

/** Arbeits-Fenster eines Tages: { from: "07:30", to: "12:00" }. */
export interface WorkWindow {
  from: string;
  to: string;
}

/**
 * WorkingHours-JSON wie in `Machine.workingHours` gespeichert. Schlüssel sind
 * mon|tue|wed|thu|fri|sat|sun, jeweils Liste der Arbeits-Fenster.
 */
export interface WorkingHoursJson {
  mon: WorkWindow[];
  tue: WorkWindow[];
  wed: WorkWindow[];
  thu: WorkWindow[];
  fri: WorkWindow[];
  sat: WorkWindow[];
  sun: WorkWindow[];
}

const WEEKDAY_KEYS: (keyof WorkingHoursJson)[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
];

/** Out-of-Office-Intervall (z. B. Feiertag oder Wartung). */
export interface BlackoutInterval {
  start: Date;
  end: Date;
}

/**
 * Feiertage als Set lokaler Datum-Strings ("YYYY-MM-DD"). Wir vergleichen
 * tageweise — eine Halb-Tag-Logik (`fraction`) ist Phase-4.5.
 */
export type HolidaySet = Set<string>;

// ─────────────────────────────────────────
// Helpers — Datum/Zeit
// ─────────────────────────────────────────

/** "yyyy-MM-dd" in der Zone. */
function localDateStr(d: Date): string {
  return formatInTimeZone(d, ZONE, "yyyy-MM-dd");
}

/** Mon=0, Sun=6 (für Konsistenz mit dem `WEEKDAY_KEYS`-Array). */
function localWeekday(d: Date): keyof WorkingHoursJson {
  const tz = toZonedTime(d, ZONE);
  // Date.getDay(): Sun=0..Sat=6 → wir wollen Mon=0..Sun=6
  const idx = (tz.getDay() + 6) % 7;
  return WEEKDAY_KEYS[idx];
}

/** Lokales "HH:mm" eines Datums. */
function localHHmm(d: Date): string {
  return formatInTimeZone(d, ZONE, "HH:mm");
}

/** Datum + "HH:mm" → UTC-Instant in ZONE. */
function combineDayAndTime(dateStr: string, hhmm: string): Date {
  return fromZonedTime(`${dateStr}T${hhmm}:00`, ZONE);
}

function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────
// Working-Window-Logik
// ─────────────────────────────────────────

/**
 * Konvertiert die WorkingHours für einen konkreten Tag in absolute Zeitfenster.
 * Berücksichtigt Feiertage (Tag wird übersprungen) und Blackouts (z. B.
 * Wartung) — Letztere werden aus den Fenstern subtrahiert.
 */
export function workWindowsForDay(
  workingHours: WorkingHoursJson,
  holidays: HolidaySet,
  blackouts: BlackoutInterval[],
  dateStr: string,
): BlackoutInterval[] {
  if (holidays.has(dateStr)) return [];
  const tmpDate = new Date(`${dateStr}T12:00:00.000Z`); // Mittag — sicherer Anker
  const wd = localWeekday(tmpDate);
  const windows = workingHours[wd] ?? [];
  const intervals: BlackoutInterval[] = windows.map((w) => ({
    start: combineDayAndTime(dateStr, w.from),
    end: combineDayAndTime(dateStr, w.to),
  }));
  // Wartung etc. abziehen
  return subtractBlackouts(intervals, blackouts);
}

/**
 * Subtrahiert Blackouts aus einer Liste von Arbeits-Intervallen.
 * Liefert die verbleibenden offenen Stücke (gleiche Reihenfolge).
 */
function subtractBlackouts(
  windows: BlackoutInterval[],
  blackouts: BlackoutInterval[],
): BlackoutInterval[] {
  let result = windows;
  for (const b of blackouts) {
    const next: BlackoutInterval[] = [];
    for (const w of result) {
      // Kein Overlap?
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      // Vor dem Blackout
      if (b.start > w.start) {
        next.push({ start: w.start, end: b.start });
      }
      // Nach dem Blackout
      if (b.end < w.end) {
        next.push({ start: b.end, end: w.end });
      }
    }
    result = next;
  }
  return result;
}

/**
 * Iteriert tageweise (lokales Datum) zwischen `from` und `to` (inklusiv).
 * Nutzt UTC-Tagesschritte, dt. Tage werden über `localDateStr` gebildet —
 * Sommer/Winterzeit-sicher, weil wir das Datum (nicht die Uhrzeit) als
 * Anker nehmen.
 */
function* iterateLocalDays(from: Date, to: Date): Generator<string> {
  if (from > to) return;
  let cursor = new Date(`${localDateStr(from)}T12:00:00.000Z`);
  const end = new Date(`${localDateStr(to)}T12:00:00.000Z`);
  while (cursor <= end) {
    yield localDateStr(cursor);
    cursor = addDaysUtc(cursor, 1);
  }
}

// ─────────────────────────────────────────
// Public API — Forward
// ─────────────────────────────────────────

/**
 * Liefert das nächste freie Arbeitsmoment ≥ `after`. Wenn `after` mitten
 * in einem Arbeits-Fenster liegt, wird `after` selbst zurückgegeben.
 */
export function nextWorkingMoment(
  workingHours: WorkingHoursJson,
  holidays: HolidaySet,
  blackouts: BlackoutInterval[],
  after: Date,
): Date {
  // Schaue maximal 90 Tage in die Zukunft
  const limit = addDaysUtc(after, 90);
  for (const dateStr of iterateLocalDays(after, limit)) {
    const windows = workWindowsForDay(workingHours, holidays, blackouts, dateStr);
    for (const w of windows) {
      if (w.end <= after) continue;
      return w.start > after ? w.start : after;
    }
  }
  throw new Error(`Kein Arbeits-Fenster in den nächsten 90 Tagen ab ${after.toISOString()}`);
}

/**
 * Vorwärts: addiere `minutes` echte Arbeits-Minuten ab `start`. Zählt nur
 * Zeit innerhalb der Arbeits-Fenster, springt über Pausen/Nächte/Feiertage
 * weg.
 */
export function addWorkingMinutes(
  workingHours: WorkingHoursJson,
  holidays: HolidaySet,
  blackouts: BlackoutInterval[],
  start: Date,
  minutes: number,
): Date {
  if (minutes < 0) throw new Error("addWorkingMinutes: minutes negativ");
  if (minutes === 0) return start;

  let cursor = nextWorkingMoment(workingHours, holidays, blackouts, start);
  let remaining = minutes;
  const limit = addDaysUtc(cursor, 365); // Sicherheits-Limit

  for (const dateStr of iterateLocalDays(cursor, limit)) {
    const windows = workWindowsForDay(workingHours, holidays, blackouts, dateStr);
    for (const w of windows) {
      if (w.end <= cursor) continue;
      const segmentStart = w.start > cursor ? w.start : cursor;
      const availableMs = w.end.getTime() - segmentStart.getTime();
      const availableMin = availableMs / 60_000;
      if (availableMin >= remaining) {
        return new Date(segmentStart.getTime() + remaining * 60_000);
      }
      remaining -= availableMin;
      cursor = w.end;
    }
  }
  throw new Error(`addWorkingMinutes: läuft über 1 Jahr hinaus ab ${start.toISOString()}`);
}

// ─────────────────────────────────────────
// Public API — Backward
// ─────────────────────────────────────────

/** Vorheriger Arbeitsmoment ≤ `before`. */
export function previousWorkingMoment(
  workingHours: WorkingHoursJson,
  holidays: HolidaySet,
  blackouts: BlackoutInterval[],
  before: Date,
): Date {
  const limit = addDaysUtc(before, -90);
  // Tageweise rückwärts
  let cursor = new Date(`${localDateStr(before)}T12:00:00.000Z`);
  const end = new Date(`${localDateStr(limit)}T12:00:00.000Z`);
  while (cursor >= end) {
    const dateStr = localDateStr(cursor);
    const windows = workWindowsForDay(workingHours, holidays, blackouts, dateStr);
    for (const w of [...windows].reverse()) {
      if (w.start >= before) continue;
      return w.end < before ? w.end : before;
    }
    cursor = addDaysUtc(cursor, -1);
  }
  throw new Error(`Kein Arbeits-Fenster in den letzten 90 Tagen vor ${before.toISOString()}`);
}

/**
 * Rückwärts: subtrahiere `minutes` echte Arbeits-Minuten von `end`.
 * Liefert den Start-Zeitpunkt, der bei Vorwärts-Lauf wieder genau `end`
 * ergibt.
 */
export function subtractWorkingMinutes(
  workingHours: WorkingHoursJson,
  holidays: HolidaySet,
  blackouts: BlackoutInterval[],
  end: Date,
  minutes: number,
): Date {
  if (minutes < 0) throw new Error("subtractWorkingMinutes: minutes negativ");
  if (minutes === 0) return end;

  let cursor = previousWorkingMoment(workingHours, holidays, blackouts, end);
  let remaining = minutes;
  const limit = addDaysUtc(cursor, -365);

  let dateCursor = new Date(`${localDateStr(cursor)}T12:00:00.000Z`);
  const dateEnd = new Date(`${localDateStr(limit)}T12:00:00.000Z`);

  while (dateCursor >= dateEnd) {
    const dateStr = localDateStr(dateCursor);
    const windows = workWindowsForDay(workingHours, holidays, blackouts, dateStr);
    for (const w of [...windows].reverse()) {
      if (w.start >= cursor) continue;
      const segmentEnd = w.end < cursor ? w.end : cursor;
      const availableMs = segmentEnd.getTime() - w.start.getTime();
      const availableMin = availableMs / 60_000;
      if (availableMin >= remaining) {
        return new Date(segmentEnd.getTime() - remaining * 60_000);
      }
      remaining -= availableMin;
      cursor = w.start;
    }
    dateCursor = addDaysUtc(dateCursor, -1);
  }
  throw new Error(
    `subtractWorkingMinutes: läuft über 1 Jahr hinaus ab ${end.toISOString()}`,
  );
}

// ─────────────────────────────────────────
// Convenience
// ─────────────────────────────────────────

/** Sicheres Parsen einer Maschinen-WorkingHours JSON-Spalte. */
export function parseWorkingHours(raw: unknown): WorkingHoursJson {
  if (!raw || typeof raw !== "object") return EMPTY_WORKING_HOURS;
  const obj = raw as Record<string, unknown>;
  const out: WorkingHoursJson = { ...EMPTY_WORKING_HOURS };
  for (const k of WEEKDAY_KEYS) {
    const arr = obj[k];
    if (Array.isArray(arr)) {
      out[k] = arr
        .filter((w): w is { from: string; to: string } => {
          return (
            !!w &&
            typeof w === "object" &&
            "from" in w &&
            "to" in w &&
            typeof (w as { from: unknown }).from === "string" &&
            typeof (w as { to: unknown }).to === "string"
          );
        })
        .map((w) => ({ from: w.from, to: w.to }));
    }
  }
  return out;
}

const EMPTY_WORKING_HOURS: WorkingHoursJson = {
  mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
};

/** Standard-Tschannen-Arbeitszeiten Mo-Fr 07:30-12:00 + 13:00-17:00. */
export const DEFAULT_WORKING_HOURS: WorkingHoursJson = {
  mon: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  tue: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  wed: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  thu: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  fri: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  sat: [],
  sun: [],
};

export const _internal = {
  localDateStr,
  localHHmm,
  combineDayAndTime,
  iterateLocalDays,
  subtractBlackouts,
};
