/**
 * Owner auth library: strictly separate auth layer for HABB Global (PVT) LTD owner accounts.
 *
 * Intentional design decisions:
 *   - NOT NextAuth. NextAuth is for tenant users. We build our own JWTs with
 *     `jose`, a dedicated issuer (`habb-owner`), and a dedicated cookie name
 *     (`habb-owner-session`). This prevents tenant cookies or tenant tokens
 *     from ever being accepted as owner tokens.
 *   - Server session as source of truth. The cookie carries only the session
 *     ID; lookup in `OwnerSession` decides final validity. This enables
 *     immediate revocation (`revokedAt`) and sliding idle TTL.
 *   - Two-phase auth without a second DB column: between password verification
 *     and passkey verification, a short-lived "Ceremony" JWT (separate cookie,
 *     5 min) holds the intermediate state. The real `OwnerSession` row is
 *     created only after passkey verification.
 *   - No logs of the token, hash, or IP address except through the audit table.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { cookies, headers } from "next/headers";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { OwnerRole } from "@prisma/client";

export const JWT_ISSUER = "habb-owner";
export const COOKIE_SESSION = "habb-owner-session";
export const COOKIE_CEREMONY = "habb-owner-ceremony";

const SESSION_TTL_SECONDS = 60 * 30; // idle timeout (sliding)
const SESSION_ABSOLUTE_MAX_SECONDS = 60 * 60 * 8; // hard limit
const CEREMONY_TTL_SECONDS = 60 * 5;
const SUDO_TTL_SECONDS = 60 * 5;

function secret(): Uint8Array {
  const raw = process.env.OWNER_AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "OWNER_AUTH_SECRET is missing or too short (need ≥16 chars). " +
      "Generate with: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(raw);
}

// ─────────────────────────────────────────────────────────────
// CEREMONY TOKEN: short-lived between password and passkey.
// ─────────────────────────────────────────────────────────────

export interface CeremonyClaims {
  /** Owner account whose password has already been verified. */
  ownerAccountId: string;
  /** Which WebAuthn operation is running. */
  stage: "ENROLL" | "SIGNIN";
  /** Active WebAuthn challenge (base64url), server-signed and therefore safe
   *  to store in a cookie without DB state. */
  challenge: string;
}

