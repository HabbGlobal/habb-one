/**
 * Mail-Templates für den Tenant-Registrierungs-Lifecycle. Fünf Mails:
 *   1. Verify-Mail (Self-Registration → User klickt Link)
 *   2. Submitted (nach Verify: "wir prüfen deine Anfrage")
 *   3. Approved (Owner hat freigegeben)
 *   4. Rejected (Owner hat abgelehnt mit Grund)
 *   5. Owner-Notification (intern: neue Anfrage wartet auf Freigabe)
 *
 * Bewusst minimal HTML/Text, kein Templating-Framework — solange wir
 * nur diese fünf haben, lohnt das Setup nicht.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="de">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;letter-spacing:-0.02em;">
      habb<span style="color:#DA0E15">.ch</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:24px 0 12px 0;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:24px 0;" />
    <p style="font-size:12px;color:#6B6B6B;line-height:1.55;margin:0;">
      Bei Fragen: <a href="mailto:support@habb.ch" style="color:#1A1A1A;">support@habb.ch</a>.
      Verdacht auf Missbrauch: <a href="mailto:security@habb.ch" style="color:#1A1A1A;">security@habb.ch</a>.
    </p>
  </div>
</body>
</html>`;
}

// ─── 1. Verify-Mail ───────────────────────────────────────────────────

export interface VerifyMailInput {
  recipientName: string;
  companyName: string;
  verifyUrl: string;
  expiresAt: Date;
}

export function buildEmailVerificationMail(input: VerifyMailInput) {
  const expires = input.expiresAt.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = "Bitte E-Mail-Adresse bestätigen — HABB One";

  const text = `Guten Tag ${input.recipientName}

Vielen Dank für die Registrierung von "${input.companyName}" bei HABB One.

Bitte bestätigen Sie Ihre E-Mail-Adresse durch Klick auf folgenden Link:
${input.verifyUrl}

Der Link ist bis ${expires} (Schweizer Zeit) gültig.

Nach der Bestätigung prüft das habb.ch Team Ihre Anfrage und gibt Ihren
Zugang frei. Sie erhalten dann eine weitere E-Mail.

Haben Sie sich NICHT registriert? Tun Sie nichts — der Link läuft ab.
`.trim();

  const html = shell(
    "E-Mail bestätigen",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Guten Tag <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Vielen Dank für die Registrierung von <strong>${escapeHtml(input.companyName)}</strong> bei HABB One.
      Bitte bestätigen Sie Ihre E-Mail-Adresse:
    </p>
    <p style="margin:28px 0;">
      <a href="${input.verifyUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        E-Mail bestätigen
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 8px 0;">
      Gültig bis ${escapeHtml(expires)} (Schweizer Zeit).
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 16px 0;">
      Nach der Bestätigung prüft das habb.ch Team Ihre Anfrage und gibt Ihren
      Zugang frei. Sie erhalten dann eine weitere Nachricht.
    </p>
  `,
  );

  return { subject, text, html };
}

// ─── 2. Submitted (nach Verify) ───────────────────────────────────────

export interface SubmittedMailInput {
  recipientName: string;
  companyName: string;
}

export function buildRegistrationSubmittedMail(input: SubmittedMailInput) {
  const subject = "Registrierung eingegangen — HABB One";
  const text = `Guten Tag ${input.recipientName}

Wir haben Ihre Registrierung für "${input.companyName}" erhalten und prüfen
sie nun manuell. Sobald Ihr Zugang freigegeben ist, melden wir uns per
E-Mail.

In der Zwischenzeit können Sie sich bei HABB One anmelden und Ihr Firmen-
Profil bearbeiten. Alle anderen Funktionen sind erst nach der Freigabe
zugänglich.

Freundliche Grüsse
Ihr habb.ch Team
`.trim();

  const html = shell(
    "Registrierung eingegangen",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Guten Tag <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Wir haben Ihre Registrierung für <strong>${escapeHtml(input.companyName)}</strong>
      erhalten und prüfen sie nun manuell. Sobald Ihr Zugang freigegeben ist,
      melden wir uns per E-Mail.
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      In der Zwischenzeit können Sie sich bei HABB One anmelden und Ihr Firmen-
      Profil bearbeiten. Alle anderen Funktionen sind erst nach der Freigabe
      zugänglich.
    </p>
  `,
  );

  return { subject, text, html };
}

// ─── 3. Approved ──────────────────────────────────────────────────────

export interface ApprovedMailInput {
  recipientName: string;
  companyName: string;
  loginUrl: string;
}

export function buildRegistrationApprovedMail(input: ApprovedMailInput) {
  const subject = "Ihr HABB One-Zugang ist freigegeben";
  const text = `Guten Tag ${input.recipientName}

Schön, dass Sie dabei sind: Ihr HABB One-Zugang für "${input.companyName}"
ist soeben freigegeben worden. Sie können sich ab sofort anmelden und
HABB One vollständig nutzen.

Anmeldung: ${input.loginUrl}

Freundliche Grüsse
Ihr habb.ch Team
`.trim();

  const html = shell(
    "Zugang freigegeben",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Guten Tag <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Schön, dass Sie dabei sind: Ihr HABB One-Zugang für
      <strong>${escapeHtml(input.companyName)}</strong> ist soeben freigegeben
      worden. Sie können sich ab sofort anmelden und HABB One vollständig nutzen.
    </p>
    <p style="margin:28px 0;">
      <a href="${input.loginUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Jetzt anmelden
      </a>
    </p>
  `,
  );

  return { subject, text, html };
}

// ─── 4. Rejected ──────────────────────────────────────────────────────

export interface RejectedMailInput {
  recipientName: string;
  companyName: string;
  reason: string;
}

export function buildRegistrationRejectedMail(input: RejectedMailInput) {
  const subject = "Ihre HABB One-Registrierung wurde abgelehnt";
  const text = `Guten Tag ${input.recipientName}

Leider können wir Ihre Registrierung für "${input.companyName}" nicht
freigeben.

Begründung: ${input.reason}

Bei Rückfragen wenden Sie sich gerne an support@habb.ch.

Freundliche Grüsse
Ihr habb.ch Team
`.trim();

  const html = shell(
    "Registrierung abgelehnt",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Guten Tag <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 12px 0;">
      Leider können wir Ihre Registrierung für
      <strong>${escapeHtml(input.companyName)}</strong> nicht freigeben.
    </p>
    <p style="line-height:1.55;margin:0 0 12px 0;">
      <strong>Begründung:</strong> ${escapeHtml(input.reason)}
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Bei Rückfragen: <a href="mailto:support@habb.ch" style="color:#1A1A1A;">support@habb.ch</a>.
    </p>
  `,
  );

  return { subject, text, html };
}

// ─── 5. Owner-Notification (intern) ───────────────────────────────────

export interface OwnerNewRegistrationMailInput {
  companyName: string;
  applicantName: string;
  applicantEmail: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  /** Absolute URL zur Registrierungs-Liste im Owner-Portal. */
  reviewUrl: string;
}

