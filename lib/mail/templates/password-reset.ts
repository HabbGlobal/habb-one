/**
 * Plain-Templates für die Passwort-Reset-Mail. Bewusst KEIN react-email —
 * eine einzige Mail rechtfertigt das Setup nicht. Beim zweiten oder dritten
 * Template wechseln wir.
 *
 * Wichtig: Klartext-Token ist Bestandteil der URL — wir verbrauchen ihn
 * sofort wenn der Empfänger den Link klickt.
 */

export interface PasswordResetMailInput {
  recipientName: string;
  resetUrl: string;
  expiresAt: Date;
  /** Vor- und Nachname des Owners, der den Reset ausgelöst hat. */
  initiatedByName: string;
  /** "habb.ch Support" o.ä. */
  initiatedByLabel: string;
}

export function buildPasswordResetMail(input: PasswordResetMailInput) {
  const expires = input.expiresAt.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = "Passwort zurücksetzen — HABB One";

  const text = `Guten Tag ${input.recipientName}

${input.initiatedByLabel} (${input.initiatedByName}) hat einen Passwort-Reset
für Ihren HABB One-Account ausgelöst. Bitte klicken Sie folgenden Link, um
ein neues Passwort zu setzen:

${input.resetUrl}

Der Link ist bis ${expires} (Schweizer Zeit) gültig und kann nur ein einziges
Mal verwendet werden.

Haben Sie diesen Reset NICHT angefordert? Tun Sie nichts — der Link läuft
automatisch ab. Bei Verdacht auf Missbrauch melden Sie sich unter
security@habb.ch.

Freundliche Grüsse
Ihr habb.ch Team
`.trim();

  const html = `<!doctype html>
<html lang="de">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;letter-spacing:-0.02em;">
      habb<span style="color:#DA0E15">.ch</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:24px 0 12px 0;">Passwort zurücksetzen</h1>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Guten Tag <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      ${escapeHtml(input.initiatedByLabel)} (${escapeHtml(input.initiatedByName)}) hat einen
      Passwort-Reset für Ihren HABB One-Account ausgelöst. Klicken Sie unten, um
      ein neues Passwort zu setzen.
    </p>
    <p style="margin:28px 0;">
      <a href="${input.resetUrl}"
         style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Neues Passwort setzen
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 8px 0;">
      Der Link ist bis <strong>${escapeHtml(expires)} (Schweizer Zeit)</strong> gültig und
      kann nur ein einziges Mal verwendet werden.
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 16px 0;">
      Funktioniert der Button nicht? Kopieren Sie diese URL in Ihren Browser:<br/>
      <code style="word-break:break-all;color:#1A1A1A;">${escapeHtml(input.resetUrl)}</code>
    </p>
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:24px 0;" />
    <p style="font-size:12px;color:#6B6B6B;line-height:1.55;margin:0;">
      Haben Sie diesen Reset NICHT angefordert? Tun Sie nichts — der Link läuft
      automatisch ab. Bei Verdacht auf Missbrauch melden Sie sich unter
      <a href="mailto:security@habb.ch" style="color:#1A1A1A;">security@habb.ch</a>.
    </p>
  </div>
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
