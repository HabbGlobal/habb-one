// Tests für den Hybrid-Scheduler.
//
// Setup: 1 Sandstrahlkabine + 1 Pulverkabine + 1 Ofen + 1 Lackierkabine,
// alle mit Standard-Arbeitszeit Mo-Fr 07:30-12:00 + 13:00-17:00.

import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { runScheduler, type SchedulableOrder } from "./scheduler";
import { DEFAULT_WORKING_HOURS } from "./calendar";
import type { MachineRow } from "./resource-graph";

const ZONE = "Europe/Zurich";
const ch = (iso: string) => fromZonedTime(iso, ZONE);

// ─────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────

function makeMachine(id: string, type: string): MachineRow {
  return {
    id,
    name: id,
    type,
    workingHours: DEFAULT_WORKING_HOURS,
    blackouts: [],
    bookings: [],
  };
}

const STD_MACHINES: MachineRow[] = [
  makeMachine("blast1", "BLAST_CABIN"),
  makeMachine("powder1", "POWDER_CABIN"),
  makeMachine("oven1", "CURING_OVEN"),
  makeMachine("paint1", "PAINT_CABIN"),
];

function simpleOrder(args: {
  id: string;
  priority?: SchedulableOrder["priority"];
  promisedAt: Date;
  internalDeadline?: Date | null;
  /** Vereinfachte Step-Definitionen — globalSequence wird automatisch vergeben. */
  steps: Array<{
    id: string;
    machineType: string | null;
    minutes: number;
    waitAfter?: number;
  }>;
}): SchedulableOrder {
  return {
    id: args.id,
    orderNumber: args.id,
    priority: args.priority ?? "NORMAL",
    promisedAt: args.promisedAt,
    internalDeadline: args.internalDeadline ?? null,
    steps: args.steps.map((s, i) => ({
      id: s.id,
      orderItemId: `${args.id}-item`,
      globalSequence: (i + 1) * 10,
      estimatedMinutes: s.minutes,
      waitMinutesAfter: s.waitAfter ?? 0,
      machineTypeRequired: s.machineType,
      skillRequired: "BLASTER",
    })),
  };
}

// ─────────────────────────────────────────
// Tests
// ─────────────────────────────────────────

describe("runScheduler — single-step single-order", () => {
  it("plant einen einzelnen Schritt rückwärts vom Liefertermin", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"), // Freitag 17:00
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.proposed).toHaveLength(1);
    // Buffer = 1 Tag → Deadline für den letzten Schritt: Do 17:00
    // Slot ist 60 Min vorher: Do 16:00-17:00
    expect(result.proposed[0].plannedStart).toEqual(ch("2026-05-07T16:00:00"));
    expect(result.proposed[0].plannedEnd).toEqual(ch("2026-05-07T17:00:00"));
    expect(result.proposed[0].machineId).toBe("blast1");
  });

  it("EXPRESS plant ASAP vorwärts ab now", () => {
    const order = simpleOrder({
      id: "o1",
      priority: "EXPRESS",
      promisedAt: ch("2026-05-15T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T08:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.proposed[0].plannedStart).toEqual(ch("2026-05-04T08:00:00"));
    expect(result.proposed[0].plannedEnd).toEqual(ch("2026-05-04T09:00:00"));
  });
});

describe("runScheduler — multi-step Pipeline", () => {
  it("Standard-Pulverbeschichtung: Sandstrahlen → Pulvern → Aushärten (rückwärts)", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [
        { id: "s1", machineType: "BLAST_CABIN", minutes: 120 },
        { id: "s2", machineType: "POWDER_CABIN", minutes: 60, waitAfter: 0 },
        { id: "s3", machineType: "CURING_OVEN", minutes: 60 },
      ],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts).toEqual([]);
    // Letzter Schritt s3 endet auf der Buffer-Deadline = Do 17:00
    const s3 = result.proposed.find((p) => p.stepId === "s3")!;
    expect(s3.plannedEnd).toEqual(ch("2026-05-07T17:00:00"));
    expect(s3.plannedStart).toEqual(ch("2026-05-07T16:00:00"));
    // s2 endet vor s3 (kein wait), also Do 16:00
    const s2 = result.proposed.find((p) => p.stepId === "s2")!;
    expect(s2.plannedEnd).toEqual(ch("2026-05-07T16:00:00"));
    expect(s2.plannedStart).toEqual(ch("2026-05-07T15:00:00"));
    // s1 endet vor s2 = Do 15:00
    const s1 = result.proposed.find((p) => p.stepId === "s1")!;
    expect(s1.plannedEnd).toEqual(ch("2026-05-07T15:00:00"));
  });

  it("waitMinutesAfter blockiert nächsten Schritt", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [
        { id: "s1", machineType: "POWDER_CABIN", minutes: 30, waitAfter: 60 },
        { id: "s2", machineType: "CURING_OVEN", minutes: 30 },
      ],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts).toEqual([]);
    const s2 = result.proposed.find((p) => p.stepId === "s2")!;
    const s1 = result.proposed.find((p) => p.stepId === "s1")!;
    // Wait 60 min zwischen s1 und s2 → s1.end + 60 ≤ s2.start
    const gap = (s2.plannedStart.getTime() - s1.plannedEnd.getTime()) / 60_000;
    expect(gap).toBeGreaterThanOrEqual(60);
  });
});

