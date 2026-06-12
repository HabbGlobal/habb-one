// Hybrid-Scheduler.
//
// Strategie:
//   - EXPRESS-Aufträge:     vorwärts ASAP — sie überholen alles andere.
//   - Sonst:                rückwärts vom Liefertermin (mit Sicherheits-
//                           Puffer in Tagen) — knallt nur ran wenn's nötig
//                           ist und lässt früh Maschinen frei für Eilige.
//
//   - Innerhalb eines Auftrags werden die Schritte in Sequenz-Reihenfolge
//     geplant — Vorwärts oder Rückwärts je nach Strategie.
//   - waitMinutesAfter blockiert keine Maschine, aber verzögert den nächsten
//     Schritt-Start.
//   - Schritte ohne machineTypeRequired (manuelle Arbeit) werden NICHT auf
//     Maschinen gebucht — sie bekommen plannedStart/plannedEnd basierend
//     auf der Standard-Werkstatt-Arbeitszeit, brauchen aber keinen Slot.
//
// Inputs sind reine Daten (keine Prisma-Calls hier!) — Caller lädt alles
// und übergibt an `runScheduler`. Damit ist die Logik 1:1 testbar.

import {
  addWorkingMinutes,
  buildResourceGraph,
  findFreeSlotBackward,
  findFreeSlotForward,
  reserveSlot,
  subtractWorkingMinutes,
  type MachineRow,
  type MachineState,
} from "./resource-graph";
import {
  DEFAULT_WORKING_HOURS,
  type HolidaySet,
  type WorkingHoursJson,
} from "./calendar";

// ─────────────────────────────────────────
// Input-Typen — vom Caller geliefert
// ─────────────────────────────────────────

export interface SchedulableStep {
  id: string;
  orderItemId: string;
  /** Reihenfolge innerhalb des Auftrags (sequence × OrderItem.position). */
  globalSequence: number;
  estimatedMinutes: number;
  waitMinutesAfter: number;
  /** Wenn null → manueller Schritt, kein Maschinen-Slot nötig. */
  machineTypeRequired: string | null;
  skillRequired: string;
}

export interface SchedulableOrder {
  id: string;
  orderNumber: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "EXPRESS";
  promisedAt: Date;
  internalDeadline: Date | null;
  /** Schritte in Reihenfolge: erst nach OrderItem.position, dann nach
   *  ProcessStep.sequence. */
  steps: SchedulableStep[];
}

export interface ScheduleConfig {
  /** Wann „jetzt" sein soll — bei Tests injizierbar, sonst Date.now(). */
  now: Date;
  /** Sicherheits-Puffer-Tage vor dem Liefertermin (Default 1). */
  bufferDays: number;
  /** Wenn true: vorhandene auto-geplante Einträge werden ignoriert (für
   *  Re-Plan vom Scratch); locked Einträge bleiben immer. */
  ignoreExistingAutoSchedule: boolean;
}

export const DEFAULT_CONFIG: ScheduleConfig = {
  now: new Date(),
  bufferDays: 1,
  ignoreExistingAutoSchedule: false,
};

// ─────────────────────────────────────────
// Output-Typen
// ─────────────────────────────────────────

export interface ProposedSchedule {
  stepId: string;
  machineId: string | null;
  plannedStart: Date;
  plannedEnd: Date;
}

export type ConflictType =
  | "DEADLINE_MISS"
  | "RESOURCE_DOUBLE_BOOK"
  | "SKILL_MISSING"
  | "MACHINE_OVERSIZE"
  | "DEPENDENCY_VIOLATED"
  | "CAPACITY_EXCEEDED";

export interface SchedulerConflict {
  orderId: string;
  stepId?: string;
  type: ConflictType;
  severity: "INFO" | "WARN" | "ERROR";
  message: string;
}

export interface SchedulerResult {
  proposed: ProposedSchedule[];
  conflicts: SchedulerConflict[];
}

// ─────────────────────────────────────────
// Hauptfunktion
// ─────────────────────────────────────────

