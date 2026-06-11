/**
 * Mail mit dem 6-stelligen Login-OTP. Klartext-Code lebt nur in dieser
 * Mail — in der DB liegt nur ein bcrypt-Hash.
 *
 * Vorsicht: keine Klartext-Logs des OTP. Dieser Helper wird ausschliesslich
 * von /api/auth/login-otp/request aufgerufen.
 */

export interface LoginOtpMailInput {
  recipientName: string;
  /** Klartext-OTP — geht NIRGENDS sonst hin als in diese Mail. */
  otp: string;
  /** 10. Wird im Text und Subject erwähnt damit der User Zeitdruck sieht. */
  validForMinutes: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function buildLoginOtpMail(input: LoginOtpMailInput) {
  const subject = "HABB One — Anmeldecode";

  const fromMeta =
    input.ipAddress || input.userAgent
      ? `\nGerät / IP: ${input.userAgent ?? "?"} · ${input.ipAddress ?? "?"}`
      : "";

  const text = `Guten Tag ${input.recipientName}

Sie haben gerade eine Anmeldung bei HABB One angefordert. Bitte
bestätigen Sie diese mit folgendem Code:

  ${input.otp}

Der Code ist ${input.validForMinutes} Minuten gültig.${fromMeta}

Falls Sie diese Anmeldung NICHT angefordert haben, ignorieren Sie diese
E-Mail — ohne den Code kann sich niemand bei Ihrem Konto anmelden.
Sicherheitshalber sollten Sie anschliessend Ihr Passwort zurücksetzen.

— HABB One`;

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1A1A;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">
    <p style="font-size:14px;color:#6B6B6B;">HABB One</p>
    <h1 style="font-size:22px;margin:6px 0 18px;">Anmeldecode</h1>
    <p>Guten Tag ${escapeHtml(input.recipientName)},</p>
    <p>Sie haben gerade eine Anmeldung bei HABB One angefordert. Bitte bestätigen Sie diese mit folgendem Code:</p>
    <div style="margin:24px 0;padding:18px;border:1px solid #E7E5E4;border-radius:8px;background:#FAFAF9;text-align:center;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;">Bestätigungscode</p>
      <p style="margin:0;font-family:'SF Mono',Menlo,monospace;font-size:32px;letter-spacing:0.28em;color:#0A0A0A;">${escapeHtml(input.otp)}</p>
    </div>
    <p style="font-size:13px;color:#6B6B6B;">Gültig für ${input.validForMinutes} Minuten.${
      input.ipAddress || input.userAgent
        ? ` Anfrage von <span style="font-family:'SF Mono',Menlo,monospace;">${escapeHtml(input.ipAddress ?? "?")}</span> · ${escapeHtml(input.userAgent ?? "?")}.`
        : ""
    }</p>
    <p style="font-size:13px;">Falls Sie diese Anmeldung <strong>nicht</strong> angefordert haben, ignorieren Sie diese E-Mail. Ohne den Code kann sich niemand anmelden. Sicherheitshalber sollten Sie anschliessend Ihr Passwort zurücksetzen.</p>
    <p style="font-size:12px;color:#6B6B6B;margin-top:32px;">— HABB One</p>
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
