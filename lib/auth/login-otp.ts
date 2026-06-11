/**
 * Login-2FA per E-Mail-OTP für alle Tenant-User außer KIOSK_OPERATOR.
 *
 * Flow:
 *   1. User gibt email+password ein → /api/auth/login-otp/request
 *   2. Server validiert Passwort + Lifecycle (locked/deleted/email-verified)
 *      - KIOSK_OPERATOR → direkt durch, kein OTP
 *      - Sonst → LoginOtpToken anlegen (bcrypt-Hash), Mail mit Klartext-Code
 *   3. User trägt Code ein → NextAuth signIn mit {otpToken, otp}
 *   4. authorize() validiert: Token frisch, Hash matcht, < MAX_ATTEMPTS
 *
 * Sicherheits-Eigenschaften:
 *   - Klartext-OTP nur in der Mail, nirgendwo sonst
 *   - 10 Min Gültigkeit
 *   - Max 5 Falscheingaben pro Token, dann gesperrt
 *   - Constant-time bcrypt-compare
 *   - Token consume-once (consumedAt-Markierung)
 */

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export const LOGIN_OTP_TTL_MINUTES = 10;
export const LOGIN_OTP_MAX_ATTEMPTS = 5;

export function generateLoginOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashLoginOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function compareLoginOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export interface CreateLoginOtpInput {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateLoginOtpResult {
  tokenId: string;
  /** Klartext-OTP — NIE persistiert, nur in die Mail einbetten. */
  plaintextOtp: string;
  expiresAt: Date;
}

/**
 * Erzeugt einen neuen Login-OTP für den User. Vorherige offene Tokens
 * desselben Users werden NICHT invalidiert — der User könnte einen frischen
 * Code anfordern wollen ohne den alten zu kennen. Beim Verify wird IMMER
 * der jüngste passende Token gewählt.
 */
export async function createLoginOtp(input: CreateLoginOtpInput): Promise<CreateLoginOtpResult> {
  const plaintext = generateLoginOtp();
  const codeHash = await hashLoginOtp(plaintext);
  const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000);

  const token = await prisma.loginOtpToken.create({
    data: {
      userId: input.userId,
      codeHash,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
    select: { id: true, expiresAt: true },
  });

  return {
    tokenId: token.id,
    plaintextOtp: plaintext,
    expiresAt: token.expiresAt,
  };
}

export type VerifyLoginOtpResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "USED" | "WRONG_CODE" | "TOO_MANY_ATTEMPTS"; attemptsLeft?: number };

/**
 * Verifiziert einen OTP. Bei Erfolg wird der Token als consumed markiert.
 * Bei Fehlversuch wird `attempts` inkrementiert; ab MAX_ATTEMPTS gesperrt.
 *
 * Hinweis: wir matchen nur OFFENE Tokens (consumedAt IS NULL). Wenn ein
 * Token bereits verwendet wurde, kann er nicht wiederverwendet werden.
 */
export async function verifyLoginOtp(
  tokenId: string,
  plaintextOtp: string,
): Promise<VerifyLoginOtpResult> {
  const token = await prisma.loginOtpToken.findUnique({
    where: { id: tokenId },
    select: {
      id: true,
      userId: true,
      codeHash: true,
      attempts: true,
      consumedAt: true,
      expiresAt: true,
    },
  });

  if (!token) return { ok: false, reason: "NOT_FOUND" };
  if (token.consumedAt) return { ok: false, reason: "USED" };
  if (token.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (token.attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "TOO_MANY_ATTEMPTS", attemptsLeft: 0 };
  }

  const matches = await compareLoginOtp(plaintextOtp, token.codeHash);
  if (!matches) {
    const next = await prisma.loginOtpToken.update({
      where: { id: tokenId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = Math.max(0, LOGIN_OTP_MAX_ATTEMPTS - next.attempts);
    return {
      ok: false,
      reason: left === 0 ? "TOO_MANY_ATTEMPTS" : "WRONG_CODE",
      attemptsLeft: left,
    };
  }

  // Erfolgreich — Token verbrennen.
  await prisma.loginOtpToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: token.userId };
}

/** Maskiert eine E-Mail-Adresse für die UI ("ab...@example.com"). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
