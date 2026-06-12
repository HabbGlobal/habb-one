/**
 * Consent-OTP-Mail für Owner-Impersonation. Der Tenant-User erhält den
 * Klartext-Code (nur hier!) und ist die einzige Person, die ihn an den
 * Owner weiterreichen kann — verbal, sicher.
 *
 * Plain-Templates wie bei den anderen Mails (kein react-email).
 */

export interface ImpersonationConsentMailInput {
  recipientName: string;
  /** Anzeigename des Owners, der die Anfrage gestellt hat. */
  ownerName: string;
  /** "HABB Global (PVT) LTD Support" o.ä. */
  ownerLabel: string;
  /** Klartext-OTP — geht NIRGENDS sonst hin als in diese Mail. */
  otp: string;
  /** Begründung des Owners (Pflicht-Eingabe in der Konsole). */
  reason: string;
  /** Optionaler Ticket-Reference-String. */
  ticketRef?: string | null;
  /** "READONLY" → nur Lesen, "FULL" → auch Schreibrechte. */
  scope: "READONLY" | "FULL";
  /** Wie lange die Sitzung maximal läuft. */
  durationMinutes: number;
  /** Wann der OTP selbst abläuft (15 Min nach Anfrage). */
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
    input.scope === "READONLY" ? "Nur Lesezugriff" : "Vollzugriff (inkl. Änderungen)";
  const subject = `Support-Zugriff auf ${input.companyName} — Bestätigungscode`;

  const text = `Guten Tag ${input.recipientName}

${input.ownerLabel} (${input.ownerName}) bittet um Erlaubnis, sich für einen
Support-Fall vorübergehend mit Ihrem HABB One-Konto anzumelden.

  Bestätigungscode:   ${input.otp}
  Berechtigung:       ${scopeLabel}
  Maximale Dauer:     ${input.durationMinutes} Minuten
  Gültig bis:         ${expires} (Schweizer Zeit)

Begründung: ${input.reason}${input.ticketRef ? `\nTicket: ${input.ticketRef}` : ""}

So funktioniert es:
  1. ${input.ownerName} ruft Sie an oder schreibt Ihnen.
  2. Geben Sie den Code NUR DIESER Person und NUR dann durch, wenn Sie sicher
     sind, dass Sie wirklich mit ${input.ownerLabel} sprechen.
  3. ${input.ownerName} tippt den Code in der HABB Global (PVT) LTD-Konsole ein, danach
     beginnt die Sitzung. Sie sehen während der Sitzung selbst einen
     "Support unterstützt gerade"-Banner in der App.
  4. Jede Aktion wird protokolliert; nach ${input.durationMinutes} Minuten
     beendet sich die Sitzung automatisch.

Sie wollen NICHT zustimmen? Tun Sie nichts. Der Code läuft automatisch ab.

Wenn Ihnen etwas verdächtig vorkommt, antworten Sie auf diese E-Mail oder
melden Sie sich direkt bei ${input.ownerLabel} — verwenden Sie dabei NICHT
die Nummer, die ein eventueller Anrufer Ihnen mitgeteilt hat.

Vielen Dank für Ihr Vertrauen
${input.ownerLabel}`;

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1A1A;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">
    <p style="font-size:14px;color:#6B6B6B;">${input.ownerLabel}</p>
    <h1 style="font-size:22px;margin:6px 0 18px;">Support-Zugriff auf ${escapeHtml(input.companyName)}</h1>
    <p>Guten Tag ${escapeHtml(input.recipientName)},</p>
    <p><strong>${escapeHtml(input.ownerName)}</strong> bittet um Erlaubnis, sich für einen Support-Fall vorübergehend mit Ihrem HABB One-Konto anzumelden.</p>
    <div style="margin:24px 0;padding:18px;border:1px solid #E7E5E4;border-radius:8px;background:#FAFAF9;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;">Bestätigungscode</p>
      <p style="margin:0;font-family:'SF Mono',Menlo,monospace;font-size:28px;letter-spacing:0.18em;color:#0A0A0A;">${escapeHtml(input.otp)}</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 18px;">
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Berechtigung</td><td>${escapeHtml(scopeLabel)}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Maximale Dauer</td><td>${input.durationMinutes} Minuten</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Gültig bis</td><td>${escapeHtml(expires)} (Schweizer Zeit)</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;vertical-align:top;">Begründung</td><td>${escapeHtml(input.reason)}</td></tr>
      ${input.ticketRef ? `<tr><td style="padding:3px 12px 3px 0;color:#6B6B6B;">Ticket</td><td>${escapeHtml(input.ticketRef)}</td></tr>` : ""}
    </table>
    <p style="font-size:13px;">Geben Sie den Code <strong>nur ${escapeHtml(input.ownerName)}</strong> und nur dann, wenn Sie sicher sind, mit ${escapeHtml(input.ownerLabel)} zu sprechen. Tippen Sie ihn nicht in fremde Formulare ein.</p>
    <p style="font-size:13px;color:#6B6B6B;">Während der Sitzung sehen Sie selbst einen «Support unterstützt gerade»-Banner in der App. Jede Aktion wird protokolliert; nach ${input.durationMinutes} Minuten beendet sich die Sitzung automatisch.</p>
    <p style="font-size:12px;color:#6B6B6B;margin-top:32px;">Sie wollen nicht zustimmen? Tun Sie nichts — der Code läuft automatisch ab.</p>
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