export interface SchedulerInputs {
  orders: SchedulableOrder[];
  machines: MachineRow[];
  /** Lokale Datumstrings "YYYY-MM-DD" — Feiertage. */
  holidays: HolidaySet;
  /** Skill-Codes, die im Personalbestand mindestens einmal vorhanden sind.
   *  Schritte mit `skillRequired` außerhalb dieses Sets erzeugen einen
   *  SKILL_MISSING-Konflikt (Severity ERROR). NULL = keine Skill-Prüfung
   *  durchführen (Backward-Compat für Aufrufer, die keine Skills laden). */
  qualifiedSkills?: Set<string> | null;
}

/**
 * Plant alle übergebenen Aufträge. Reihenfolge der Verarbeitung:
 *   1. EXPRESS zuerst (forward, ASAP)
 *   2. Rest sortiert nach (Priority desc, Deadline asc) (backward)
 *
 * Innerhalb eines Auftrags werden die Schritte in Reihenfolge geplant
 * (forward = aufsteigend, backward = absteigend).
 */
export function runScheduler(
  inputs: SchedulerInputs,
  config: ScheduleConfig = DEFAULT_CONFIG,
): SchedulerResult {
  const machineMap = buildResourceGraph(inputs.machines);
  const proposed: ProposedSchedule[] = [];
  const conflicts: SchedulerConflict[] = [];

  // Skill-Check: für jeden Schritt prüfen, ob mindestens ein aktiver
  // Mitarbeiter die geforderte Kompetenz hat. Wenn nicht → SKILL_MISSING-
  // Konflikt (Severity ERROR). Dedupliziert pro (orderId, skillRequired),
  // damit derselbe fehlende Skill nicht 10× im Log auftaucht.
  if (inputs.qualifiedSkills) {
    const reported = new Set<string>();
    for (const order of inputs.orders) {
      for (const step of order.steps) {
        if (!step.skillRequired) continue;
        if (inputs.qualifiedSkills.has(step.skillRequired)) continue;
        const key = `${order.id}::${step.skillRequired}`;
        if (reported.has(key)) continue;
        reported.add(key);
        conflicts.push({
          orderId: order.id,
          stepId: step.id,
          type: "SKILL_MISSING",
          severity: "ERROR",
          message: `Keine Mitarbeitenden mit Kompetenz "${step.skillRequired}" verfügbar.`,
        });
      }
    }
  }

  // Aufträge sortieren
  const expressOrders = inputs.orders.filter((o) => o.priority === "EXPRESS");
  const regularOrders = inputs.orders
    .filter((o) => o.priority !== "EXPRESS")
    .sort((a, b) => {
      // PRIO desc (HIGH > NORMAL > LOW)
      const prioRank = { HIGH: 0, NORMAL: 1, LOW: 2, EXPRESS: -1 };
      const dp = prioRank[a.priority] - prioRank[b.priority];
      if (dp !== 0) return dp;
      // Deadline asc
      return a.promisedAt.getTime() - b.promisedAt.getTime();
    });

  for (const order of expressOrders) {
    scheduleOrderForward(order, machineMap, inputs.holidays, config, proposed, conflicts);
  }
  for (const order of regularOrders) {
    scheduleOrderBackward(order, machineMap, inputs.holidays, config, proposed, conflicts);
  }

  return { proposed, conflicts };
}

// ─────────────────────────────────────────
// Forward (Express)
// ─────────────────────────────────────────

