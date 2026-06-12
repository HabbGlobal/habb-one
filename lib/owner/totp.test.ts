import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.OWNER_AUTH_SECRET = "test-owner-secret-please-change-1234567890";
});

// Import nach dem ENV-Setzen (key() liest OWNER_AUTH_SECRET lazy, daher
// unkritisch — aber sauberer Stil).
import {
  base32Encode,
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
} from "./totp";

describe("base32 + secret", () => {
  it("erzeugt ein nicht-leeres Base32-Secret nur aus dem Alphabet", () => {
    const s = generateTotpSecret();
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/^[A-Z2-7]+$/);
  });

  it("base32Encode ist deterministisch", () => {
    const buf = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(base32Encode(buf)).toBe(base32Encode(buf));
  });
});

describe("otpauth URI", () => {
  it("enthält Secret, Issuer und SHA1/6/30", () => {
    const uri = buildOtpauthUri("JBSWY3DPEHPK3PXP", "admin@HABB Global (PVT) LTD");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("verifyTotp", () => {
  it("akzeptiert RFC-6238-Referenzvektor (SHA1, secret '12345678901234567890')", () => {
    // Base32 von ASCII "12345678901234567890"
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    // RFC 6238 Testvektor: T=59s → Code 287082
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
  });

  it("lehnt falschen Code ab", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
  });

  it("toleriert ±1 Zeitfenster (Drift)", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    // Code für den vorherigen Schritt muss innerhalb +30s noch gelten.
    // (indirekt: aktueller Code gilt jetzt UND 30s später)
    expect(verifyTotp(secret, codeAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, codeAt(secret, now), now + 30_000)).toBe(true);
  });

  it("weist nicht-6-stellige Eingaben ab", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
  });
});

describe("encrypt/decrypt secret (AES-256-GCM)", () => {
  it("round-trip ergibt das Original", () => {
    const s = generateTotpSecret();
    const enc = encryptSecret(s);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
  });

  it("manipuliertes Ciphertext schlägt fehl (Auth-Tag)", () => {
    const enc = encryptSecret(generateTotpSecret());
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

// Hilfsfunktion: den aktuell gültigen Code zu einem Zeitpunkt erzeugen,
// indem wir verifyTotp gegen alle 10^6 Codes NICHT brute-forcen, sondern
// die interne Logik spiegeln wäre Overkill — wir nutzen stattdessen die
// Eigenschaft, dass der RFC-Vektor stabil ist. Für den Drift-Test
// brauchen wir aber einen echten Code: kleine lokale HOTP-Replik.
import { createHmac } from "crypto";
function codeAt(secretB32: string, atMs: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of secretB32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const secret = Buffer.from(out);
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** 6).toString().padStart(6, "0");
}
