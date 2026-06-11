// Pro Maschine: Liste der bereits belegten Intervalle + Funktionen zum
// Finden freier Slots (vorwärts/rückwärts).
//
// Konzept:
//   - Jede Maschine hat eigene WorkingHours + Wartungs-Blackouts.
//   - Existierende OrderScheduleEntry-Buchungen werden ebenfalls als
//     "Belegt"-Intervalle behandelt.
//   - Beim Suchen eines freien Slots respektieren wir alle drei: Working
//     Hours, Blackouts, vorhandene Buchungen.
//
// Die Klasse arbeitet rein in-memory; der Caller lädt vor Beginn alle
// relevanten Buchungen aus der DB.

import {
  addWorkingMinutes,
  nextWorkingMoment,
  previousWorkingMoment,
  subtractWorkingMinutes,
  workWindowsForDay,
  type BlackoutInterval,
  type HolidaySet,
  type WorkingHoursJson,
} from "./calendar";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ZONE } from "@/lib/time/zone";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface MachineState {
  id: string;
  name: string;
  type: string;
  workingHours: WorkingHoursJson;
  /** Maintenance + andere Out-of-Service-Fenster. */
  blackouts: BlackoutInterval[];
  /** Bereits gebuchte Slots (sortiert nach Start). */
  bookings: Booking[];
}

