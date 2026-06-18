/**
 * Rule-based attack and anomaly detection. Pure, threshold-based,
 * explainable, and without external AI.
 *
 * Input consists of aggregated metrics for a time window, calculated by the
 * engine from AuditLog and OwnerAuditLog. It contains no raw data or PII.
 * Every rule returns a clear evidence structure.
 */

import type { SecurityEventCandidate } from "./types";

export interface DetectionInput {
  /** Time window in minutes to which the metrics apply. */
  windowMinutes: number;
  failedLogins: number;
  /** Distinct accounts with failed logins (credential stuffing/spraying). */
  failedLoginDistinctAccounts: number;
  passwordResetRequests: number;
  newSessions: number;
  forbiddenOrNotFound: number;
  ownerRouteAccessByNonOwner: number;
  rlsOrPermissionErrors: number;
  /** List, export, and download actions used by the exfiltration heuristic. */
  bulkReadActions: number;
  exportActions: number;
  /** Actions outside 06:00–22:00 Europe/Zurich. */
  offHoursActions: number;
  /** Requests from the most frequent IP hash. */
  topIpHashRequestCount: number;
  /** Distinct IP hashes; many rotating fingerprints may indicate a bot. */
  distinctIpHashes: number;
  /** Suspected cross-tenant access. */
  crossTenantAccessAttempts: number;
}

// ── Thresholds (centralized and documented) ──────────────────────────
const T = {
  bruteForce: 15,
  credentialStuffingAccounts: 8,
  passwordResetFlood: 10,
  sessionFlood: 25,
  enumeration: 40,
  ownerRouteAbuse: 1,
  rlsErrors: 5,
  exfilBulkReads: 60,
  exfilExports: 15,
  offHoursBulk: 30,
  ipConcentration: 80,
  fingerprintSpread: 40,
} as const;

export const DETECTION_THRESHOLDS = T;

function ev(
  eventType: string,
  severity: SecurityEventCandidate["severity"],
  source: SecurityEventCandidate["source"],
  riskScore: number,
  message: string,
  evidence: Record<string, unknown>,
): SecurityEventCandidate {
  return { eventType, severity, source, riskScore, message, evidence };
}

/**
 * Applies all rules in a stable order for deterministic tests.
 */
export function detectSecurityEvents(
  input: DetectionInput,
): SecurityEventCandidate[] {
  const out: SecurityEventCandidate[] = [];
  const w = { windowMinutes: input.windowMinutes };

  if (input.failedLogins >= T.bruteForce) {
    out.push(
      ev(
        "brute_force_suspected",
        input.failedLogins >= T.bruteForce * 3 ? "high" : "medium",
        "auth",
        Math.min(100, 30 + input.failedLogins),
        "Unusually many failed login attempts within the time window.",
        { ...w, failedLogins: input.failedLogins, threshold: T.bruteForce },
      ),
    );
  }

  if (input.failedLoginDistinctAccounts >= T.credentialStuffingAccounts) {
    out.push(
      ev(
        "credential_stuffing_suspected",
        "high",
        "auth",
        70,
        "Failed login attempts against many different accounts (stuffing/spraying).",
        {
          ...w,
          distinctAccounts: input.failedLoginDistinctAccounts,
          threshold: T.credentialStuffingAccounts,
        },
      ),
    );
  }

  if (input.passwordResetRequests >= T.passwordResetFlood) {
    out.push(
      ev(
        "password_reset_flood",
        "medium",
        "auth",
        45,
        "Unusually many password reset requests.",
        { ...w, count: input.passwordResetRequests, threshold: T.passwordResetFlood },
      ),
    );
  }

  if (input.newSessions >= T.sessionFlood) {
    out.push(
      ev(
        "session_flood",
        "medium",
        "auth",
        40,
        "A very high number of new sessions in a short time.",
        { ...w, newSessions: input.newSessions, threshold: T.sessionFlood },
      ),
    );
  }

  if (input.forbiddenOrNotFound >= T.enumeration) {
    out.push(
      ev(
        "enumeration_suspected",
        "medium",
        "api",
        50,
        "Many 401/403/404 responses indicate a possible enumeration or scanning attempt.",
        { ...w, count: input.forbiddenOrNotFound, threshold: T.enumeration },
      ),
    );
  }

  if (input.ownerRouteAccessByNonOwner >= T.ownerRouteAbuse) {
    out.push(
      ev(
        "owner_route_unauthorized",
        "high",
        "api",
        80,
        "A non-owner attempted to access owner or admin routes.",
        { ...w, attempts: input.ownerRouteAccessByNonOwner },
      ),
    );
  }

  if (input.rlsOrPermissionErrors >= T.rlsErrors) {
    out.push(
      ev(
        "permission_errors_repeated",
        "medium",
        "api",
        45,
        "Repeated permission or isolation errors.",
        { ...w, count: input.rlsOrPermissionErrors, threshold: T.rlsErrors },
      ),
    );
  }

  if (input.crossTenantAccessAttempts > 0) {
    out.push(
      ev(
        "tenant_isolation_violation_suspected",
        "critical",
        "database",
        95,
        "Suspected cross-tenant data access.",
        { ...w, attempts: input.crossTenantAccessAttempts },
      ),
    );
  }

  if (
    input.bulkReadActions >= T.exfilBulkReads ||
    input.exportActions >= T.exfilExports
  ) {
    out.push(
      ev(
        "data_exfiltration_suspected",
        input.exportActions >= T.exfilExports ? "high" : "medium",
        "api",
        input.exportActions >= T.exfilExports ? 75 : 55,
        "Unusually many list or export operations indicate possible data exfiltration.",
        {
          ...w,
          bulkReads: input.bulkReadActions,
          exports: input.exportActions,
          thresholds: { bulkReads: T.exfilBulkReads, exports: T.exfilExports },
        },
      ),
    );
  }

  if (input.offHoursActions >= T.offHoursBulk) {
    out.push(
      ev(
        "off_hours_bulk_activity",
        "low",
        "system",
        25,
        "High activity outside normal usage hours.",
        { ...w, count: input.offHoursActions, threshold: T.offHoursBulk },
      ),
    );
  }

  if (input.topIpHashRequestCount >= T.ipConcentration) {
    out.push(
      ev(
        "automated_client_suspected",
        "medium",
        "api",
        50,
        "A very high number of requests from one IP hash may indicate a bot or automated tool.",
        {
          ...w,
          topIpHashRequestCount: input.topIpHashRequestCount,
          threshold: T.ipConcentration,
        },
      ),
    );
  }

  if (input.distinctIpHashes >= T.fingerprintSpread) {
    out.push(
      ev(
        "fingerprint_rotation_suspected",
        "medium",
        "api",
        55,
        "Many rotating IP fingerprints indicate distributed or automated access.",
        {
          ...w,
          distinctIpHashes: input.distinctIpHashes,
          threshold: T.fingerprintSpread,
        },
      ),
    );
  }

  return out;
}
