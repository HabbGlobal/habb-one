/**
 * POST /api/owner/auth/totp/recover  { code }
 *
 * NOTFALL-Zugang. Voraussetzung: Passwort wurde bereits verifiziert
 * (gültiger Ceremony-Cookie, stage SIGNIN). Ein korrekter TOTP-Code
 * gewährt KEINEN Portalzugang — er setzt webauthnEnrolledAt zurück und
 * leitet den Owner zwingend in den Passkey-Enroll. Damit bleibt der
 * Passkey strukturell Pflicht; TOTP verhindert nur das Aussperren.
 *
 * Härtung: Lockout nach 5 Fehlversuchen (15 Min), Audit + E-Mail-Alarm
 * bei jeder Nutzung.
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

  // Erfolg: KEIN Portalzugang. Nur Passkey-Enroll freischalten.
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

  // Sicherheits-Benachrichtigung (best-effort, nicht-blockend).
  try {
    const when = new Intl.DateTimeFormat("de-CH", {
      timeZone: "Europe/Zurich",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    const textBody =
      `Hallo ${account.name}\n\n` +
      `Soeben wurde für deinen Owner-Account der Notfall-Zugang per ` +
      `Authenticator-Code genutzt (${when} Schweizer Zeit, IP ${ip ?? "unbekannt"}).\n\n` +
      `Es ist jetzt die Registrierung eines neuen Passkeys erforderlich. ` +
      `Warst du das NICHT, ändere sofort dein Passwort und melde dich bei ` +
      `security@habb.ch.\n`;
    await sendMail({
      to: account.email,
      subject: "Sicherheitshinweis: Notfall-Zugang (Authenticator) verwendet",
      text: textBody,
      html:
        `<p>Hallo ${account.name},</p>` +
        `<p>Soeben wurde für deinen Owner-Account der <strong>Notfall-Zugang per ` +
        `Authenticator-Code</strong> genutzt (${when} Schweizer Zeit, IP ` +
        `${ip ?? "unbekannt"}).</p>` +
        `<p>Es ist jetzt die Registrierung eines neuen Passkeys erforderlich. ` +
        `Warst du das <strong>nicht</strong>, ändere sofort dein Passwort und ` +
        `melde dich bei <a href="mailto:security@habb.ch">security@habb.ch</a>.</p>`,
      tag: "owner-recovery-used",
    });
  } catch {
    // schweigend — der Audit-Log-Eintrag bleibt die Quelle der Wahrheit
  }

  return NextResponse.json({ ok: true, next: "enroll" });
}
