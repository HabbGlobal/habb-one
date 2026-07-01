// Kiosk lock: the second authentication layer for the public kiosk tablet.
//
// Kiosk authentication layers:
//   1. KIOSK LOCK (this file) — unlocks the entire tablet for a specific
//      company. The TTL is configurable per tenant through
//      `Company.kioskLockTimeoutMinutes`; the default `0` means no automatic
//      logout. Uses an HMAC-SHA256 signed cookie. Logout is performed by a
//      button.
//
//   2. KIOSK SESSION (`lib/kiosk-session.ts`) — identifies the employee
//      currently authenticated for time-punch actions. It has a 10-minute
//      sliding TTL for each PIN login and prevents actions under another
//      employee's identity.
//
// Both cookies are signed with the same AUTH_SECRET on Vercel.

import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const COOKIE = "kiosk_lock";

/** Fallback when a tenant has no configured value: 0 means never expire. */
const DEFAULT_TTL_MINUTES = 0;

/**
 * Browser cookie maximum, approximately 400 days since Chrome 104. For
 * "never expire," set the cookie for as long as the browser permits. The
 * sliding refresh after each punch action renews it continuously.
 */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Sentinel in the cookie payload for "never expire." Use `0` instead of a
 * far-future timestamp so the intent remains explicit and no Date.now()
 * comparison is triggered accidentally.
 */
const NEVER_EXPIRES = 0;

function secret() {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET / AUTH_SECRET is missing");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

async function loadTimeoutMinutes(companyId: string): Promise<number> {
  try {
    const row = await prisma.company.findUnique({
      where: { id: companyId },
      select: { kioskLockTimeoutMinutes: true },
    });
    if (!row) return DEFAULT_TTL_MINUTES;
    // Treat negative values as 0, meaning never expire.
    return row.kioskLockTimeoutMinutes < 0
      ? 0
      : row.kioskLockTimeoutMinutes;
  } catch {
    // If the database is temporarily unavailable, avoid automatic logout as
    // a best-effort fallback for a tablet currently in physical use.
    return DEFAULT_TTL_MINUTES;
  }
}

/**
 * Creates a kiosk lock for the specified company. The TTL is loaded from
 * `Company.kioskLockTimeoutMinutes`. The cookie is httpOnly, secure in
 * production, and uses sameSite=strict.
 *
 * `0` minutes means no automatic expiration. The tablet stays assigned until
 * explicitly released with the logout button. The cookie still uses the
 * browser maximum of approximately 400 days, and sliding refresh keeps it
 * active.
 */
export async function createKioskLock(companyId: string) {
  const ttlMinutes = await loadTimeoutMinutes(companyId);

  let expires: number;
  let maxAge: number;
  if (ttlMinutes === 0) {
    expires = NEVER_EXPIRES;
    maxAge = MAX_COOKIE_AGE_SECONDS;
  } else {
    const ttlSeconds = ttlMinutes * 60;
    expires = Date.now() + ttlSeconds * 1000;
    maxAge = ttlSeconds;
  }

  const payload = `${companyId}.${expires}`;
  const sig = sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

/**
 * Reads the companyId of the currently unlocked kiosk tablet from the cookie.
 * Returns null when:
 *   - no cookie is set
 *   - the cookie signature is invalid or uses a different secret
 *   - the cookie has an expiration time and has expired
 *
 * `expires === 0` in the payload means "never expire," so the time check is
 * skipped.
 */
export async function readKioskLock(): Promise<string | null> {
  const cookieStore = await cookies();
  const v = cookieStore.get(COOKIE)?.value;
  if (!v) return null;
  const parts = v.split(".");
  if (parts.length !== 3) return null;
  const [companyId, expires, sig] = parts;
  if (sign(`${companyId}.${expires}`) !== sig) return null;
  const expiresNum = Number(expires);
  if (!Number.isFinite(expiresNum)) return null;
  // 0 means never expire, so skip the time check.
  if (expiresNum !== NEVER_EXPIRES && expiresNum < Date.now()) return null;
  return companyId;
}

/**
 * Sliding-window refresh: overwrite the cookie with the current TTL. This is
 * called after every successful employee action so an active kiosk is not
 * locked during the day. With `kioskLockTimeoutMinutes = 0`, it simply resets
 * the cookie to the browser maximum.
 */
export async function extendKioskLock(companyId: string) {
  await createKioskLock(companyId);
}

/** Logout by deleting the cookie; used by the end-of-shift button. */
export async function clearKioskLock() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
