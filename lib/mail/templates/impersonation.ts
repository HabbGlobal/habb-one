/**
 * Consent OTP email for Owner impersonation. The tenant user receives the
 * plaintext code only here and is the only person who can pass it securely to
 * the owner.
 *
 * Plain templates like the other emails; no react-email dependency.
 */

export interface ImpersonationConsentMailInput {
  recipientName: string;
  /** Display name of the owner who made the request. */
  ownerName: string;
  /** For example, "HABB Global (PVT) LTD Support". */
  ownerLabel: string;
  /** Plaintext OTP. It is sent nowhere except this email. */
  otp: string;
  /** Owner's reason, required by the console. */
  reason: string;
  /** Optional ticket reference. */
  ticketRef?: string | null;
  /** "READONLY" allows reads only; "FULL" also permits changes. */
  scope: "READONLY" | "FULL";
  /** Maximum session duration. */
  durationMinutes: number;
  /** When the OTP expires, 15 minutes after the request. */
  expiresAt: Date;
  companyName: string;
}

export function buildImpersonationConsentMail(input: ImpersonationConsentMailInput) {
  const expires = input.expiresAt.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const scopeLabel =
    input.scope === "READONLY" ? "Read-only access" : "Full access (including changes)";
  const subject = `Support access to ${input.companyName} — confirmation code`;

  const text = `Hello ${input.recipientName}

${input.ownerLabel} (${input.ownerName}) is requesting permission to temporarily
sign in to your HABB One account for a support case.

  Confirmation code:  ${input.otp}
  Access level:       ${scopeLabel}
  Maximum duration:   ${input.durationMinutes} minutes
  Valid until:        ${expires} (Swiss time)

Reason: ${input.reason}${input.ticketRef ? `\nTicket: ${input.ticketRef}` : ""}

How it works:
  1. ${input.ownerName} calls or messages you.
  2. Give the code only to this person and only when you are certain that you
     are speaking with ${input.ownerLabel}.
  3. ${input.ownerName} enters the code in the HABB Global (PVT) LTD console,
     which starts the session. A support-active banner remains visible in your app.
  4. Every action is audited, and the session ends automatically after
     ${input.durationMinutes} minutes.

Do not want to approve? Do nothing. The code expires automatically.

If anything seems suspicious, reply to this email or contact ${input.ownerLabel}
directly. Do not use a phone number provided by a potential caller.

Thank you for your trust
${input.ownerLabel}`;

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1A1A;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">
    <p style="font-size:14px;color:#6B6B6B;">${input.ownerLabel}</p>
    <h1 style="font-size:22px;margin:6px 0 18px;">Support access to ${escapeHtml(input.companyName)}</h1>
    <p>Hello ${escapeHtml(input.recipientName)},</p>
    <p><strong>${escapeHtml(input.ownerName)}</strong> is requesting permission to temporarily sign in to your HABB One account for a support case.</p>
    <div style="margin:24px 0;padding:18px;border:1px solid #E7E5E4;border-radius:8px;background:#FAFAF9;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;">Confirmation code</p>
      <p style="margin:0;font-family:'SF Mono',Menlo,monospace;font-size:28px;letter-spacing:0.18em;color:#0A0A0A;">${escapeHtml(input.otp)}</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 18px;">
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Access level</td><td>${escapeHtml(scopeLabel)}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Maximum duration</td><td>${input.durationMinutes} minutes</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Valid until</td><td>${escapeHtml(expires)} (Swiss time)</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;vertical-align:top;">Reason</td><td>${escapeHtml(input.reason)}</td></tr>
      ${input.ticketRef ? `<tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Ticket</td><td>${escapeHtml(input.ticketRef)}</td></tr>` : ""}
    </table>
    <p style="font-size:13px;">Give the code <strong>only to ${escapeHtml(input.ownerName)}</strong> and only when you are certain that you are speaking with ${escapeHtml(input.ownerLabel)}. Do not enter it into an unfamiliar form.</p>
    <p style="font-size:13px;color:#6B6B6B;">A support-active banner remains visible in your app during the session. Every action is audited, and the session ends automatically after ${input.durationMinutes} minutes.</p>
    <p style="font-size:12px;color:#6B6B6B;margin-top:32px;">Do not want to approve? Do nothing. The code expires automatically.</p>
  </body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
