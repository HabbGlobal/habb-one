/**
 * POST /api/auth/login-otp/resend
 *
 * Erzeugt einen frischen OTP für denselben User (anhand tokenId). Sinnvoll
 * wenn die erste Mail nicht ankam oder abgelaufen ist. Wirft den alten
 * Token nicht weg (Audit-Trail bleibt), sondern macht einen neuen — bei
 * Verify gewinnt der jüngste passende Token.
 *
 * Rate-Limit: max. 5 Resends pro Token-Familie via User (dieselben
 * MAX_ATTEMPTS-Schwellen wie beim Verify), damit das Mail-Postfach nicht
 * mit Codes geflutet werden kann.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createLoginOtp, maskEmail, LOGIN_OTP_MAX_ATTEMPTS } from "@/lib/auth/login-otp";
import { buildLoginOtpMail } from "@/lib/mail/templates/login-otp";
import { sendMail } from "@/lib/mail/send";

const schema = z.object({ tokenId: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const existing = await prisma.loginOtpToken.findUnique({
    where: { id: parsed.data.tokenId },
    select: {
      userId: true,
      consumedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          lockedAt: true,
          deletedAt: true,
          emailVerifiedAt: true,
          role: true,
          company: { select: { suspendedAt: true, registrationStatus: true } },
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
  }
  if (existing.consumedAt) {
    return NextResponse.json({ error: "TOKEN_ALREADY_USED" }, { status: 409 });
  }
  const u = existing.user;
  if (
    !u.isActive ||
    u.lockedAt ||
    u.deletedAt ||
    !u.emailVerifiedAt ||
    u.role === "KIOSK_OPERATOR" ||
    u.company.suspendedAt ||
    u.company.registrationStatus === "REJECTED" ||
    u.company.registrationStatus === "PENDING_EMAIL_VERIFICATION"
  ) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  // Rate-Limit: zähle aktive Tokens der letzten 10 Min.
  const sinceMs = Date.now() - 10 * 60 * 1000;
  const recent = await prisma.loginOtpToken.count({
    where: {
      userId: u.id,
      createdAt: { gte: new Date(sinceMs) },
    },
  });
  if (recent >= LOGIN_OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "TOO_MANY_RESENDS" }, { status: 429 });
  }

  const h = await headers();
  const ipAddress =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent");

  const otpResult = await createLoginOtp({
    userId: u.id,
    ipAddress,
    userAgent,
  });

  const mail = buildLoginOtpMail({
    recipientName: u.name,
    otp: otpResult.plaintextOtp,
    validForMinutes: 10,
    ipAddress,
    userAgent,
  });

  let emailDelivered = false;
  try {
    const result = await sendMail({
      to: u.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "login-otp-resend",
    });
    emailDelivered = result.delivered;
  } catch {
    // best-effort
  }

  return NextResponse.json({
    ok: true,
    tokenId: otpResult.tokenId,
    expiresAt: otpResult.expiresAt.toISOString(),
    maskedEmail: maskEmail(u.email),
    emailDelivered,
  });
}
