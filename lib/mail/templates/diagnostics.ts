/**
 * Email templates for Owner diagnostics. Pure (no I/O) and unit-testable.
 *
 * Strictly no PII or raw data: no IP addresses, user agents, tokens, secrets,
 * session IDs, or customer data. Only aggregated counts, categories,
 * severities, tenant names, and recommendations.
 */

import type { Severity } from "@/lib/diagnostics/types";

const APP_URL = process.env.NEXTAUTH_URL || "https://one.HABB Global (PVT) LTD";
const DASH = `${APP_URL}/owner/diagnostics`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;">HABB <span style="color:#DA0E15">One</span> · Diagnostics</div>
    <h1 style="font-size:20px;font-weight:600;margin:20px 0 12px 0;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0;"><a href="${DASH}" style="display:inline-block;background:#0A0A0A;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:500;">Open Owner Dashboard</a></p>
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:20px 0;" />
    <p style="font-size:12px;color:#6B6B6B;margin:0;">Automated Owner diagnostics. This email intentionally contains no personal raw data.</p>
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
  const subject = `[Habb One Diagnostics] Hourly system status — ${crit} critical, ${warn} warning`;

  const rows = input.tenants
    .slice()
    .sort((a, b) => a.score - b.score)
    .map(
      (t) =>
        `${t.status.toUpperCase().padEnd(8)} ${String(t.score).padStart(3)}  ` +
        `${t.tenantName} — ${t.open} open (${t.critical} critical), ${t.securityEvents} security`,
    )
    .join("\n");

  const text = `Hourly system status (${input.generatedAtIso})

Tenants: ${input.tenants.length} · critical: ${crit} · warnings: ${warn}

${rows || "No tenants."}

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
        <td style="padding:6px 10px;">${t.open} (${t.critical} critical)</td>
        <td style="padding:6px 10px;">${t.securityEvents}</td>
      </tr>`;
    })
    .join("");

  const html = shell(
    "Hourly system status",
    `<p style="margin:0 0 12px 0;">${input.tenants.length} tenants · <strong style="color:#DA0E15;">${crit} critical</strong> · ${warn} warnings</p>
     <table style="border-collapse:collapse;font-size:13px;width:100%;">
       <tr style="text-align:left;color:#6B6B6B;"><th style="padding:6px 10px;">Status</th><th style="padding:6px 10px;">Score</th><th style="padding:6px 10px;">Tenant</th><th style="padding:6px 10px;">Findings</th><th style="padding:6px 10px;">Security</th></tr>
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
  const subject = `[Habb One Diagnostics] ${input.severity.toUpperCase()}: ${input.title} (${input.tenantName})`;
  const text = `Tenant: ${input.tenantName}
Severity: ${input.severity}
Category: ${input.category}

${input.title}
${input.message}

Recommendation: ${input.recommendation || "—"}

Details: ${DASH}
`;
  const html = shell(
    input.title,
    `<p style="margin:0 0 8px 0;">Tenant <strong>${escapeHtml(input.tenantName)}</strong> · Severity <strong>${input.severity}</strong> · ${escapeHtml(input.category)}</p>
     <p style="margin:0 0 12px 0;">${escapeHtml(input.message)}</p>
     <p style="margin:0 0 12px 0;color:#6B6B6B;"><strong>Recommendation:</strong> ${escapeHtml(input.recommendation || "—")}</p>`,
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
  const subject = `[Habb One Security] Suspicious activity: ${input.eventType} (${input.tenantName ?? "Platform"})`;
  const text = `Security-Event
Tenant: ${input.tenantName ?? "Platform"}
Type: ${input.eventType}
Severity: ${input.severity}
Risk score: ${input.riskScore}

${input.message}

Review: ${DASH}
`;
  const html = shell(
    "Suspicious activity detected",
    `<p style="margin:0 0 8px 0;">Tenant <strong>${escapeHtml(input.tenantName ?? "Platform")}</strong> · <strong>${escapeHtml(input.eventType)}</strong></p>
     <p style="margin:0 0 8px 0;">Severity <strong>${input.severity}</strong> · Risk score ${input.riskScore}</p>
     <p style="margin:0 0 12px 0;">${escapeHtml(input.message)}</p>`,
  );
  return { subject, text, html };
}

export function buildManualTestMail() {
  const subject = "[Habb One Diagnostics] Test email";
  const text = `This is a manually triggered test email from the Owner diagnostics module.
If you receive this message, email delivery is configured correctly.

Dashboard: ${DASH}
`;
  const html = shell(
    "Test email",
    `<p>This is a manually triggered test email from the Owner diagnostics module. Receiving it confirms that email delivery is configured correctly.</p>`,
  );
  return { subject, text, html };
}
