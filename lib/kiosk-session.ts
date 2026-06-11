// Short-lived signed kiosk session cookie. Created after a successful PIN
// entry. The TTL is sliding: every successful punch refreshes it, so an
// employee who keeps the actions screen open can keep stamping. After
// inactivity it expires and the kiosk falls back to the PIN screen.

import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "kiosk_session";
const TTL_SECONDS = 600; // 10 min sliding window

function secret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET missing");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createKioskSession(employeeId: string) {
  const expires = Date.now() + TTL_SECONDS * 1000;
  const payload = `${employeeId}.${expires}`;
  const sig = sign(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_SECONDS,
    path: "/",
  });
}

export async function readKioskSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const v = cookieStore.get(COOKIE)?.value;
  if (!v) return null;
  const parts = v.split(".");
  if (parts.length !== 3) return null;
  const [employeeId, expires, sig] = parts;
  if (sign(`${employeeId}.${expires}`) !== sig) return null;
  if (Number(expires) < Date.now()) return null;
  return employeeId;
}

export async function clearKioskSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

/** Re-issue the cookie with a fresh TTL — call on every successful action. */
export async function extendKioskSession(employeeId: string) {
  await createKioskSession(employeeId);
}
