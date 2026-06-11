/**
 * Per-Tenant-Checks: strukturelle Findings + Aggregation der
 * Detection-Kennzahlen aus AuditLog (Fenster = letzte 60 Min).
 *
 * Phase 1 implementiert die belastbar ableitbaren Signale. Nicht
 * geloggte Signale (Reads/Exports/404/Owner-Route-Abuse pro Tenant)
 * bleiben bewusst 0 statt erfunden — siehe docs/diagnostics.md.
 */

import { prisma } from "@/lib/prisma";
import { hashSensitive } from "./hash";
import { buildDedupeKey } from "./dedupe";
import type { DetectionInput } from "./detection";
import type { FindingCandidate } from "./types";
import { PLAN_MODULES } from "@/lib/entitlements/modules";

const WINDOW_MINUTES = 60;

export interface TenantCheckResult {
  findings: FindingCandidate[];
  detection: DetectionInput;
}

function isOffHoursZurich(d: Date): boolean {
  // Grobe Europe/Zurich-Stunde (UTC+1; Phase 1 ohne DST-Feinheit —
  // reicht für die Heuristik "außerhalb 06–22").
  const h = (d.getUTCHours() + 1) % 24;
  return h < 6 || h >= 22;
}

export async function runTenantChecks(
  companyId: string,
): Promise<TenantCheckResult> {
  const findings: FindingCandidate[] = [];

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      plan: true,
      qrIban: true,
      suspendedAt: true,
      registrationStatus: true,
      _count: { select: { systemParameters: true } },
    },
  });

  // ── Configuration / Availability ────────────────────────────────
  if (company) {
    if (company._count.systemParameters === 0) {
      findings.push({
        category: "configuration",
        severity: "high",
        title: "Keine SystemParameter hinterlegt",
        message:
          "Für diesen Mandanten existieren keine Kalkulations-Parameter. Offerten-/Auftragsberechnung schlägt fehl.",
        recommendation:
          "Backfill der SystemParameter ausführen bzw. Parameter im Admin pflegen.",
        dedupeKey: buildDedupeKey("configuration", "no_system_params"),
      });
    }
    // Hinweis: Keine Entitlement-Zeilen ist KEIN Fehler mehr — im neuen
    // Modell bedeutet das schlicht „keine manuellen Abweichungen", der Plan
    // bestimmt dann alle Module. Override-Zeilen entstehen nur bei manuellen
    // Sonderfreischaltungen/-sperren.
    const planModules = PLAN_MODULES[company.plan] ?? [];
    if (planModules.includes("INVOICES_QR") && !company.qrIban) {
      findings.push({
        category: "configuration",
        severity: "high",
        title: "QR-IBAN fehlt trotz aktivem Rechnungs-Modul",
        message:
          "Das Rechnungs-/QR-Modul ist im Plan, aber es ist keine QR-IBAN hinterlegt — QR-Rechnungen sind nicht erzeugbar.",
        recommendation:
          "QR-IBAN in den Firmen-Stammdaten (Owner → Stammdaten) hinterlegen.",
        dedupeKey: buildDedupeKey("configuration", "missing_qr_iban"),
      });
    }
    if (company.suspendedAt) {
      findings.push({
        category: "availability",
        severity: "info",
        title: "Mandant ist suspendiert",
        message: "Login für diesen Mandanten ist deaktiviert.",
        recommendation:
          "Falls unbeabsichtigt: Mandant im Owner-Portal reaktivieren.",
        dedupeKey: buildDedupeKey("availability", "suspended"),
      });
    }
  }

  // ── Auth/Security-Metriken aus AuditLog (Fenster 60 Min) ─────────
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const rows = await prisma.auditLog.findMany({
    where: { companyId, createdAt: { gte: since } },
    select: {
      action: true,
      userId: true,
      ipAddress: true,
      createdAt: true,
    },
  });

  const failed = rows.filter((r) => r.action === "LOGIN_FAILED");
  const logins = rows.filter((r) => r.action === "LOGIN");
  const ipCounts = new Map<string, number>();
  for (const r of rows) {
    const h = hashSensitive(r.ipAddress) ?? "none";
    ipCounts.set(h, (ipCounts.get(h) ?? 0) + 1);
  }
  const topIp = [...ipCounts.values()].reduce((m, v) => Math.max(m, v), 0);

  const detection: DetectionInput = {
    windowMinutes: WINDOW_MINUTES,
    failedLogins: failed.length,
    failedLoginDistinctAccounts: new Set(
      failed.map((r) => r.userId).filter(Boolean),
    ).size,
    passwordResetRequests: 0, // Phase 1: kein dedizierter Tenant-Audit
    newSessions: logins.length,
    forbiddenOrNotFound: 0, // Phase 1: kein Request-Level-Logging
    ownerRouteAccessByNonOwner: 0, // platformseitig, nicht per Tenant
    rlsOrPermissionErrors: 0,
    bulkReadActions: 0, // AuditLog = Mutationen, keine Reads
    exportActions: 0,
    offHoursActions: rows.filter((r) => isOffHoursZurich(r.createdAt)).length,
    topIpHashRequestCount: topIp,
    distinctIpHashes: ipCounts.size,
    crossTenantAccessAttempts: 0,
  };

  // ── Auth-Finding aus Metrik ableiten (sichtbar im Dashboard) ─────
  if (failed.length >= 15) {
    findings.push({
      category: "auth",
      severity: failed.length >= 45 ? "high" : "medium",
      title: "Viele fehlgeschlagene Logins",
      message: `${failed.length} Fehl-Logins in den letzten ${WINDOW_MINUTES} Minuten.`,
      technicalDetails: { failedLogins: failed.length, windowMinutes: WINDOW_MINUTES },
      recommendation:
        "Betroffene Konten prüfen, ggf. temporär sperren / Rate-Limit verschärfen.",
      dedupeKey: buildDedupeKey("auth", "failed_login_spike"),
    });
  }

  return { findings, detection };
}
