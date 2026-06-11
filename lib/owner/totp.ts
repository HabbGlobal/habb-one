/**
 * TOTP (RFC 6238) für den Owner-Notfall-Zugang.
 *
 * Bewusst NUR Recovery: der Passkey bleibt Pflicht. Ein gültiger
 * TOTP-Code gewährt KEINEN Portalzugang — er schaltet lediglich den
 * Passkey-Enroll-Schritt frei (siehe /api/owner/auth/totp/recover).
 *
 * Kein externes Lib: HMAC-SHA1-TOTP + Base32 + AES-256-GCM mit Node
 * `crypto`. Das Shared Secret wird verschlüsselt at rest abgelegt;
 * der Schlüssel wird aus OWNER_AUTH_SECRET abgeleitet (strikt getrennt
 * vom Tenant-Secret).
 */

import {
  createHmac,
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const ISSUER = "habb.ch Owner Console";

// ─── Base32 (RFC 4648, ohne Padding) ──────────────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ─── Secret-Erzeugung + otpauth-URI ───────────────────────────────────

/** Neues, zufälliges Base32-Secret (160 Bit). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildOtpauthUri(secretBase32: string, accountEmail: string): string {
  const label = encodeURIComponent(`${ISSUER}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── TOTP-Berechnung + Verifikation ───────────────────────────────────

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit counter, big-endian (oberste 32 Bit i.d.R. 0).
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/**
 * Prüft einen 6-stelligen Code gegen das Base32-Secret mit ±1 Zeitfenster
 * (Uhren-Drift). Konstantzeit-Vergleich gegen Timing-Leaks.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number = Date.now(),
): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (let w = -1; w <= 1; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// ─── Secret-Verschlüsselung at rest (AES-256-GCM) ─────────────────────

function key(): Buffer {
  const sec = process.env.OWNER_AUTH_SECRET;
  if (!sec || sec.length < 16) {
    throw new Error("OWNER_AUTH_SECRET fehlt/zu kurz — TOTP nicht nutzbar.");
  }
  return createHash("sha256").update(sec).digest();
}

/** Format: v1:<ivB64>:<tagB64>:<cipherB64> */
export function encryptSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(secretBase32, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, ivB64, tagB64, dataB64] = stored.split(":");
  if (v !== "v1") throw new Error("Unbekanntes TOTP-Secret-Format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
