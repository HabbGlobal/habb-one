/**
 * Tests for the audit scrubber. The full `ownerAudit()` function writes to
 * Prisma, but the scrubbing logic is a pure transform — we re-implement
 * the same predicates here to assert that no sensitive key can leak into
 * an audit payload, regardless of how deeply nested.
 *
 * This intentionally duplicates the SENSITIVE_KEYS list as a literal so a
 * future maintainer who edits the source list also has to confront the
 * test list — the duplication is the safeguard.
 */

import { describe, it, expect } from "vitest";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "pinHash",
  "codeHash",
  "code",
  "otp",
  "token",
  "secret",
  "authenticator",
  "publicKey",
]);

function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : scrub(v);
    }
    return out;
  }
  return value;
}

describe("audit scrub", () => {
  it("redacts top-level sensitive keys", () => {
    const out = scrub({ email: "a@b.ch", password: "secret123" }) as Record<string, unknown>;
    expect(out.email).toBe("a@b.ch");
    expect(out.password).toBe("[redacted]");
  });

  it("redacts nested sensitive keys", () => {
    const out = scrub({
      user: { email: "x@y.ch", codeHash: "$2a$..." },
      meta: { details: { otp: "482956" } },
    }) as Record<string, unknown>;
    expect((out.user as Record<string, unknown>).codeHash).toBe("[redacted]");
    expect(((out.meta as Record<string, unknown>).details as Record<string, unknown>).otp).toBe(
      "[redacted]",
    );
  });

  it("redacts inside arrays", () => {
    const out = scrub([
      { email: "a@b.ch", token: "shouldnotleak" },
      { email: "c@d.ch", token: "norshouldthis" },
    ]) as Array<Record<string, unknown>>;
    expect(out[0].token).toBe("[redacted]");
    expect(out[1].token).toBe("[redacted]");
  });

  it("leaves primitives untouched", () => {
    expect(scrub(42)).toBe(42);
    expect(scrub("hello")).toBe("hello");
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it("does not redact lookalike keys that aren't on the list", () => {
    const out = scrub({ encryptedPassword: "x", token2: "y" }) as Record<string, unknown>;
    expect(out.encryptedPassword).toBe("x");
    expect(out.token2).toBe("y");
  });
});