export interface Booking {
  /** ID des OrderScheduleEntry (oder leer beim Trockendurchlauf). */
  entryId?: string;
  start: Date;
  end: Date;
  /** Manuell fixiert (Auto-Scheduler darf NICHT verschieben). */
  isLocked: boolean;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function localDateStr(d: Date): string {
  return formatInTimeZone(d, ZONE, "yyyy-MM-dd");
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Sortiert + überschneidungsfreies Mergen einer Booking-Liste. */
function mergeIntervals(bookings: Booking[]): Booking[] {
  if (bookings.length === 0) return [];
  const sorted = [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Booking[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = new Date(Math.max(last.end.getTime(), cur.end.getTime()));
      // Lock-Flag bleibt true, sobald irgend ein Beitrag locked ist
      if (cur.isLocked) last.isLocked = true;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Tageweise verfügbare Arbeits-Fenster — respektiert:
 *   - Working Hours
 *   - Holidays (überspringt den Tag)
 *   - Blackouts (Wartung)
 *   - Bookings (existierende Buchungen)
 */
function availableSlotsForDay(
  m: MachineState,
  holidays: HolidaySet,
  dateStr: string,
): BlackoutInterval[] {
  const baseWindows = workWindowsForDay(m.workingHours, holidays, m.blackouts, dateStr);
  // Bookings dieses Tages aus den Fenstern abziehen
  return subtractBookings(baseWindows, m.bookings);
}

function subtractBookings(
  windows: BlackoutInterval[],
  bookings: Booking[],
): BlackoutInterval[] {
  let result = windows;
  for (const b of bookings) {
    const next: BlackoutInterval[] = [];
    for (const w of result) {
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    result = next;
  }
  return result;
}

// ─────────────────────────────────────────
// Forward: nächsten freien Slot finden
// ─────────────────────────────────────────

/**
 * Findet den frühesten freien Slot mit `durationMinutes` Arbeit ab `notBefore`.
 * Liefert {start, end} oder null wenn kein Slot in den nächsten 90 Tagen.
 */
export function findFreeSlotForward(
  m: MachineState,
  holidays: HolidaySet,
  durationMinutes: number,
  notBefore: Date,
): { start: Date; end: Date } | null {
  m.bookings = mergeIntervals(m.bookings);
  const limit = addDays(notBefore, 90);
  let cursor = notBefore;

  for (let i = 0; i < 90; i++) {
    const dateStr = localDateStr(cursor);
    const slots = availableSlotsForDay(m, holidays, dateStr);
    for (const slot of slots) {
      if (slot.end <= cursor) continue;
      const segStart = slot.start > cursor ? slot.start : cursor;
      const availableMs = slot.end.getTime() - segStart.getTime();
      if (availableMs >= durationMinutes * 60_000) {
        // Es passt in dieses Fenster — möglicherweise sogar mit einer
        // einzigen geraden Linie. Da wir Stücke nicht splitten, brauchen
        // wir genug zusammenhängende Zeit.
        return {
          start: segStart,
          end: new Date(segStart.getTime() + durationMinutes * 60_000),
        };
      }
    }
    // Wir könnten "weiterlaufen" über mehrere Tage — d. h. der Slot beginnt
    // heute und endet morgen. Aber das würde Stücke splitten. Für v1 sagen
    // wir: ein ProcessStep braucht ein zusammenhängendes Fenster ohne
    // Pause/Tagwechsel. Wenn das Fenster zu klein ist → nächster Tag.
    cursor = addDays(cursor, 1);
    // Lokaler Tagesanfang in Zurich (sommerzeit-sicher) statt naivem UTC.
    cursor = fromZonedTime(`${localDateStr(cursor)}T00:00:00.000`, ZONE);
    if (cursor > limit) break;
  }
  return null;
}

// ─────────────────────────────────────────
// Backward: spätestmöglichen freien Slot finden
// ─────────────────────────────────────────

/**
 * Findet den spätestmöglichen freien Slot der bis spätestens `notAfter`
 * endet und `durationMinutes` Arbeitszeit benötigt. Liefert {start, end}
 * oder null wenn nicht möglich in den letzten 90 Tagen.
 */
export function findFreeSlotBackward(
  m: MachineState,
  holidays: HolidaySet,
  durationMinutes: number,
  notAfter: Date,
): { start: Date; end: Date } | null {
  m.bookings = mergeIntervals(m.bookings);
  const limit = addDays(notAfter, -90);
  let cursor = notAfter;

  for (let i = 0; i < 90; i++) {
    const dateStr = localDateStr(cursor);
    const slots = availableSlotsForDay(m, holidays, dateStr);
    // Rückwärts iterieren: spätestes Fenster zuerst
    for (let j = slots.length - 1; j >= 0; j--) {
      const slot = slots[j];
      if (slot.start >= cursor) continue;
      const segEnd = slot.end < cursor ? slot.end : cursor;
      const availableMs = segEnd.getTime() - slot.start.getTime();
      if (availableMs >= durationMinutes * 60_000) {
        return {
          start: new Date(segEnd.getTime() - durationMinutes * 60_000),
          end: segEnd,
        };
      }
    }
    cursor = addDays(cursor, -1);
    // Lokales Tagesende in Zurich (sommerzeit-sicher) — naive UTC fällt
    // in Sommerzeit auf den NÄCHSTEN Zurich-Tag.
    cursor = fromZonedTime(`${localDateStr(cursor)}T23:59:59.999`, ZONE);
    if (cursor < limit) break;
  }
  return null;
}

// ─────────────────────────────────────────
// Booking-Mutation
// ─────────────────────────────────────────

/** Neuen Slot in die Belegung der Maschine einfügen. */
export function reserveSlot(
  m: MachineState,
  slot: { start: Date; end: Date; entryId?: string; isLocked?: boolean },
): void {
  m.bookings.push({
    entryId: slot.entryId,
    start: slot.start,
    end: slot.end,
    isLocked: slot.isLocked ?? false,
  });
  m.bookings = mergeIntervals(m.bookings);
}

/**
 * Erzeugt eine MachineState-Map aus Prisma-Daten — typischer Caller-Pfad.
 * Belegungen aus existierenden OrderScheduleEntry werden eingelesen.
 */
export interface MachineRow {
  id: string;
  name: string;
  type: string;
  workingHours: WorkingHoursJson;
  blackouts: BlackoutInterval[];
  bookings: Booking[];
}

export function buildResourceGraph(machines: MachineRow[]): Map<string, MachineState> {
  const map = new Map<string, MachineState>();
  for (const m of machines) {
    map.set(m.id, {
      id: m.id,
      name: m.name,
      type: m.type,
      workingHours: m.workingHours,
      blackouts: m.blackouts,
      bookings: mergeIntervals(m.bookings),
    });
  }
  return map;
}

// ─────────────────────────────────────────
// Re-Exports — Convenience für den Scheduler
// ─────────────────────────────────────────
export {
  addWorkingMinutes,
  subtractWorkingMinutes,
  nextWorkingMoment,
  previousWorkingMoment,
};
