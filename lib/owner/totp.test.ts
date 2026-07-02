import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.OWNER_AUTH_SECRET = "test-owner-secret-please-change-1234567890";
});

// Import after setting ENV. key() reads OWNER_AUTH_SECRET lazily, so it is not
// critical, but this is cleaner.
import {
  base32Encode,
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotp,
  encryptSecret,
  decryptSecret,
} from "./totp";

describe("base32 + secret", () => {
  it("generates a non-empty Base32 secret using only the alphabet", () => {
    const s = generateTotpSecret();
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/^[A-Z2-7]+$/);
  });

  it("base32Encode is deterministic", () => {
    const buf = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(base32Encode(buf)).toBe(base32Encode(buf));
  });
});

describe("otpauth URI", () => {
  it("contains secret, issuer and SHA1/6/30", () => {
    const uri = buildOtpauthUri("JBSWY3DPEHPK3PXP", "admin@HABB Global (PVT) LTD");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("verifyTotp", () => {
  it("accepts RFC 6238 reference vector (SHA1, secret '12345678901234567890')", () => {
    // Base32 of ASCII "12345678901234567890"
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    // RFC 6238 test vector: T=59s -> code 287082
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
  });

  it("rejects wrong code", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
  });

  it("tolerates +/-1 time window drift", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    // Code for the previous step must still be valid within +30s.
    // Indirectly: current code is valid now AND 30s later.
    expect(verifyTotp(secret, codeAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, codeAt(secret, now), now + 30_000)).toBe(true);
  });

  it("rejects non-6-digit inputs", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
  });
});

describe("encrypt/decrypt secret (AES-256-GCM)", () => {
  it("round-trip returns the original", () => {
    const s = generateTotpSecret();
    const enc = encryptSecret(s);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
  });

  it("tampered ciphertext fails (auth tag)", () => {
    const enc = encryptSecret(generateTotpSecret());
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

// Helper: generate the currently valid code for a given point in time.
// Brute-forcing verifyTotp against all 10^6 codes would be wrong, and mirroring
// all internals would be overkill. We rely on the stable RFC vector above, but
// the drift test needs a real code, so this is a tiny local HOTP replica.
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
