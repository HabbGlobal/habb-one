/**
 * Owner-Impersonation — Owner kann sich mit Consent-OTP des Kunden als
 * Tenant-User in der App bewegen.
 *
 * Sicherheits-Eigenschaften:
 *   - OTP-Klartext wird NIE persistiert — nur bcrypt-Hash in
 *     `ImpersonationConsentToken.codeHash`. Klartext lebt einmalig in der
 *     Consent-Mail an den Kunden.
 *   - Separater Cookie (`habb-impersonation`) mit eigenem JWT-Issuer; kann
 *     nie als Tenant-User- oder Owner-Session missgedeutet werden.
 *   - Server-Session als Source-of-Truth: `ImpersonationSession`-Row mit
 *     `endedAt`/`expiresAt` — Cookie ohne aktive Row ist wertlos.
 *   - Banner in der Admin-App und Audit-Eintrag pro Lifecycle-Schritt.
 *
 * Mutations-Counter und Scope-Enforcement (READONLY blockt Schreibops)
 * werden in einer Folge-Iteration in den Server-Actions verdrahtet —
 * Schema ist bereits darauf vorbereitet (`mutationsCount`, `scope`).
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { ImpersonationScope } from "@prisma/client";

const JWT_ISSUER = "habb-impersonation";
const COOKIE_NAME = "habb-impersonation";
/** Wie lange der OTP gültig ist, bis der Owner ihn eingegeben haben muss. */
export const CONSENT_TTL_MINUTES = 15;
/** Maximal erlaubte Sitzungsdauer pro Anfrage. */
export const MAX_SESSION_DURATION_MINUTES = 240; // 4 h
export const MIN_SESSION_DURATION_MINUTES = 5;
/** Maximale OTP-Falscheingaben bevor der Token gesperrt wird. */
export const MAX_OTP_ATTEMPTS = 5;

function secret(): Uint8Array {
  const raw = process.env.OWNER_AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("OWNER_AUTH_SECRET missing — required for impersonation tokens.");
  }
  return new TextEncoder().encode(raw);
}

// ─────────────────────────────────────────────────────────────
// OTP
// ─────────────────────────────────────────────────────────────

/** 6-stelliger numerischer OTP — kollisionsarm gleich gewichtet. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export async function compareOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ─────────────────────────────────────────────────────────────
// JWT für die laufende Impersonation
// ─────────────────────────────────────────────────────────────

export interface ImpersonationClaims {
  impersonationSessionId: string;
  ownerAccountId: string;
  targetUserId: string;
  targetCompanyId: string;
  scope: ImpersonationScope;
}

export async function signImpersonationToken(
  claims: ImpersonationClaims,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

export async function verifyImpersonationToken(
  token: string,
): Promise<ImpersonationClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: JWT_ISSUER });
    if (
      typeof payload.impersonationSessionId === "string" &&
      typeof payload.ownerAccountId === "string" &&
      typeof payload.targetUserId === "string" &&
      typeof payload.targetCompanyId === "string" &&
      (payload.scope === "READONLY" || payload.scope === "FULL")
    ) {
      return {
        impersonationSessionId: payload.impersonationSessionId,
        ownerAccountId: payload.ownerAccountId,
        targetUserId: payload.targetUserId,
        targetCompanyId: payload.targetCompanyId,
        scope: payload.scope,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Cookie
// ─────────────────────────────────────────────────────────────

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function setImpersonationCookie(
  token: string,
  maxAgeSeconds: number,
): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export { COOKIE_NAME as IMPERSONATION_COOKIE_NAME };

// ─────────────────────────────────────────────────────────────
// Aktive Impersonation lesen
// ─────────────────────────────────────────────────────────────

export interface ActiveImpersonation {
  sessionId: string;
  ownerAccountId: string;
  ownerName: string;
  ownerEmail: string;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail: string;
  targetCompanyId: string;
  targetCompanyName: string;
  scope: ImpersonationScope;
  startedAt: Date;
  expiresAt: Date;
}

/**
 * Vollständige Validierung: JWT signiert + DB-Row existiert + nicht
 * beendet + nicht abgelaufen. Wird vom Tenant-`auth()`-Wrapper aufgerufen,
 * deshalb robust gegen alle Fehlerquellen — wirft nie.
 */
export async function getActiveImpersonation(): Promise<ActiveImpersonation | null> {
  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const claims = await verifyImpersonationToken(token);
  if (!claims) return null;

  try {
    const session = await prisma.impersonationSession.findUnique({
      where: { id: claims.impersonationSessionId },
      include: {
        ownerAccount: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
        targetCompany: { select: { name: true } },
      },
    });
    if (!session) return null;
    if (session.endedAt !== null) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    return {
      sessionId: session.id,
      ownerAccountId: session.ownerAccountId,
      ownerName: session.ownerAccount.name,
      ownerEmail: session.ownerAccount.email,
      targetUserId: session.targetUserId,
      targetUserName: session.targetUser.name,
      targetUserEmail: session.targetUser.email,
      targetCompanyId: session.targetCompanyId,
      targetCompanyName: session.targetCompany.name,
      scope: session.scope,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}
