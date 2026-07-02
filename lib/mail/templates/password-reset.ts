/**
 * Plain templates for the password reset email. We intentionally avoid
 * react-email because one template does not justify the setup. Reconsider when
 * a second or third template is added.
 *
 * The plaintext token is part of the URL and is consumed immediately when the
 * recipient opens the link.
 */

export interface PasswordResetMailInput {
  recipientName: string;
  resetUrl: string;
  expiresAt: Date;
  /** Full name of the owner who initiated the reset. */
  initiatedByName: string;
  /** For example, "HABB Global (PVT) LTD Support". */
  initiatedByLabel: string;
}

export function buildPasswordResetMail(input: PasswordResetMailInput) {
  const expires = input.expiresAt.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const subject = "Reset your password — HABB One";

  const text = `Hello ${input.recipientName}

${input.initiatedByLabel} (${input.initiatedByName}) has requested a password reset
for your HABB One account. Please click the link below to
set a new password:

${input.resetUrl}

The link is valid until ${expires} and can only be used once.

If you did NOT request this reset, do nothing — the link will expire
automatically. If you suspect abuse, please contact
security@habbglobal.com.

Best regards
Your HABB One Team
`.trim();

  const html = `<!doctype html>
<html lang="en">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#FAFAF9;margin:0;padding:0;color:#1A1A1A;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:600;font-size:18px;letter-spacing:-0.02em;">
      HABB<span style="color:#DA0E15"> One</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:24px 0 12px 0;">Reset password</h1>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      Hello <strong>${escapeHtml(input.recipientName)}</strong>,
    </p>
    <p style="line-height:1.55;margin:0 0 16px 0;">
      ${escapeHtml(input.initiatedByLabel)} (${escapeHtml(input.initiatedByName)}) has requested a
      password reset for your HABB One account. Click below to
      set a new password.
    </p>
    <p style="margin:28px 0;">
      <a href="${input.resetUrl}"
         style="display:inline-block;background:#0A0A0A;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:500;">
        Set new password
      </a>
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 8px 0;">
      The link is valid until <strong>${escapeHtml(expires)}</strong> and
      can only be used once.
    </p>
    <p style="font-size:13px;color:#6B6B6B;line-height:1.55;margin:0 0 16px 0;">
      Button not working? Copy this URL into your browser:<br/>
      <code style="word-break:break-all;color:#1A1A1A;">${escapeHtml(input.resetUrl)}</code>
    </p>
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:24px 0;" />
    <p style="font-size:12px;color:#6B6B6B;line-height:1.55;margin:0;">
      If you did NOT request this reset, do nothing — the link will expire
      automatically. If you suspect abuse, please contact
      <a href="mailto:security@habbglobal.com" style="color:#1A1A1A;">security@habbglobal.com</a>.
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
