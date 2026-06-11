/**
 * Health-Scoring — rein, deterministisch, ohne externe KI.
 * Werte exakt nach Spec; Score immer in [0, 100].
 */

import type { Severity, HealthStatus } from "./types";

const FINDING_PENALTY: Record<Severity, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 3,
  info: 1,
};

const SECURITY_PENALTY: Record<Severity, number> = {
  critical: 35,
  high: 25,
  medium: 12,
  low: 5,
  info: 0,
};

export interface ScoreInput {
  /** Severities offener (nicht resolved/ignored) Findings. */
  findingSeverities: Severity[];
  /** Severities relevanter Security-Events (z. B. letzte 24 h). */
  securitySeverities: Severity[];
  /** Diagnose-Lauf selbst fehlgeschlagen. */
  diagnosticsFailed: boolean;
  /** Stunden seit letzter erfolgreicher Prüfung (null = nie geprüft). */
  hoursSinceLastCheck: number | null;
}

export interface ScoreResult {
  score: number;
  status: HealthStatus;
}

export function computeHealth(input: ScoreInput): ScoreResult {
  // Keine Prüfung > 24 h ODER nie geprüft → unknown.
  if (input.hoursSinceLastCheck === null || input.hoursSinceLastCheck > 24) {
    return { score: 0, status: "unknown" };
  }

  let score = 100;
  for (const s of input.findingSeverities) score -= FINDING_PENALTY[s];
  for (const s of input.securitySeverities) score -= SECURITY_PENALTY[s];
  if (input.diagnosticsFailed) score -= 20;
  if (input.hoursSinceLastCheck > 2) score -= 15;

  score = Math.max(0, Math.min(100, score));

  let status: HealthStatus;
  if (score >= 90) status = "healthy";
  else if (score >= 70) status = "warning";
  else status = "critical";

  return { score, status };
}
