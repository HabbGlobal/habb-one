/**
 * Mail-Templates für Owner-Diagnostics. Rein (kein I/O) → unit-testbar.
 *
 * STRIKT keine PII / keine Rohdaten: keine IPs, keine User-Agents,
 * keine Tokens/Secrets/Session-IDs, keine Kundendaten. Nur aggregierte
 * Zahlen, Kategorien, Severities, Mandantennamen und Empfehlungen.
 */

import type { Severity } from "@/lib/diagnostics/types";

const APP_URL = process.env.NEXTAUTH_URL || "https://one.habb.ch";
const DASH = `${APP_URL}/owner/diagnostics`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;">habb<span style="color:#DA0E15">.ch</span> · Diagnose</div>
    <h1 style="font-size:20px;font-weight:600;margin:20px 0 12px 0;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0;"><a href="${DASH}" style="display:inline-block;background:#0A0A0A;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:500;">Owner-Dashboard öffnen</a></p>
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:20px 0;" />
    <p style="font-size:12px;color:#6B6B6B;margin:0;">Automatische Owner-Diagnose. Enthält bewusst keine personenbezogenen Rohdaten.</p>
  </div></body></html>`;
}

export interface DigestTenantLine {
  tenantName: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  score: number;
  open: number;
  critical: number;
  warning: number;
  securityEvents: number;
}

export interface DigestInput {
  generatedAtIso: string;
  tenants: DigestTenantLine[];
}

export function buildDigestMail(input: DigestInput) {
  const crit = input.tenants.filter((t) => t.status === "critical").length;
  const warn = input.tenants.filter((t) => t.status === "warning").length;
  const subject = `[Habb One Diagnose] Stündlicher Systemstatus — ${crit} kritisch, ${warn} Warnung`;

  const rows = input.tenants
    .slice()
    .sort((a, b) => a.score - b.score)
    .map(
      (t) =>
        `${t.status.toUpperCase().padEnd(8)} ${String(t.score).padStart(3)}  ` +
        `${t.tenantName} — ${t.open} offen (${t.critical} krit), ${t.securityEvents} Security`,
    )
    .join("\n");

  const text = `Stündlicher Systemstatus (${input.generatedAtIso})

Mandanten: ${input.tenants.length} · kritisch: ${crit} · Warnung: ${warn}

${rows || "Keine Mandanten."}

Details: ${DASH}
`;

  const htmlRows = input.tenants
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((t) => {
      const color =
        t.status === "critical"
          ? "#DA0E15"
          : t.status === "warning"
            ? "#B45309"
            : t.status === "unknown"
              ? "#6B6B6B"
              : "#15803D";
      return `<tr>
        <td style="padding:6px 10px;"><span style="color:${color};font-weight:600;">${t.status}</span></td>
        <td style="padding:6px 10px;font-variant-numeric:tabular-nums;">${t.score}</td>
        <td style="padding:6px 10px;">${escapeHtml(t.tenantName)}</td>
        <td style="padding:6px 10px;">${t.open} (${t.critical} krit)</td>
        <td style="padding:6px 10px;">${t.securityEvents}</td>
      </tr>`;
    })
    .join("");

  const html = shell(
    "Stündlicher Systemstatus",
    `<p style="margin:0 0 12px 0;">${input.tenants.length} Mandanten · <strong style="color:#DA0E15;">${crit} kritisch</strong> · ${warn} Warnung</p>
     <table style="border-collapse:collapse;font-size:13px;width:100%;">
       <tr style="text-align:left;color:#6B6B6B;"><th style="padding:6px 10px;">Status</th><th style="padding:6px 10px;">Score</th><th style="padding:6px 10px;">Mandant</th><th style="padding:6px 10px;">Findings</th><th style="padding:6px 10px;">Security</th></tr>
       ${htmlRows}
     </table>`,
  );

  return { subject, text, html };
}

export interface ImmediateInput {
  tenantName: string;
  severity: Severity;
  category: string;
  title: string;
  message: string;
  recommendation?: string | null;
}

export function buildImmediateFindingMail(input: ImmediateInput) {
  const subject = `[Habb One Diagnose] ${input.severity.toUpperCase()}: ${input.title} (${input.tenantName})`;
  const text = `Mandant: ${input.tenantName}
Schweregrad: ${input.severity}
Kategorie: ${input.category}

${input.title}
${input.message}

Empfehlung: ${input.recommendation || "—"}

Details: ${DASH}
`;
  const html = shell(
    input.title,
    `<p style="margin:0 0 8px 0;">Mandant <strong>${escapeHtml(input.tenantName)}</strong> · Schweregrad <strong>${input.severity}</strong> · ${escapeHtml(input.category)}</p>
     <p style="margin:0 0 12px 0;">${escapeHtml(input.message)}</p>
     <p style="margin:0 0 12px 0;color:#6B6B6B;"><strong>Empfehlung:</strong> ${escapeHtml(input.recommendation || "—")}</p>`,
  );
  return { subject, text, html };
}

export interface SecurityMailInput {
  tenantName: string | null;
  severity: Severity;
  eventType: string;
  message: string;
  riskScore: number;
}

export function buildSecurityEventMail(input: SecurityMailInput) {
  const subject = `[Habb One Security] Verdächtige Aktivität: ${input.eventType} (${input.tenantName ?? "Plattform"})`;
  const text = `Security-Event
Mandant: ${input.tenantName ?? "Plattform"}
Typ: ${input.eventType}
Schweregrad: ${input.severity}
Risk-Score: ${input.riskScore}

${input.message}

Prüfen: ${DASH}
`;
  const html = shell(
    "Verdächtige Aktivität erkannt",
    `<p style="margin:0 0 8px 0;">Mandant <strong>${escapeHtml(input.tenantName ?? "Plattform")}</strong> · <strong>${escapeHtml(input.eventType)}</strong></p>
     <p style="margin:0 0 8px 0;">Schweregrad <strong>${input.severity}</strong> · Risk-Score ${input.riskScore}</p>
     <p style="margin:0 0 12px 0;">${escapeHtml(input.message)}</p>`,
  );
  return { subject, text, html };
}

export function buildManualTestMail() {
  const subject = "[Habb One Diagnose] Test-E-Mail";
  const text = `Dies ist eine manuell ausgelöste Test-E-Mail des Owner-Diagnose-Moduls.
Wenn du diese Nachricht erhältst, ist der Mailversand korrekt konfiguriert.

Dashboard: ${DASH}
`;
  const html = shell(
    "Test-E-Mail",
    `<p>Dies ist eine manuell ausgelöste Test-E-Mail des Owner-Diagnose-Moduls. Erhalt = Mailversand korrekt konfiguriert.</p>`,
  );
  return { subject, text, html };
}
