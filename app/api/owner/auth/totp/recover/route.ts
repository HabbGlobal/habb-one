/**
 * POST /api/owner/auth/totp/recover  { code }
 *
 * Emergency access. Prerequisite: password has already been verified
 * (valid ceremony cookie, stage SIGNIN). A correct TOTP code grants NO portal
 * access; it resets webauthnEnrolledAt and forces the owner into passkey
 * enrollment. Passkey therefore remains structurally required; TOTP only
 * prevents lockout.
 *
 * Hardening: lockout after 5 failed attempts (15 min), audit + email alert on
 * every use.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import {
  COOKIE_CEREMONY,
  verifyCeremonyToken,
  signCeremonyToken,
  setCeremonyCookie,
  readRequestContext,
} from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { decryptSecret, verifyTotp } from "@/lib/owner/totp";
import { sendMail } from "@/lib/mail/send";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const jar = await cookies();
  const ceremonyToken = jar.get(COOKIE_CEREMONY)?.value;
  if (!ceremonyToken) return NextResponse.json({ error: "NO_CEREMONY" }, { status: 401 });

  let claims;
  try {
    claims = await verifyCeremonyToken(ceremonyToken);
  } catch {
    return NextResponse.json({ error: "INVALID_CEREMONY" }, { status: 401 });
  }
  if (claims.stage !== "SIGNIN") {
    return NextResponse.json({ error: "WRONG_STAGE" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const account = await prisma.ownerAccount.findUnique({
    where: { id: claims.ownerAccountId },
  });
  if (!account || !account.isActive || !account.totpSecretEnc || !account.totpEnrolledAt) {
    return NextResponse.json({ error: "RECOVERY_UNAVAILABLE" }, { status: 400 });
  }

  if (account.totpLockedUntil && account.totpLockedUntil > new Date()) {
    return NextResponse.json({ error: "LOCKED" }, { status: 423 });
  }

  const ok = verifyTotp(decryptSecret(account.totpSecretEnc), parsed.data.code);
  const { ip, ua } = await readRequestContext();

  if (!ok) {
    const attempts = account.totpFailedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.ownerAccount.update({
      where: { id: account.id },
      data: {
        totpFailedAttempts: lock ? 0 : attempts,
        totpLockedUntil: lock
          ? new Date(Date.now() + LOCK_MINUTES * 60_000)
          : account.totpLockedUntil,
      },
    });
    await prisma.ownerAuditLog.create({
      data: {
        ownerAccountId: account.id,
        ownerEmail: account.email,
        action: "OWNER_LOGIN_FAILED",
        ipAddress: ip,
        userAgent: ua,
      },
    });
    return NextResponse.json(
      { error: lock ? "LOCKED" : "CODE_INVALID" },
      { status: lock ? 423 : 401 },
    );
  }

  // Success: NO portal access. Only unlock passkey enrollment.
  await prisma.ownerAccount.update({
    where: { id: account.id },
    data: {
      totpFailedAttempts: 0,
      totpLockedUntil: null,
      webauthnEnrolledAt: null,
    },
  });

  const newToken = await signCeremonyToken({
    ownerAccountId: account.id,
    stage: "ENROLL",
    challenge: randomBytes(16).toString("base64url"),
  });
  await setCeremonyCookie(newToken);

  await ownerAudit({
    ownerAccountId: account.id,
    ownerEmail: account.email,
    action: "OWNER_2FA_RECOVERY_USED",
  });

  // Security notification (best-effort, non-blocking).
  try {
    const when = new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    const textBody =
      `Hello ${account.name}\n\n` +
      `Emergency access by authenticator code was just used for your owner account ` +
      `(${when} Swiss time, IP ${ip ?? "unknown"}).\n\n` +
      `You must now register a new passkey. ` +
      `If this was NOT you, change your password immediately and contact ` +
      `security@HABB Global (PVT) LTD.\n`;
    await sendMail({
      to: account.email,
      subject: "Security notice: emergency access (authenticator) used",
      text: textBody,
      html:
        `<p>Hello ${account.name},</p>` +
        `<p>Emergency access by <strong>authenticator code</strong> was just used ` +
        `for your owner account (${when} Swiss time, IP ${ip ?? "unknown"}).</p>` +
        `<p>You must now register a new passkey. If this was <strong>not</strong> you, ` +
        `change your password immediately and contact ` +
        `<a href="mailto:security@HABB Global (PVT) LTD">security@HABB Global (PVT) LTD</a>.</p>`,
      tag: "owner-recovery-used",
    });
  } catch {
    // Silent: the audit log entry remains the source of truth.
  }

  return NextResponse.json({ ok: true, next: "enroll" });
}
