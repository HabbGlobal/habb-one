/**
 * Owner-Auth-Library — strikt separate Auth-Schicht für habb.ch-Owner-Accounts.
 *
 * Bewusste Designentscheidungen:
 *   - NICHT NextAuth. NextAuth ist für Tenant-User. Wir bauen mit `jose`
 *     eigene JWTs mit eigenem Issuer (`habb-owner`) und eigenem Cookie-Namen
 *     (`habb-owner-session`). Damit kann kein Tenant-Cookie und kein
 *     Tenant-Token jemals als Owner-Token akzeptiert werden.
 *   - Server-Session als Source-of-Truth. Der Cookie trägt nur die Session-ID;
 *     Lookup in `OwnerSession` entscheidet endgültig über Gültigkeit. So
 *     funktioniert sofortige Revocation (`revokedAt`) und sliding-idle TTL.
 *   - 2-Phasen-Auth ohne 2. DB-Spalte: Zwischen Passwort-Verify und
 *     Passkey-Verify hält ein kurz-lebiges "Ceremony"-JWT (separater Cookie,
 *     5 Min) den Zwischenstand. Erst nach Passkey-Verify wird die eigentliche
 *     `OwnerSession`-Row angelegt.
 *   - Keine Logs vom Token, dem Hash, der IP-Adresse → nur via Audit-Tabelle.
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
// CEREMONY TOKEN — kurzlebig zwischen Passwort und Passkey
// ─────────────────────────────────────────────────────────────

export interface CeremonyClaims {
  /** Owner-Account, dessen Passwort bereits verifiziert ist. */
  ownerAccountId: string;
  /** Welche WebAuthn-Operation läuft. */
  stage: "ENROLL" | "SIGNIN";
  /** Aktive WebAuthn-Challenge (base64url) — server-signiert, daher
   *  sicher im Cookie ablegbar ohne DB-State. */
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
// SESSION TOKEN — nach erfolgreichem 2-Faktor-Login
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
 * Cookie-Wert ist der Session-Token. DB-Persistenz speichert SHA-256 davon,
 * damit ein DB-Leak den Cookie nicht direkt re-spielbar macht.
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
// CONTEXT — von Server-Components / API-Routes aufgerufen
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
 * Liest den Session-Cookie, validiert ihn gegen die DB und gibt den
 * Owner-Kontext zurück. NULL wenn nicht eingeloggt, Cookie abgelaufen,
 * Session revoked oder Token-Manipulation erkannt.
 *
 * Wirft NIE — nicht authentifizierte Zugriffe sind keine Fehler, sondern
 * ein erwartbarer Zustand. Aufrufer entscheidet, ob er redirected oder
 * 401 antwortet (siehe `requireOwner()`).
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
// GUARDS — für API-Routes
// ─────────────────────────────────────────────────────────────

const ROLE_ORDER: Record<OwnerRole, number> = {
  OWNER_SUPPORT: 1,
  OWNER_ADMIN: 2,
  OWNER_ROOT: 3,
};

export interface RequireOwnerOptions {
  /** Minimale Rolle, ab der der Zugriff erlaubt ist. */
  minRole?: OwnerRole;
  /** Erfordert frischen Sudo-Status (Step-up Auth innerhalb 5 Min). */
  sudo?: boolean;
}

export type RequireOwnerResult =
  | { ok: true; ctx: OwnerContext }
  | { ok: false; status: 401 | 403 };

/**
 * Universeller Guard für `/api/owner/*` Routen. Aufrufer macht entweder
 * `if (!result.ok) return new Response(...)` oder destrukturiert ctx.
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
// REQUEST-CONTEXT — IP / User-Agent für Audit
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