function scheduleOrderForward(
  order: SchedulableOrder,
  machineMap: Map<string, MachineState>,
  holidays: HolidaySet,
  config: ScheduleConfig,
  proposed: ProposedSchedule[],
  conflicts: SchedulerConflict[],
): void {
  let cursor = config.now;
  for (const step of order.steps) {
    const slot = findSlotForStepForward(step, machineMap, holidays, cursor);
    if (!slot) {
      conflicts.push({
        orderId: order.id,
        stepId: step.id,
        type: "MACHINE_OVERSIZE",
        severity: "ERROR",
        message: `Keine passende Maschine vom Typ ${step.machineTypeRequired} verfügbar.`,
      });
      // Schritt überspringen, restliche Schritte können trotzdem Slots
      // bekommen (führt aber wahrscheinlich zu DEADLINE_MISS).
      continue;
    }
    proposed.push({
      stepId: step.id,
      machineId: slot.machineId,
      plannedStart: slot.start,
      plannedEnd: slot.end,
    });
    if (slot.machineId) {
      reserveSlot(machineMap.get(slot.machineId)!, {
        start: slot.start,
        end: slot.end,
      });
    }
    cursor = new Date(slot.end.getTime() + step.waitMinutesAfter * 60_000);
  }
  checkDeadline(order, proposed, conflicts);
}

interface ForwardSlot {
  machineId: string | null;
  start: Date;
  end: Date;
}

function findSlotForStepForward(
  step: SchedulableStep,
  machineMap: Map<string, MachineState>,
  holidays: HolidaySet,
  earliestStart: Date,
): ForwardSlot | null {
  // Manueller Schritt — keine Maschine, nur Werkstatt-Arbeitszeit
  if (!step.machineTypeRequired) {
    const start = addWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      holidays,
      [],
      earliestStart,
      0,
    );
    const end = addWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      holidays,
      [],
      start,
      step.estimatedMinutes,
    );
    return { machineId: null, start, end };
  }

  const candidates = [...machineMap.values()].filter(
    (m) => m.type === step.machineTypeRequired,
  );
  let best: ForwardSlot | null = null;
  for (const m of candidates) {
    const slot = findFreeSlotForward(m, holidays, step.estimatedMinutes, earliestStart);
    if (!slot) continue;
    if (!best || slot.start < best.start) {
      best = { machineId: m.id, start: slot.start, end: slot.end };
    }
  }
  return best;
}

// ─────────────────────────────────────────
// Backward (Standard)
// ─────────────────────────────────────────

function scheduleOrderBackward(
  order: SchedulableOrder,
  machineMap: Map<string, MachineState>,
  holidays: HolidaySet,
  config: ScheduleConfig,
  proposed: ProposedSchedule[],
  conflicts: SchedulerConflict[],
): void {
  // Deadline = max(internalDeadline, promisedAt) minus Puffer
  const deadline = order.internalDeadline ?? order.promisedAt;
  const targetEnd = subtractDays(deadline, config.bufferDays);

  // In umgekehrter Reihenfolge planen
  let cursor = targetEnd;
  const reversed = [...order.steps].reverse();
  const backwardSlots: ProposedSchedule[] = [];
  for (let i = 0; i < reversed.length; i++) {
    const step = reversed[i];
    // waitMinutesAfter dieses Schritts: blockiert die Zeit zwischen
    // step.end und next.start. Beim Rückwärts-Lauf heisst das: cursor
    // muss schon DIESEN Wait abziehen, bevor wir das End suchen.
    const adjustedCursor = new Date(cursor.getTime() - step.waitMinutesAfter * 60_000);
    const slot = findSlotForStepBackward(step, machineMap, holidays, adjustedCursor);
    if (!slot) {
      conflicts.push({
        orderId: order.id,
        stepId: step.id,
        type: "MACHINE_OVERSIZE",
        severity: "ERROR",
        message: `Keine passende Maschine vom Typ ${step.machineTypeRequired} verfügbar.`,
      });
      // Wenn das fehlschlägt, müssen wir das Ganze konservativ als
      // unscheduled markieren — aber für die nachfolgenden (vorherigen
      // in Reihenfolge!) Schritte machen wir trotzdem weiter um möglichst
      // viele Konflikte sichtbar zu machen.
      continue;
    }
    backwardSlots.push({
      stepId: step.id,
      machineId: slot.machineId,
      plannedStart: slot.start,
      plannedEnd: slot.end,
    });
    cursor = slot.start;
  }

  // Wenn Anfang vor "now" → wir können nicht mehr in der Vergangenheit
  // anfangen. Konflikt: DEADLINE_MISS — bei Backward dann EH zu spät, also
  // shiften wir alle Slots forward (ASAP) als Notfall.
  const earliest = backwardSlots.length > 0
    ? backwardSlots[backwardSlots.length - 1].plannedStart
    : null;
  if (earliest && earliest < config.now) {
    // Notfall-Forward-Reschedule: alle Buchungen wieder freigeben und
    // forward planen.
    for (const slot of backwardSlots) {
      if (slot.machineId) {
        // Wir hatten noch nicht reserved — wir reservieren erst unten.
        // Daher hier nichts zu freigeben.
      }
    }
    // Forward-Schedule als Fallback
    scheduleOrderForward(order, machineMap, holidays, config, proposed, conflicts);
    conflicts.push({
      orderId: order.id,
      type: "DEADLINE_MISS",
      severity: "ERROR",
      message: `Liefertermin nicht erreichbar — automatisch ASAP geplant. Tatsächliches Ende kann nach Liefertermin liegen.`,
    });
    return;
  }

  // Slots in der echten Reihenfolge committen
  for (let i = backwardSlots.length - 1; i >= 0; i--) {
    const s = backwardSlots[i];
    proposed.push(s);
    if (s.machineId) {
      reserveSlot(machineMap.get(s.machineId)!, {
        start: s.plannedStart,
        end: s.plannedEnd,
      });
    }
  }

  checkDeadline(order, proposed, conflicts);
}

