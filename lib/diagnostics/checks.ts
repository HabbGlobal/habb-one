/**
 * Per-tenant checks: structural findings and aggregation of detection metrics
 * from AuditLog (window = last 60 minutes).
 *
 * Phase 1 implements signals that can be derived reliably. Signals that are
 * not logged (reads, exports, 404s, owner-route abuse per tenant) deliberately
 * remain 0 instead of being fabricated. See docs/diagnostics.md.
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
  // Approximate Europe/Zurich hour (UTC+1; Phase 1 does not account for DST,
  // which is sufficient for the "outside 06:00–22:00" heuristic).
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
        title: "No system parameters configured",
        message:
          "No calculation parameters exist for this tenant. Quote and order calculations will fail.",
        recommendation:
          "Backfill the system parameters or configure them in the admin portal.",
        dedupeKey: buildDedupeKey("configuration", "no_system_params"),
      });
    }
    // Having no entitlement rows is no longer an error. In the current model,
    // it simply means there are no manual overrides and the plan determines
    // all modules. Override rows are created only for manual grants or blocks.
    const planModules = PLAN_MODULES[company.plan] ?? [];
    if (planModules.includes("INVOICES_QR") && !company.qrIban) {
      findings.push({
        category: "configuration",
        severity: "high",
        title: "QR-IBAN missing while invoice module is active",
        message:
          "The invoice and QR module is included in the plan, but no QR-IBAN is configured. QR invoices cannot be generated.",
        recommendation:
          "Configure the QR-IBAN in the tenant master data in the Owner Portal.",
        dedupeKey: buildDedupeKey("configuration", "missing_qr_iban"),
      });
    }
    if (company.suspendedAt) {
      findings.push({
        category: "availability",
        severity: "info",
        title: "Tenant is suspended",
        message: "Login is disabled for this tenant.",
        recommendation:
          "If this was not intentional, reactivate the tenant in the Owner Portal.",
        dedupeKey: buildDedupeKey("availability", "suspended"),
      });
    }
  }

  // ── Auth/security metrics from AuditLog (60-minute window) ───────
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
    passwordResetRequests: 0, // Phase 1: no dedicated tenant audit event
    newSessions: logins.length,
    forbiddenOrNotFound: 0, // Phase 1: no request-level logging
    ownerRouteAccessByNonOwner: 0, // platform-wide, not per tenant
    rlsOrPermissionErrors: 0,
    bulkReadActions: 0, // AuditLog records mutations, not reads
    exportActions: 0,
    offHoursActions: rows.filter((r) => isOffHoursZurich(r.createdAt)).length,
    topIpHashRequestCount: topIp,
    distinctIpHashes: ipCounts.size,
    crossTenantAccessAttempts: 0,
  };

  // ── Derive an auth finding from metrics (visible in dashboard) ───
  if (failed.length >= 15) {
    findings.push({
      category: "auth",
      severity: failed.length >= 45 ? "high" : "medium",
      title: "Many failed login attempts",
      message: `${failed.length} failed login attempts in the last ${WINDOW_MINUTES} minutes.`,
      technicalDetails: { failedLogins: failed.length, windowMinutes: WINDOW_MINUTES },
      recommendation:
        "Review the affected accounts and consider temporarily locking them or tightening the rate limit.",
      dedupeKey: buildDedupeKey("auth", "failed_login_spike"),
    });
  }

  return { findings, detection };
}
