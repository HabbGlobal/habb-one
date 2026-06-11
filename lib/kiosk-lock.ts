// Kiosk-Lock: zweite Auth-Schicht für das öffentliche Kiosk-iPad.
//
// Schichten der Kiosk-Authentifizierung:
//   1. KIOSK-LOCK (diese Datei) — entsperrt das Tablet als Ganzes für
//      eine bestimmte Firma. TTL pro Mandant einstellbar
//      (`Company.kioskLockTimeoutMinutes`); Default `0` = niemals
//      automatisch ausloggen (Werkstatt-Tablet hängt fest im Betrieb).
//      Signiertes Cookie (HMAC-SHA256). Logout via Button.
//
//   2. KIOSK-SESSION (`lib/kiosk-session.ts`) — Mitarbeiter X ist
//      gerade eingeloggt für Stempel-Aktionen. TTL 10min, läuft pro
//      PIN-Login. Schützt vor versehentlichem Stempeln in fremdem Namen.
//
// Beide werden auf Vercel über das gleiche AUTH_SECRET signiert.

import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const COOKIE = "kiosk_lock";

/** Fallback wenn ein Mandant keinen Wert hat: 0 = nie ablaufen. */
const DEFAULT_TTL_MINUTES = 0;

/**
 * Browser-Cookie-Maximum (~400 Tage seit Chrome 104). Für "nie ablaufen"
 * setzen wir das Cookie so lange wie der Browser akzeptiert — der
 * Sliding-Refresh bei jeder Stempel-Aktion erneuert es ohnehin laufend.
 */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Sentinel im Cookie-Payload für "nie ablaufen". Wir benutzen
 * explizit `0` statt einem far-future-Timestamp, damit es im Code
 * unmissverständlich bleibt und kein Date.now()-Vergleich fälschlich
 * triggert.
 */
const NEVER_EXPIRES = 0;

function secret() {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET / AUTH_SECRET fehlt");
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
    // Defensive: < 0 wird wie 0 (nie ablaufen) behandelt.
    return row.kioskLockTimeoutMinutes < 0
      ? 0
      : row.kioskLockTimeoutMinutes;
  } catch {
    // Wenn die DB temporär nicht erreichbar ist: best-effort kein
    // Auto-Logout — sicherer Default für ein Tablet, das gerade
    // physisch in Benutzung ist.
    return DEFAULT_TTL_MINUTES;
  }
}

/**
 * Erstellt einen Kiosk-Lock für die angegebene Firma. TTL wird aus
 * `Company.kioskLockTimeoutMinutes` geladen. Cookie wird httpOnly,
 * secure (in Production), sameSite=strict gesetzt.
 *
 * `0` Minuten = niemals automatisch ablaufen — Werkstatt-Tablet bleibt
 * dauerhaft gebunden, bis explizit über den Logout-Button entkoppelt
 * wird. Der Cookie wird trotzdem mit dem Browser-Maximum (~400 Tage)
 * gesetzt, und der Sliding-Refresh hält ihn aktiv.
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
 * Liest die companyId des aktuell entsperrten Kiosk-Tablets aus dem
 * Cookie. NULL wenn:
 *   - kein Cookie gesetzt
 *   - Cookie-Signatur ungültig (manipuliert / falsches Secret)
 *   - Cookie hat ein Ablaufdatum gesetzt und ist abgelaufen
 *
 * `expires === 0` im Payload heißt "nie ablaufen" — dann wird die
 * Zeitprüfung übersprungen.
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
  // 0 = nie ablaufen → Zeitprüfung überspringen.
  if (expiresNum !== NEVER_EXPIRES && expiresNum < Date.now()) return null;
  return companyId;
}

/**
 * Sliding-Window-Refresh — Cookie mit aktueller TTL überschreiben.
 * Wird bei jeder erfolgreichen Mitarbeiter-Aktion aufgerufen, sodass
 * ein aktiv genutzter Kiosk nicht mitten am Tag gesperrt wird. Bei
 * `kioskLockTimeoutMinutes = 0` setzt das schlicht das Cookie auf das
 * Browser-Maximum zurück — billiger No-Op-artiger Refresh.
 */
export async function extendKioskLock(companyId: string) {
  await createKioskLock(companyId);
}

/** Logout — Cookie löschen. Schicht-Ende-Knopf nutzt das. */
export async function clearKioskLock() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
