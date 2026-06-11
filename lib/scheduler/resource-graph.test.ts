// Tests für die Maschinen-Belegung + Slot-Suche.

import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  buildResourceGraph,
  findFreeSlotBackward,
  findFreeSlotForward,
  reserveSlot,
  type MachineState,
  type MachineRow,
} from "./resource-graph";
import { DEFAULT_WORKING_HOURS } from "./calendar";

const ZONE = "Europe/Zurich";
const ch = (iso: string) => fromZonedTime(iso, ZONE);
const NO_HOLIDAYS = new Set<string>();

function emptyMachine(name = "M1", type = "BLAST_CABIN"): MachineState {
  const row: MachineRow = {
    id: name,
    name,
    type,
    workingHours: DEFAULT_WORKING_HOURS,
    blackouts: [],
    bookings: [],
  };
  return buildResourceGraph([row]).get(name)!;
}

describe("findFreeSlotForward", () => {
  it("leere Maschine: liefert ab notBefore das erste Fenster", () => {
    const m = emptyMachine();
    const slot = findFreeSlotForward(m, NO_HOLIDAYS, 60, ch("2026-05-04T07:30:00"));
    expect(slot).not.toBeNull();
    expect(slot!.start).toEqual(ch("2026-05-04T07:30:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T08:30:00"));
  });

  it("springt um existierende Buchung herum", () => {
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T10:00:00"),
    });
    const slot = findFreeSlotForward(m, NO_HOLIDAYS, 60, ch("2026-05-04T07:30:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T10:00:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T11:00:00"));
  });

  it("fragt vor Schichtstart → 07:30", () => {
    const m = emptyMachine();
    const slot = findFreeSlotForward(m, NO_HOLIDAYS, 30, ch("2026-05-04T05:00:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T07:30:00"));
  });

  it("muss in EINEM Fenster Platz finden — keine Splits", () => {
    // Slot-Suche muss in EINEM zusammenhängenden Working-Window passen.
    // Belegt: 07:30-11:30 → es bleiben am Vormittag noch 30 Min (11:30-12:00).
    // Eine 60-Min-Suche kann nicht im Vormittagsfenster bleiben → springt
    // in den Nachmittag (13:00-14:00).
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T11:30:00"),
    });
    const slot = findFreeSlotForward(m, NO_HOLIDAYS, 60, ch("2026-05-04T07:30:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T13:00:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T14:00:00"));
  });

  it("springt über voll belegten Tag in den nächsten", () => {
    const m = emptyMachine();
    // Mo komplett belegt
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T17:00:00"),
    });
    const slot = findFreeSlotForward(m, NO_HOLIDAYS, 60, ch("2026-05-04T07:30:00"));
    expect(slot!.start).toEqual(ch("2026-05-05T07:30:00"));
  });

  it("Feiertag wird übersprungen", () => {
    const m = emptyMachine();
    const holidays = new Set(["2026-05-04"]);
    const slot = findFreeSlotForward(m, holidays, 60, ch("2026-05-04T07:30:00"));
    expect(slot!.start).toEqual(ch("2026-05-05T07:30:00"));
  });
});

describe("findFreeSlotBackward", () => {
  it("leere Maschine: liefert das letzte mögliche Fenster vor notAfter", () => {
    const m = emptyMachine();
    const slot = findFreeSlotBackward(m, NO_HOLIDAYS, 60, ch("2026-05-04T17:00:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T16:00:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T17:00:00"));
  });

  it("notAfter mitten in Mittagspause → spätestes Fenster ist Vormittag", () => {
    const m = emptyMachine();
    const slot = findFreeSlotBackward(m, NO_HOLIDAYS, 30, ch("2026-05-04T12:30:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T11:30:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T12:00:00"));
  });

  it("springt rückwärts über existierende Buchung", () => {
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T15:00:00"),
      end: ch("2026-05-04T17:00:00"),
    });
    const slot = findFreeSlotBackward(m, NO_HOLIDAYS, 60, ch("2026-05-04T17:00:00"));
    expect(slot!.start).toEqual(ch("2026-05-04T14:00:00"));
    expect(slot!.end).toEqual(ch("2026-05-04T15:00:00"));
  });

  it("liefert null wenn unmöglich in den letzten 90 Tagen", () => {
    const m = emptyMachine();
    // Verlange 200h — kann nicht in einem Fenster passen
    const slot = findFreeSlotBackward(m, NO_HOLIDAYS, 200 * 60, ch("2026-05-04T17:00:00"));
    expect(slot).toBeNull();
  });

  it("springt rückwärts über voll belegten Tag", () => {
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T17:00:00"),
    });
    // notAfter = Mo 17:00 → muss zurück auf Fr letzter Woche
    const slot = findFreeSlotBackward(m, NO_HOLIDAYS, 60, ch("2026-05-04T17:00:00"));
    expect(slot!.end).toEqual(ch("2026-05-01T17:00:00"));
  });
});

describe("reserveSlot + Bookings-Merging", () => {
  it("überlappende Buchungen werden gemerged", () => {
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T10:00:00"),
    });
    reserveSlot(m, {
      start: ch("2026-05-04T09:00:00"),
      end: ch("2026-05-04T11:00:00"),
    });
    expect(m.bookings).toHaveLength(1);
    expect(m.bookings[0].start).toEqual(ch("2026-05-04T07:30:00"));
    expect(m.bookings[0].end).toEqual(ch("2026-05-04T11:00:00"));
  });

  it("locked + unlocked → Lock-Flag bleibt true wenn überlappend", () => {
    const m = emptyMachine();
    reserveSlot(m, {
      start: ch("2026-05-04T07:30:00"),
      end: ch("2026-05-04T10:00:00"),
      isLocked: true,
    });
    reserveSlot(m, {
      start: ch("2026-05-04T09:00:00"),
      end: ch("2026-05-04T11:00:00"),
      isLocked: false,
    });
    expect(m.bookings).toHaveLength(1);
    expect(m.bookings[0].isLocked).toBe(true);
  });
});
