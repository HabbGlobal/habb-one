/**
 * Owner impersonation: owner can move through the app as a tenant user with
 * the customer's consent OTP.
 *
 * Security properties:
 *   - OTP plaintext is NEVER persisted; only the bcrypt hash is stored in
 *     `ImpersonationConsentToken.codeHash`. Plaintext exists only once in the
 *     consent email to the customer.
 *   - Separate cookie (`habb-impersonation`) with its own JWT issuer; can
 *     never be mistaken for a tenant-user or owner session.
 *   - Server session as source of truth: `ImpersonationSession` row with
 *     `endedAt`/`expiresAt`; a cookie without an active row is worthless.
 *   - Banner in the admin app and audit entry for each lifecycle step.
 *
 * Scope enforcement (READONLY blocks write operations) is applied by admin
 * server actions calling `assertNotReadOnlyImpersonation()` below.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { ImpersonationScope } from "@prisma/client";

const JWT_ISSUER = "habb-impersonation";
const COOKIE_NAME = "habb-impersonation";
/** How long the OTP remains valid before the owner must enter it. */
export const CONSENT_TTL_MINUTES = 15;
/** Maximum allowed session duration per request. */
export const MAX_SESSION_DURATION_MINUTES = 240; // 4 h
export const MIN_SESSION_DURATION_MINUTES = 5;
/** Maximum failed OTP attempts before the token is locked. */
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

/** 6-digit numeric OTP with low collision risk and even weighting. */
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
// JWT for the running impersonation.
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
// Read active impersonation.
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
 * Full validation: JWT signed + DB row exists + not ended + not expired.
 * Called by the tenant `auth()` wrapper, so it is robust against all error
 * sources and never throws.
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

/**
 * Throws if the current request is running inside a READONLY owner
 * impersonation session. Call this from any admin server action that
 * mutates data, alongside the normal role/permission check — a READONLY
 * impersonation must never be able to write, regardless of the
 * impersonated user's own role.
 */
export async function assertNotReadOnlyImpersonation(): Promise<void> {
  const imp = await getActiveImpersonation();
  if (imp?.scope === "READONLY") {
    throw new Error("Read-only session: write actions are disabled.");
  }
}

/** For UI gating: true when the current request is inside a READONLY impersonation. */
export async function isReadOnlyImpersonation(): Promise<boolean> {
  const imp = await getActiveImpersonation();
  return imp?.scope === "READONLY";
}