export async function signCeremonyToken(claims: CeremonyClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setSubject(claims.ownerAccountId)
    .setIssuedAt()
    .setExpirationTime(`${CEREMONY_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyCeremonyToken(token: string): Promise<CeremonyClaims> {
  const { payload } = await jwtVerify(token, secret(), { issuer: JWT_ISSUER });
  if (
    typeof payload.ownerAccountId !== "string" ||
    typeof payload.challenge !== "string" ||
    (payload.stage !== "ENROLL" && payload.stage !== "SIGNIN")
  ) {
    throw new Error("Malformed ceremony token");
  }
  return {
    ownerAccountId: payload.ownerAccountId,
    stage: payload.stage,
    challenge: payload.challenge,
  };
}

// ─────────────────────────────────────────────────────────────
// SESSION TOKEN: after successful 2-factor login.
// ─────────────────────────────────────────────────────────────

export interface SessionClaims {
  ownerAccountId: string;
  sessionId: string;
  role: OwnerRole;
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sessionId: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setSubject(claims.ownerAccountId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret(), { issuer: JWT_ISSUER });
  if (
    typeof payload.sub !== "string" ||
    typeof payload.sessionId !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Malformed session token");
  }
  return {
    ownerAccountId: payload.sub,
    sessionId: payload.sessionId,
    role: payload.role as OwnerRole,
  };
}

// ─────────────────────────────────────────────────────────────
// SESSION LIFECYCLE
// ─────────────────────────────────────────────────────────────

/**
 * Cookie value is the session token. DB persistence stores SHA-256 of it so a
 * DB leak does not make the cookie directly replayable.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateSessionOptions {
  ownerAccountId: string;
  role: OwnerRole;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function createOwnerSession(opts: CreateSessionOptions): Promise<string> {
  const sessionId = randomBytes(16).toString("hex");
  const token = await signSessionToken({
    ownerAccountId: opts.ownerAccountId,
    sessionId,
    role: opts.role,
  });
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MAX_SECONDS * 1000);

  await prisma.ownerSession.create({
    data: {
      id: sessionId,
      ownerAccountId: opts.ownerAccountId,
      tokenHash,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      expiresAt,
    },
  });

  await prisma.ownerAccount.update({
    where: { id: opts.ownerAccountId },
    data: { lastLoginAt: new Date() },
  });

  return token;
}

export async function revokeOwnerSession(sessionId: string): Promise<void> {
  await prisma.ownerSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function grantSudo(sessionId: string): Promise<void> {
  await prisma.ownerSession.update({
    where: { id: sessionId },
    data: { sudoUntil: new Date(Date.now() + SUDO_TTL_SECONDS * 1000) },
  });
}

// ─────────────────────────────────────────────────────────────
// CONTEXT: called by server components / API routes.
// ─────────────────────────────────────────────────────────────

export interface OwnerContext {
  ownerAccountId: string;
  ownerEmail: string;
  name: string;
  role: OwnerRole;
  sessionId: string;
  sudoActive: boolean;
}

/**
 * Reads the session cookie, validates it against the DB, and returns owner
 * context. NULL when not logged in, cookie expired, session revoked, or token
 * manipulation is detected.
 *
 * NEVER throws. Unauthenticated access is not an error, but an expected state.
 * The caller decides whether to redirect or return 401 (see `requireOwner()`).
 */
export async function getOwnerContext(): Promise<OwnerContext | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSION)?.value;
  if (!token) return null;

  let claims: SessionClaims;
  try {
    claims = await verifySessionToken(token);
  } catch (e) {
    if (e instanceof joseErrors.JOSEError) return null;
    return null;
  }

  const expectedHash = hashToken(token);
  const session = await prisma.ownerSession.findUnique({
    where: { id: claims.sessionId },
    include: {
      ownerAccount: {
        select: { id: true, email: true, name: true, role: true, isActive: true },
      },
    },
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() < Date.now() ||
    !timingEqualHex(session.tokenHash, expectedHash) ||
    !session.ownerAccount.isActive
  ) {
    return null;
  }

  return {
    ownerAccountId: session.ownerAccountId,
    ownerEmail: session.ownerAccount.email,
    name: session.ownerAccount.name,
    role: session.ownerAccount.role,
    sessionId: session.id,
    sudoActive:
      session.sudoUntil !== null && session.sudoUntil.getTime() > Date.now(),
  };
}

function timingEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// GUARDS: for API routes.
// ─────────────────────────────────────────────────────────────

const ROLE_ORDER: Record<OwnerRole, number> = {
  OWNER_SUPPORT: 1,
  OWNER_ADMIN: 2,
  OWNER_ROOT: 3,
};

export interface RequireOwnerOptions {
  /** Minimum role required for access. */
  minRole?: OwnerRole;
  /** Requires fresh sudo status (step-up auth within 5 min). */
  sudo?: boolean;
}

export type RequireOwnerResult =
  | { ok: true; ctx: OwnerContext }
  | { ok: false; status: 401 | 403 };

/**
 * Universal guard for `/api/owner/*` routes. Caller either does
 * `if (!result.ok) return new Response(...)` or destructures ctx.
 */
export async function requireOwner(
  opts: RequireOwnerOptions = {},
): Promise<RequireOwnerResult> {
  const ctx = await getOwnerContext();
  if (!ctx) return { ok: false, status: 401 };

  if (opts.minRole && ROLE_ORDER[ctx.role] < ROLE_ORDER[opts.minRole]) {
    return { ok: false, status: 403 };
  }
  if (opts.sudo && !ctx.sudoActive) {
    return { ok: false, status: 403 };
  }
  return { ok: true, ctx };
}

// ─────────────────────────────────────────────────────────────
// COOKIE-HELPERS
// ─────────────────────────────────────────────────────────────

interface CookieSetOptions {
  maxAgeSeconds: number;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_SESSION, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESSION);
}

export async function setCeremonyCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_CEREMONY, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    // Path must cover BOTH /owner/* (server components reading the cookie
    // to gate enrol/passkey pages) and /api/owner/* (route handlers).
    path: "/",
    maxAge: CEREMONY_TTL_SECONDS,
  });
}

export async function clearCeremonyCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_CEREMONY);
}

// ─────────────────────────────────────────────────────────────
// REQUEST CONTEXT: IP / User-Agent for audit.
// ─────────────────────────────────────────────────────────────

export async function readRequestContext(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent");
  return { ip, ua };
}

export { SESSION_TTL_SECONDS, SESSION_ABSOLUTE_MAX_SECONDS, CEREMONY_TTL_SECONDS };
