/**
 * E-Mail-Orchestrierung für Owner-Diagnostics (Phase 2).
 *
 * - Hourly Digest: EINE Mail/Stunde, alle Mandanten zusammengefasst.
 * - Immediate: high/critical Findings + Security-Events ab medium,
 *   dedupliziert (Re-Notify frühestens nach 6 h, siehe dedupe.ts).
 * - Jede Mail wird in DiagnosticEmailNotification protokolliert
 *   (pending → sent/failed/skipped).
 *
 * Empfänger: DIAGNOSTICS_EMAIL_TO, sonst OWNER_NOTIFY_EMAIL.
 * Absender: bestehende Infra (MAIL_FROM via sendMail). KEINE PII.
 */

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail/send";
import { shouldSendImmediateEmail } from "./dedupe";
import type { Severity } from "./types";
import {
  buildDigestMail,
  buildImmediateFindingMail,
  buildSecurityEventMail,
  buildManualTestMail,
  type DigestTenantLine,
} from "@/lib/mail/templates/diagnostics";

export function resolveRecipient(): string | null {
  const a = process.env.DIAGNOSTICS_EMAIL_TO?.trim();
  const b = process.env.OWNER_NOTIFY_EMAIL?.trim();
  return a || b || null;
}

function hourBucket(d = new Date()): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

async function record(
  data: {
    companyId?: string | null;
    findingId?: string | null;
    securityEventId?: string | null;
    recipientEmail: string;
    subject: string;
    severity: string;
    notificationType: string;
    dedupeKey: string;
  },
  send: () => Promise<{ id: string; delivered: boolean }>,
): Promise<"sent" | "failed"> {
  const row = await prisma.diagnosticEmailNotification.create({
    data: { ...data, status: "pending" },
  });
  try {
    const res = await send();
    await prisma.diagnosticEmailNotification.update({
      where: { id: row.id },
      data: { status: "sent", providerMessageId: res.id, sentAt: new Date() },
    });
    return "sent";
  } catch (e) {
    await prisma.diagnosticEmailNotification.update({
      where: { id: row.id },
      data: {
        status: "failed",
        errorMessage: e instanceof Error ? e.message.slice(0, 500) : "unknown",
      },
    });
    return "failed";
  }
}

/** Letzter Sofort-Versand-Zeitpunkt für einen dedupeKey (oder null). */
async function lastImmediateAt(dedupeKey: string): Promise<Date | null> {
  const last = await prisma.diagnosticEmailNotification.findFirst({
    where: { dedupeKey, status: "sent" },
    orderBy: { createdAt: "desc" },
    select: { sentAt: true, createdAt: true },
  });
  return last ? (last.sentAt ?? last.createdAt) : null;
}

export interface NotifySummary {
  recipient: string | null;
  digestSent: boolean;
  immediateSent: number;
  skipped: boolean;
}

/**
 * Wird vom Cron NACH dem Diagnose-Lauf aufgerufen. Best-effort —
 * Fehler dürfen den Cron nie kippen (Aufrufer kapselt zusätzlich).
 */
