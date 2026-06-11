// Pure helpers for ProcessStep-Zeiterfassung via QR-Scan-Events.
//
// Event-Stream-Modell:
//   START   → Schritt beginnt (running)
//   PAUSE   → Schritt pausiert (running stoppt, nicht beendet)
//   RESUME  → Schritt läuft wieder
//   END     → Schritt abgeschlossen
//
// Berechnung:
//   actualMinutes = Σ (PAUSE/END − START/RESUME) über alle Lauf-Intervalle
//
// Robust gegenüber unsauberen Streams (z. B. zwei START hintereinander, EVENT
// vor START, etc.) — wir interpretieren den Stream konservativ und ignorieren
// Übergänge die im aktuellen State nicht gültig sind.

import type {
  ProcessStepEventType,
  ProcessStepTimeEvent,
} from "@prisma/client";

export type ScanState = "NOT_STARTED" | "RUNNING" | "PAUSED" | "DONE";

/** Aktionen die der Mitarbeiter im jeweiligen State auslösen darf. */
export const NEXT_ACTIONS: Record<ScanState, ProcessStepEventType[]> = {
  NOT_STARTED: ["START"],
  RUNNING:     ["PAUSE", "END"],
  PAUSED:      ["RESUME", "END"],
  DONE:        [],
};

export function isActionAllowed(
  state: ScanState,
  action: ProcessStepEventType,
): boolean {
  return NEXT_ACTIONS[state].includes(action);
}

interface MinimalEvent {
  eventType: ProcessStepEventType;
  occurredAt: Date;
}

/**
 * Reduziert einen Event-Stream zum aktuellen Scan-State.
 * Stream wird chronologisch durchlaufen — die Reihenfolge MUSS aufsteigend
 * nach `occurredAt` sortiert sein (Caller entscheidet, wir validieren nicht).
 */
export function deriveStateFromEvents(events: MinimalEvent[]): ScanState {
  let state: ScanState = "NOT_STARTED";
  for (const ev of events) {
    state = applyEvent(state, ev.eventType);
  }
  return state;
}

function applyEvent(state: ScanState, ev: ProcessStepEventType): ScanState {
  // Strikte State-Machine: ungültige Übergänge ignoriert (defensiv).
  if (ev === "START" && state === "NOT_STARTED") return "RUNNING";
  if (ev === "PAUSE" && state === "RUNNING") return "PAUSED";
  if (ev === "RESUME" && state === "PAUSED") return "RUNNING";
  if (ev === "END" && (state === "RUNNING" || state === "PAUSED")) return "DONE";
  return state;
}

/**
 * Reine Berechnung der Ist-Minuten aus dem Event-Stream.
 * Akzeptiert Events in beliebiger Reihenfolge — wir sortieren intern.
 */
export function calcActualMinutes(events: MinimalEvent[]): number {
  if (events.length === 0) return 0;
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  let totalMs = 0;
  let runningSince: Date | null = null;
  let state: ScanState = "NOT_STARTED";

  for (const ev of sorted) {
    const next = applyEvent(state, ev.eventType);

    // Wenn wir gerade laufen, schließt sich ein Intervall durch jeden Event,
    // der "running" verlässt (PAUSE oder END).
    if (state === "RUNNING" && (next === "PAUSED" || next === "DONE")) {
      if (runningSince) {
        totalMs += ev.occurredAt.getTime() - runningSince.getTime();
        runningSince = null;
      }
    }
    // Wenn wir starten oder fortsetzen, beginnt ein neues Intervall.
    if ((state === "NOT_STARTED" || state === "PAUSED") && next === "RUNNING") {
      runningSince = ev.occurredAt;
    }
    state = next;
  }

  // Wenn der Schritt jetzt noch läuft, ist die Zeit bis "jetzt" relevant
  // — wir schliessen das Intervall aber NICHT automatisch ab. Ist-Zeit
  // wird erst beim END-Event final eingefroren. Bis dahin liefern wir
  // eine Live-Schätzung inklusive "running time".
  if (state === "RUNNING" && runningSince) {
    totalMs += Date.now() - runningSince.getTime();
  }

  return Math.round(totalMs / 60_000);
}

/**
 * Liefert nur die "fertige" Ist-Zeit (ohne Live-Anteil) — verwendet beim
 * Schreiben in `ProcessStep.actualMinutes` damit der Wert stabil bleibt.
 *
 * Identisch zu `calcActualMinutes` außer: läuft der Schritt noch, wird
 * NICHT bis "jetzt" extrapoliert.
 */
export function calcStableActualMinutes(events: MinimalEvent[]): number | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  let totalMs = 0;
  let runningSince: Date | null = null;
  let state: ScanState = "NOT_STARTED";

  for (const ev of sorted) {
    const next = applyEvent(state, ev.eventType);
    if (state === "RUNNING" && (next === "PAUSED" || next === "DONE")) {
      if (runningSince) {
        totalMs += ev.occurredAt.getTime() - runningSince.getTime();
        runningSince = null;
      }
    }
    if ((state === "NOT_STARTED" || state === "PAUSED") && next === "RUNNING") {
      runningSince = ev.occurredAt;
    }
    state = next;
  }

  // Niemals extrapolieren — solange noch nicht beendet, "kein finaler Wert".
  if (state !== "DONE") return null;
  return Math.round(totalMs / 60_000);
}

// ─────────────────────────────────────────
// Billing-Logik
// ─────────────────────────────────────────

export type BillingTimeSource = "ACTUAL" | "ESTIMATED" | "MANUAL";

export interface BillingTimeArgs {
  estimatedMinutes: number;
  actualMinutes: number | null;
  billedMinutes: number | null;
  billingTimeSource: BillingTimeSource;
}

/**
 * Liefert die Minutenzahl, die für die Abrechnung verwendet wird.
 * Fallback-Regeln, wenn der gewählte Wert (noch) nicht vorhanden ist:
 *   ACTUAL    → estimatedMinutes wenn actualMinutes null
 *   MANUAL    → estimatedMinutes wenn billedMinutes null
 *   ESTIMATED → estimatedMinutes
 */
export function effectiveBilledMinutes(args: BillingTimeArgs): number {
  switch (args.billingTimeSource) {
    case "ACTUAL":
      return args.actualMinutes ?? args.estimatedMinutes;
    case "MANUAL":
      return args.billedMinutes ?? args.estimatedMinutes;
    case "ESTIMATED":
    default:
      return args.estimatedMinutes;
  }
}

/** Helper: aus DB-ProcessStepTimeEvent-Rows den State + Ist-Zeit ableiten. */
export function summarizeStepEvents(events: ProcessStepTimeEvent[]): {
  state: ScanState;
  liveMinutes: number;
  finalMinutes: number | null;
} {
  return {
    state: deriveStateFromEvents(events),
    liveMinutes: calcActualMinutes(events),
    finalMinutes: calcStableActualMinutes(events),
  };
}
