/**
 * POST /api/auth/login-otp/request
 *
 * Stufe 1 der Login-2FA: User schickt email+password, wir validieren
 * Credentials + Account-Lifecycle. Bei Erfolg:
 *   - KIOSK_OPERATOR → { next: "DIRECT" } (kein OTP nötig; Frontend
 *     ruft direkt signIn mit Passwort, NextAuth lässt diese Rolle ohne
 *     OTP-Token durch — siehe lib/auth.ts authorize()).
 *   - Alle anderen Rollen → OTP generieren, Mail senden, LoginOtpToken-ID
 *     zurückgeben. Frontend zeigt OTP-Input, Stufe 2 ist signIn mit
 *     { otpToken, otp }.
 *
 * Antwortet bewusst generisch wenn Credentials falsch sind — kein
 * Account-Enumeration via Fehlertyp.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createLoginOtp, maskEmail } from "@/lib/auth/login-otp";
import { buildLoginOtpMail } from "@/lib/mail/templates/login-otp";
import { sendMail } from "@/lib/mail/send";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// Constant-time bcrypt dummy hash gegen User-Enumeration via Timing.
const DUMMY_HASH = "$2a$10$DUMMYDUMMYDUMMYDUMMYDU.fakefakefakefakefakefakefakefakefakefaa";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      company: { select: { suspendedAt: true, registrationStatus: true } },
    },
  });

  // Konstant-Zeit Bcrypt — auch wenn der User nicht existiert.
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await bcrypt.compare(password, hashToCheck);

  // Lifecycle-Checks identisch zu authorize() in lib/auth.ts.
  const accountUsable =
    !!user &&
    user.isActive &&
    !user.lockedAt &&
    !user.deletedAt &&
    !!user.emailVerifiedAt &&
    !user.company.suspendedAt &&
    user.company.registrationStatus !== "REJECTED" &&
    user.company.registrationStatus !== "PENDING_EMAIL_VERIFICATION";

  if (!user || !passwordOk || !accountUsable) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  // KIOSK_OPERATOR überspringt OTP — Werkstatt-Tablet hat keinen Mail-
  // Zugriff, der Login dort läuft über die Kiosk-PIN für Mitarbeitende.
  if (user.role === "KIOSK_OPERATOR") {
    return NextResponse.json({ next: "DIRECT" });
  }

  // OTP erzeugen + Mail senden.
  const h = await headers();
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent");

  const otpResult = await createLoginOtp({
    userId: user.id,
    ipAddress,
    userAgent,
  });

  const mail = buildLoginOtpMail({
    recipientName: user.name,
    otp: otpResult.plaintextOtp,
    validForMinutes: 10,
    ipAddress,
    userAgent,
  });

  let emailDelivered = false;
  try {
    const result = await sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "login-otp",
    });
    emailDelivered = result.delivered;
  } catch {
    // Best-effort — Token existiert, User kann resend triggern wenn nötig.
  }

  return NextResponse.json({
    next: "OTP",
    tokenId: otpResult.tokenId,
    expiresAt: otpResult.expiresAt.toISOString(),
    maskedEmail: maskEmail(user.email),
    emailDelivered,
  });
}