export async function sendDiagnosticsDigestAndAlerts(): Promise<NotifySummary> {
  const recipient = resolveRecipient();
  if (!recipient) {
    return { recipient: null, digestSent: false, immediateSent: 0, skipped: true };
  }

  // ── Hourly Digest (1×/Stunde, dedupe über Stunden-Bucket) ────────
  const digestKey = `digest:${hourBucket()}`;
  const digestExists = await prisma.diagnosticEmailNotification.findFirst({
    where: { dedupeKey: digestKey, notificationType: "hourly_digest" },
    select: { id: true },
  });

  let digestSent = false;
  if (!digestExists) {
    const snaps = await prisma.tenantHealthSnapshot.findMany({
      include: { company: { select: { name: true } } },
    });
    const lines: DigestTenantLine[] = snaps.map((s) => ({
      tenantName: s.company.name,
      status: s.status as DigestTenantLine["status"],
      score: s.score,
      open: s.openFindingsCount,
      critical: s.criticalFindingsCount,
      warning: s.warningFindingsCount,
      securityEvents: s.securityEventsCount,
    }));
    const mail = buildDigestMail({
      generatedAtIso: new Date().toISOString(),
      tenants: lines,
    });
    const worstScore = lines.reduce((m, l) => Math.min(m, l.score), 100);
    const sev: Severity =
      worstScore < 70 ? "critical" : worstScore < 90 ? "high" : "info";
    const r = await record(
      {
        recipientEmail: recipient,
        subject: mail.subject,
        severity: sev,
        notificationType: "hourly_digest",
        dedupeKey: digestKey,
      },
      () =>
        sendMail({
          to: recipient,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          tag: "diag-digest",
        }),
    );
    digestSent = r === "sent";
  }

  // ── Immediate: high/critical Findings (letzte 70 Min) ────────────
  let immediateSent = 0;
  const since = new Date(Date.now() - 70 * 60_000);

  const hot = await prisma.diagnosticFinding.findMany({
    where: {
      status: "open",
      severity: { in: ["high", "critical"] },
      lastSeenAt: { gte: since },
    },
    include: { company: { select: { name: true } } },
  });
  for (const f of hot) {
    const key = `imm:finding:${f.companyId}:${f.dedupeKey}`;
    const last = await lastImmediateAt(key);
    if (
      !shouldSendImmediateEmail({
        severity: f.severity as Severity,
        isSecurity: false,
        lastNotifiedAt: last,
      })
    )
      continue;
    const mail = buildImmediateFindingMail({
      tenantName: f.company.name,
      severity: f.severity as Severity,
      category: f.category,
      title: f.title,
      message: f.message,
      recommendation: f.recommendation,
    });
    const r = await record(
      {
        companyId: f.companyId,
        findingId: f.id,
        recipientEmail: recipient,
        subject: mail.subject,
        severity: f.severity,
        notificationType: "finding_created",
        dedupeKey: key,
      },
      () =>
        sendMail({
          to: recipient,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          tag: "diag-finding",
        }),
    );
    if (r === "sent") immediateSent++;
  }

  // ── Immediate: Security-Events ab medium (letzte 70 Min) ─────────
  const sec = await prisma.securityEvent.findMany({
    where: {
      severity: { in: ["medium", "high", "critical"] },
      detectedAt: { gte: since },
    },
    include: { company: { select: { name: true } } },
  });
  for (const s of sec) {
    const key = `imm:sec:${s.companyId ?? "platform"}:${s.eventType}`;
    const last = await lastImmediateAt(key);
    if (
      !shouldSendImmediateEmail({
        severity: s.severity as Severity,
        isSecurity: true,
        lastNotifiedAt: last,
      })
    )
      continue;
    const mail = buildSecurityEventMail({
      tenantName: s.company?.name ?? null,
      severity: s.severity as Severity,
      eventType: s.eventType,
      message: s.message,
      riskScore: s.riskScore,
    });
    const r = await record(
      {
        companyId: s.companyId,
        securityEventId: s.id,
        recipientEmail: recipient,
        subject: mail.subject,
        severity: s.severity,
        notificationType: "security_event",
        dedupeKey: key,
      },
      () =>
        sendMail({
          to: recipient,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          tag: "diag-security",
        }),
    );
    if (r === "sent") immediateSent++;
  }

  return { recipient, digestSent, immediateSent, skipped: false };
}

/** Manueller Test-Mail-Versand (Phase-3-UI nutzt das). */
export async function sendManualTestEmail(): Promise<{
  ok: boolean;
  recipient: string | null;
}> {
  const recipient = resolveRecipient();
  if (!recipient) return { ok: false, recipient: null };
  const mail = buildManualTestMail();
  const r = await record(
    {
      recipientEmail: recipient,
      subject: mail.subject,
      severity: "info",
      notificationType: "manual_test",
      dedupeKey: `manual_test:${Date.now()}`,
    },
    () =>
      sendMail({
        to: recipient,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tag: "diag-test",
      }),
  );
  return { ok: r === "sent", recipient };
}