/**
 * Interne Mail an den Owner: eine neue Registrierung hat die E-Mail-
 * Verifizierung bestanden und wartet jetzt auf Freigabe/Ablehnung.
 * Bewusst sachlich (kein Marketing-Ton) — das ist eine Ops-Mail.
 */
export function buildOwnerNewRegistrationMail(input: OwnerNewRegistrationMailInput) {
  const subject = `Neue Registrierung wartet auf Freigabe: ${input.companyName}`;
  const locationLine = [input.city, input.country].filter(Boolean).join(", ") || "—";

  const text = `Neue Mandanten-Registrierung — E-Mail bestätigt, wartet auf Freigabe.

Firma:       ${input.companyName}
Antragsteller: ${input.applicantName} <${input.applicantEmail}>
Telefon:     ${input.phone || "—"}
Standort:    ${locationLine}

Prüfen + freigeben/ablehnen:
${input.reviewUrl}

Diese Mail wurde automatisch ausgelöst, sobald die Registrierung den
Status PENDING_APPROVAL erreicht hat.
`.trim();

  const html = shell(
    "Neue Registrierung wartet auf Freigabe",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Eine neue Mandanten-Registrierung hat die E-Mail-Verifizierung
      bestanden und wartet jetzt im Owner-Portal auf Freigabe oder Ablehnung.
    </p>
    <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;margin:0 0 20px 0;">
      <tr><td style="color:#6B6B6B;padding-right:16px;">Firma</td><td><strong>${escapeHtml(input.companyName)}</strong></td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Antragsteller</td><td>${escapeHtml(input.applicantName)} &lt;${escapeHtml(input.applicantEmail)}&gt;</td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Telefon</td><td>${escapeHtml(input.phone || "—")}</td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Standort</td><td>${escapeHtml(locationLine)}</td></tr>
    </table>
    <p style="margin:24px 0;">
      <a href="${input.reviewUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Im Owner-Portal prüfen
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0;">
      Automatisch ausgelöst beim Übergang auf PENDING_APPROVAL.
    </p>
  `,
  );

  return { subject, text, html };
}
