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
<html lang="en">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;letter-spacing:-0.02em;">
      HABB<span style="color:#DA0E15"> One</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:24px 0 12px 0;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:24px 0;" />
    <p style="font-size:12px;color:#6B6B6B;line-height:1.55;margin:0;">
      For questions: <a href="mailto:support@habbglobal.com" style="color:#1A1A1A;">support@habbglobal.com</a>.
      Suspected abuse: <a href="mailto:security@habbglobal.com" style="color:#1A1A1A;">security@habbglobal.com</a>.
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
  const expires = input.expiresAt.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = "Please verify your email address — HABB One";

  const text = `Hello ${input.recipientName}

Thank you for registering "${input.companyName}" with HABB One.

Please confirm your email address by clicking the following link:
${input.verifyUrl}

The link is valid until ${expires} (UTC).

After confirmation, the HABB One team will review your request and activate
your access. You will receive another email once this is done.

Did you NOT register? Do nothing — the link will expire.
`.trim();

  const html = shell(
    "Verify email",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Hello <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Thank you for registering <strong>${escapeHtml(input.companyName)}</strong> with HABB One.
      Please verify your email address:
    </p>
    <p style="margin:28px 0;">
      <a href="${input.verifyUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Verify email
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 8px 0;">
      Valid until ${escapeHtml(expires)} (UTC).
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 16px 0;">
      After confirmation, the HABB One team will review your request and activate
      your access. You will receive another message once this is done.
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
  const subject = "Registration received — HABB One";
  const text = `Hello ${input.recipientName}

We have received your registration for "${input.companyName}" and are currently
reviewing it manually. Once your access is activated, we will notify you by
email.

In the meantime, you can log in to HABB One and edit your company profile.
All other features will be accessible after activation.

Best regards
Your HABB One Team
`.trim();

  const html = shell(
    "Registration received",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Hello <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      We have received your registration for <strong>${escapeHtml(input.companyName)}</strong>
      and are currently reviewing it manually. Once your access is activated,
      we will notify you by email.
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      In the meantime, you can log in to HABB One and edit your company profile.
      All other features will be accessible after activation.
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
  const subject = "Your HABB One access is activated";
  const text = `Hello ${input.recipientName}

Welcome aboard: Your HABB One access for "${input.companyName}"
has just been activated. You can now log in and
use HABB One fully.

Login: ${input.loginUrl}

Best regards
Your HABB One Team
`.trim();

  const html = shell(
    "Access activated",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Hello <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Welcome aboard: Your HABB One access for
      <strong>${escapeHtml(input.companyName)}</strong> has just been activated.
      You can now log in and use HABB One fully.
    </p>
    <p style="margin:28px 0;">
      <a href="${input.loginUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Log in now
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
  const subject = "Your HABB One registration was rejected";
  const text = `Hello ${input.recipientName}

Unfortunately, we cannot activate your registration for "${input.companyName}".

Reason: ${input.reason}

If you have any questions, please contact support@habbglobal.com.

Best regards
Your HABB One Team
`.trim();

  const html = shell(
    "Registration rejected",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Hello <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 12px 0;">
      Unfortunately, we cannot activate your registration for
      <strong>${escapeHtml(input.companyName)}</strong>.
    </p>
    <p style="line-height:1.55;margin:0 0 12px 0;">
      <strong>Reason:</strong> ${escapeHtml(input.reason)}
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      For questions: <a href="mailto:support@habbglobal.com" style="color:#1A1A1A;">support@habbglobal.com</a>.
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
  const subject = `New registration waiting for approval: ${input.companyName}`;
  const locationLine = [input.city, input.country].filter(Boolean).join(", ") || "—";

  const text = `New Tenant Registration — Email verified, waiting for approval.

Company:       ${input.companyName}
Applicant:     ${input.applicantName} <${input.applicantEmail}>
Phone:         ${input.phone || "—"}
Location:      ${locationLine}

Review + approve/reject:
${input.reviewUrl}

This email was automatically triggered when the registration reached
PENDING_APPROVAL status.
`.trim();

  const html = shell(
    "New registration waiting for approval",
    `
    <p style="line-height:1.55;margin:0 0 16px 0;">
      A new tenant registration has passed email verification
      and is now waiting in the Owner Portal for approval or rejection.
    </p>
    <table cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;margin:0 0 20px 0;">
      <tr><td style="color:#6B6B6B;padding-right:16px;">Company</td><td><strong>${escapeHtml(input.companyName)}</strong></td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Applicant</td><td>${escapeHtml(input.applicantName)} &lt;${escapeHtml(input.applicantEmail)}&gt;</td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Phone</td><td>${escapeHtml(input.phone || "—")}</td></tr>
      <tr><td style="color:#6B6B6B;padding-right:16px;">Location</td><td>${escapeHtml(locationLine)}</td></tr>
    </table>
    <p style="margin:24px 0;">
      <a href="${input.reviewUrl}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Review in Owner Portal
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0;">
      Automatically triggered on transition to PENDING_APPROVAL.
    </p>
  `,
  );

  return { subject, text, html };
}
