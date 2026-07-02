/**
 * Health scoring is pure, deterministic, and uses no external AI.
 * Values follow the specification exactly, and the score is always in [0, 100].
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
  /** Severities of open findings that are not resolved or ignored. */
  findingSeverities: Severity[];
  /** Severities of relevant security events, such as those from the last 24 hours. */
  securitySeverities: Severity[];
  /** Whether the diagnostics run itself failed. */
  diagnosticsFailed: boolean;
  /** Hours since the last successful check, or null if never checked. */
  hoursSinceLastCheck: number | null;
}

export interface ScoreResult {
  score: number;
  status: HealthStatus;
}

export function computeHealth(input: ScoreInput): ScoreResult {
  // No check for more than 24 hours, or never checked, means unknown.
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