interface BackwardSlot {
  machineId: string | null;
  start: Date;
  end: Date;
}

function findSlotForStepBackward(
  step: SchedulableStep,
  machineMap: Map<string, MachineState>,
  holidays: HolidaySet,
  latestEnd: Date,
): BackwardSlot | null {
  if (!step.machineTypeRequired) {
    const end = subtractWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      holidays,
      [],
      latestEnd,
      0,
    );
    const start = subtractWorkingMinutes(
      DEFAULT_WORKING_HOURS,
      holidays,
      [],
      end,
      step.estimatedMinutes,
    );
    return { machineId: null, start, end };
  }

  const candidates = [...machineMap.values()].filter(
    (m) => m.type === step.machineTypeRequired,
  );
  let best: BackwardSlot | null = null;
  for (const m of candidates) {
    const slot = findFreeSlotBackward(m, holidays, step.estimatedMinutes, latestEnd);
    if (!slot) continue;
    // Spätester Slot gewinnt
    if (!best || slot.end > best.end) {
      best = { machineId: m.id, start: slot.start, end: slot.end };
    }
  }
  return best;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function subtractDays(d: Date, n: number): Date {
  return new Date(d.getTime() - n * 86_400_000);
}

function checkDeadline(
  order: SchedulableOrder,
  proposed: ProposedSchedule[],
  conflicts: SchedulerConflict[],
): void {
  const orderProposed = proposed.filter((p) =>
    order.steps.some((s) => s.id === p.stepId),
  );
  if (orderProposed.length === 0) return;
  const lastEnd = orderProposed
    .map((p) => p.plannedEnd.getTime())
    .reduce((a, b) => Math.max(a, b), 0);
  const lastWaitMinutes = order.steps[order.steps.length - 1]?.waitMinutesAfter ?? 0;
  const effectiveEnd = new Date(lastEnd + lastWaitMinutes * 60_000);
  if (effectiveEnd > order.promisedAt) {
    const minutesLate = Math.ceil(
      (effectiveEnd.getTime() - order.promisedAt.getTime()) / 60_000,
    );
    conflicts.push({
      orderId: order.id,
      type: "DEADLINE_MISS",
      severity: minutesLate > 24 * 60 ? "ERROR" : "WARN",
      message: `Liefertermin um ${formatLate(minutesLate)} überschritten.`,
    });
  }
}

function formatLate(min: number): string {
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "Day" : "Tage"}`;
}

// ─────────────────────────────────────────
// Re-Exports
// ─────────────────────────────────────────
export type { WorkingHoursJson, HolidaySet };