describe("runScheduler — Konflikte", () => {
  it("Deadline nicht erreichbar → DEADLINE_MISS Konflikt", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-04T08:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    const deadlineConflicts = result.conflicts.filter((c) => c.type === "DEADLINE_MISS");
    expect(deadlineConflicts.length).toBeGreaterThan(0);
  });

  it("Maschinentyp existiert nicht → MACHINE_OVERSIZE Konflikt", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s1", machineType: "DRYING_OVEN", minutes: 60 }],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    const c = result.conflicts.find((c) => c.type === "MACHINE_OVERSIZE");
    expect(c).toBeDefined();
    expect(c!.message).toContain("DRYING_OVEN");
  });
});

describe("runScheduler — manuelle Schritte", () => {
  it("Schritt ohne machineTypeRequired bekommt Slot ohne Maschine", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [
        { id: "s1", machineType: null, minutes: 60 }, // MASKING
        { id: "s2", machineType: "BLAST_CABIN", minutes: 60 },
      ],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts).toEqual([]);
    const s1 = result.proposed.find((p) => p.stepId === "s1")!;
    expect(s1.machineId).toBeNull();
    expect(s1.plannedStart).toBeInstanceOf(Date);
  });
});

describe("runScheduler — Konflikt mit anderen Aufträgen", () => {
  it("zweiter Auftrag wird hinter den ersten gequetscht (kein Double-Booking)", () => {
    const o1 = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const o2 = simpleOrder({
      id: "o2",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s2", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const result = runScheduler(
      { orders: [o1, o2], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    // Beide Slots sollen unterschiedliche Zeiten haben — keine Überlappung
    const s1 = result.proposed.find((p) => p.stepId === "s1")!;
    const s2 = result.proposed.find((p) => p.stepId === "s2")!;
    const overlap =
      s1.plannedStart < s2.plannedEnd && s2.plannedStart < s1.plannedEnd;
    expect(overlap).toBe(false);
  });

  it("EXPRESS überholt regulären Auftrag", () => {
    const regular = simpleOrder({
      id: "regular",
      promisedAt: ch("2026-05-15T17:00:00"),
      steps: [{ id: "r1", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const express = simpleOrder({
      id: "express",
      priority: "EXPRESS",
      promisedAt: ch("2026-05-15T17:00:00"),
      steps: [{ id: "e1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    const result = runScheduler(
      { orders: [regular, express], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T08:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    const e = result.proposed.find((p) => p.stepId === "e1")!;
    // Express startet sofort
    expect(e.plannedStart).toEqual(ch("2026-05-04T08:00:00"));
  });
});

describe("runScheduler — Mehrere Maschinen vom selben Typ", () => {
  it("zwei Aufträge gleichzeitig auf zwei Maschinen", () => {
    const machines: MachineRow[] = [
      makeMachine("blast1", "BLAST_CABIN"),
      makeMachine("blast2", "BLAST_CABIN"),
    ];
    const o1 = simpleOrder({
      id: "o1",
      priority: "EXPRESS",
      promisedAt: ch("2026-05-15T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const o2 = simpleOrder({
      id: "o2",
      priority: "EXPRESS",
      promisedAt: ch("2026-05-15T17:00:00"),
      steps: [{ id: "s2", machineType: "BLAST_CABIN", minutes: 240 }],
    });
    const result = runScheduler(
      { orders: [o1, o2], machines, holidays: new Set() },
      { now: ch("2026-05-04T08:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    const s1 = result.proposed.find((p) => p.stepId === "s1")!;
    const s2 = result.proposed.find((p) => p.stepId === "s2")!;
    // Verschiedene Maschinen
    expect(s1.machineId).not.toBe(s2.machineId);
    // Dürfen gleichzeitig laufen
    expect(s1.plannedStart).toEqual(s2.plannedStart);
  });
});

describe("runScheduler — Skill-Konflikt-Erkennung", () => {
  it("meldet SKILL_MISSING wenn kein qualifizierter Mitarbeiter im Bestand", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    // skillRequired wird in simpleOrder auf "BLASTER" gesetzt — das hier
    // aber nicht in qualifiedSkills.
    const result = runScheduler(
      {
        orders: [order],
        machines: STD_MACHINES,
        holidays: new Set(),
        qualifiedSkills: new Set(["PAINTER"]),
      },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    const skillConflict = result.conflicts.find((c) => c.type === "SKILL_MISSING");
    expect(skillConflict).toBeDefined();
    expect(skillConflict!.severity).toBe("ERROR");
    expect(skillConflict!.message).toContain("BLASTER");
  });

  it("kein SKILL_MISSING wenn qualifizierte Mitarbeiter vorhanden sind", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    const result = runScheduler(
      {
        orders: [order],
        machines: STD_MACHINES,
        holidays: new Set(),
        qualifiedSkills: new Set(["BLASTER", "PAINTER"]),
      },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts.filter((c) => c.type === "SKILL_MISSING")).toHaveLength(0);
  });

  it("ohne qualifiedSkills wird die Skill-Prüfung übersprungen (Backward-Compat)", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [{ id: "s1", machineType: "BLAST_CABIN", minutes: 60 }],
    });
    const result = runScheduler(
      { orders: [order], machines: STD_MACHINES, holidays: new Set() },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    expect(result.conflicts.filter((c) => c.type === "SKILL_MISSING")).toHaveLength(0);
  });

  it("dedupliziert mehrfache fehlende Skills pro (Order, Skill)", () => {
    const order = simpleOrder({
      id: "o1",
      promisedAt: ch("2026-05-08T17:00:00"),
      steps: [
        { id: "s1", machineType: "BLAST_CABIN", minutes: 60 },
        { id: "s2", machineType: "BLAST_CABIN", minutes: 60 },
        { id: "s3", machineType: "BLAST_CABIN", minutes: 60 },
      ],
    });
    const result = runScheduler(
      {
        orders: [order],
        machines: STD_MACHINES,
        holidays: new Set(),
        qualifiedSkills: new Set(),
      },
      { now: ch("2026-05-04T07:00:00"), bufferDays: 1, ignoreExistingAutoSchedule: false },
    );
    // Nur ein SKILL_MISSING-Konflikt pro Auftrag + Skill, nicht pro Schritt.
    const skillConflicts = result.conflicts.filter((c) => c.type === "SKILL_MISSING");
    expect(skillConflicts).toHaveLength(1);
  });
});
