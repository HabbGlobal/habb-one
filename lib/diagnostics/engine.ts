/**
 * Diagnose-Orchestrator pro Mandant: Run anlegen → Checks + Detection
 * → Findings deduplizieren/auto-resolven → SecurityEvents schreiben →
 * Score/Snapshot → Run finalisieren. Idempotent über dedupeKey.
 *
 * KEINE externe KI. E-Mail-Versand ist Phase 2 (hier nur Datenstand).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runTenantChecks } from "./checks";
import { detectSecurityEvents } from "./detection";
import { computeHealth } from "./scoring";
import { findResolvedKeys } from "./dedupe";
import type { Severity } from "./types";

export interface DiagnosticOutcome {
  companyId: string;
  runId: string;
  status: "success" | "partial_failure" | "failed";
  score: number;
  health: string;
  openFindings: number;
  criticalFindings: number;
  warningFindings: number;
  securityEvents: number;
}

const TOTAL_CHECKS = 8; // structurelle + metrische Check-Gruppen (Phase 1)

export async function runDiagnosticsForCompany(
  companyId: string,
  triggeredBy: "cron" | "manual" | "system",
): Promise<DiagnosticOutcome> {
  const startedAt = new Date();
  const run = await prisma.diagnosticRun.create({
    data: { companyId, triggeredBy, status: "running", startedAt },
  });

  let failed = false;
  let findingCount = 0;
  let securityCount = 0;

  try {
    const { findings, detection } = await runTenantChecks(companyId);
    const events = detectSecurityEvents(detection);

    // ── Findings: dedupe + reopen + auto-resolve ──────────────────
    const existing = await prisma.diagnosticFinding.findMany({
      where: { companyId },
      select: { id: true, dedupeKey: true, status: true },
    });
    const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
    const currentKeys: string[] = [];

    for (const f of findings) {
      currentKeys.push(f.dedupeKey);
      const prev = byKey.get(f.dedupeKey);
      if (!prev) {
        await prisma.diagnosticFinding.create({
          data: {
            companyId,
            runId: run.id,
            category: f.category,
            severity: f.severity,
            title: f.title,
            message: f.message,
            technicalDetails: (f.technicalDetails ?? {}) as Prisma.InputJsonValue,
            recommendation: f.recommendation,
            dedupeKey: f.dedupeKey,
          },
        });
      } else {
        // Wiederauftreten: lastSeenAt aktualisieren; resolved/ignored
        // NICHT automatisch reaktivieren (Owner-Entscheid respektieren),
        // außer es war 'resolved' (echtes Reopen bei Rückfall).
        await prisma.diagnosticFinding.update({
          where: { id: prev.id },
          data: {
            lastSeenAt: new Date(),
            runId: run.id,
            severity: f.severity,
            message: f.message,
            technicalDetails: (f.technicalDetails ?? {}) as Prisma.InputJsonValue,
            ...(prev.status === "resolved"
              ? { status: "open", resolvedAt: null }
              : {}),
          },
        });
      }
    }

    // Auto-resolve: vormals offene Keys, die jetzt fehlen.
    const openKeys = existing
      .filter((e) => e.status === "open" || e.status === "acknowledged")
      .map((e) => e.dedupeKey);
    const resolved = findResolvedKeys(openKeys, currentKeys);
    if (resolved.length > 0) {
      await prisma.diagnosticFinding.updateMany({
        where: { companyId, dedupeKey: { in: resolved }, status: { in: ["open", "acknowledged"] } },
        data: { status: "resolved", resolvedAt: new Date() },
      });
    }

    // ── SecurityEvents (point-in-time inserts) ────────────────────
    for (const e of events) {
      await prisma.securityEvent.create({
        data: {
          companyId,
          actorUserId: e.actorUserId ?? null,
          eventType: e.eventType,
          severity: e.severity,
          source: e.source,
          ipHash: e.ipHash ?? null,
          userAgentHash: e.userAgentHash ?? null,
          riskScore: e.riskScore,
          message: e.message,
          evidence: (e.evidence ?? {}) as Prisma.InputJsonValue,
        },
      });
    }
    securityCount = events.length;

    // ── Score aus aktuellem Stand ─────────────────────────────────
    const openNow = await prisma.diagnosticFinding.findMany({
      where: { companyId, status: { in: ["open", "acknowledged"] } },
      select: { severity: true },
    });
    findingCount = openNow.length;
    const since24 = new Date(Date.now() - 24 * 3_600_000);
    const recentSec = await prisma.securityEvent.findMany({
      where: { companyId, detectedAt: { gte: since24 } },
      select: { severity: true },
    });

    const { score, status } = computeHealth({
      findingSeverities: openNow.map((f) => f.severity as Severity),
      securitySeverities: recentSec.map((s) => s.severity as Severity),
      diagnosticsFailed: false,
      hoursSinceLastCheck: 0,
    });

    const crit = openNow.filter((f) => f.severity === "critical" || f.severity === "high").length;
    const warn = openNow.filter((f) => f.severity === "medium" || f.severity === "low").length;

    await prisma.tenantHealthSnapshot.upsert({
      where: { companyId },
      create: {
        companyId,
        status,
        score,
        lastCheckedAt: new Date(),
        openFindingsCount: findingCount,
        criticalFindingsCount: crit,
        warningFindingsCount: warn,
        securityEventsCount: recentSec.length,
      },
      update: {
        status,
        score,
        lastCheckedAt: new Date(),
        openFindingsCount: findingCount,
        criticalFindingsCount: crit,
        warningFindingsCount: warn,
        securityEventsCount: recentSec.length,
      },
    });

    const finishedAt = new Date();
    await prisma.diagnosticRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        checksTotal: TOTAL_CHECKS,
        checksFailed: crit,
        checksWarning: warn,
        checksPassed: Math.max(0, TOTAL_CHECKS - crit - warn),
        summary: `Score ${score} (${status}), ${findingCount} offene Findings, ${securityCount} Security-Events.`,
      },
    });

    return {
      companyId,
      runId: run.id,
      status: "success",
      score,
      health: status,
      openFindings: findingCount,
      criticalFindings: crit,
      warningFindings: warn,
      securityEvents: securityCount,
    };
  } catch (e) {
    failed = true;
    const finishedAt = new Date();
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    await prisma.diagnosticRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summary: `Diagnose fehlgeschlagen: ${message}`,
      },
    });
    // Snapshot trotzdem mit "diagnostics failed"-Abzug aktualisieren.
    const { score, status } = computeHealth({
      findingSeverities: [],
      securitySeverities: [],
      diagnosticsFailed: true,
      hoursSinceLastCheck: 0,
    });
    await prisma.tenantHealthSnapshot.upsert({
      where: { companyId },
      create: { companyId, status, score, lastCheckedAt: new Date() },
      update: { status, score, lastCheckedAt: new Date() },
    });
    return {
      companyId,
      runId: run.id,
      status: "failed",
      score,
      health: status,
      openFindings: findingCount,
      criticalFindings: 0,
      warningFindings: 0,
      securityEvents: securityCount,
    };
  } finally {
    void failed;
  }
}
