/**
 * Regelbasierte Angriffs-/Anomalie-Erkennung — rein, schwellwert-
 * basiert, nachvollziehbar, OHNE externe KI.
 *
 * Eingabe sind aggregierte Kennzahlen eines Zeitfensters (von der
 * Engine aus AuditLog/OwnerAuditLog berechnet) — KEINE Rohdaten,
 * keine PII. Jede Regel liefert eine klare Evidence-Struktur.
 */

import type { SecurityEventCandidate } from "./types";

export interface DetectionInput {
  /** Zeitfenster in Minuten, auf das sich die Zahlen beziehen. */
  windowMinutes: number;
  failedLogins: number;
  /** Distinkte Konten mit Fehl-Logins (Credential-Stuffing/Spraying). */
  failedLoginDistinctAccounts: number;
  passwordResetRequests: number;
  newSessions: number;
  forbiddenOrNotFound: number;
  ownerRouteAccessByNonOwner: number;
  rlsOrPermissionErrors: number;
  /** Listen-/Export-/Download-Aktionen (Exfiltrations-Heuristik). */
  bulkReadActions: number;
  exportActions: number;
  /** Aktionen außerhalb 06–22 Uhr Europe/Zurich. */
  offHoursActions: number;
  /** Requests vom häufigsten IP-Hash. */
  topIpHashRequestCount: number;
  /** Distinkte IP-Hashes (viele wechselnde Fingerprints = Bot). */
  distinctIpHashes: number;
  /** Verdacht auf firmenübergreifenden Zugriff (Tenant-Isolation). */
  crossTenantAccessAttempts: number;
}

// ── Schwellwerte (zentral, dokumentiert) ──────────────────────────────
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
 * Wendet alle Regeln an. Reihenfolge stabil → deterministische Tests.
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
        "Ungewöhnlich viele fehlgeschlagene Logins im Zeitfenster.",
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
        "Fehl-Logins gegen viele unterschiedliche Konten (Stuffing/Spraying).",
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
        "Auffällig viele Passwort-Reset-Anfragen.",
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
        "Sehr viele neue Sessions in kurzer Zeit.",
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
        "Viele 401/403/404 — möglicher Enumeration-/Scan-Versuch.",
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
        "Zugriff auf Owner-/Admin-Routen durch Nicht-Owner.",
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
        "Wiederholte Permission-/Isolations-Fehler.",
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
        "Verdacht auf firmenübergreifenden Datenzugriff (Tenant-Isolation).",
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
        "Auffällig viele Listen-/Export-Zugriffe — mögliche Datenexfiltration.",
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
        "Viel Aktivität außerhalb üblicher Nutzungszeiten.",
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
        "Sehr viele Requests von einem einzelnen IP-Hash (Bot/Tool).",
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
        "Viele wechselnde IP-Fingerprints — verteilter/automatisierter Zugriff.",
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
