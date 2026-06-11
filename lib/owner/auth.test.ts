/**
 * Unit-Tests für Token-Mint und -Verify. Wir testen hier *nicht* die
 * DB-abhängigen Helfer (`createOwnerSession`, `getOwnerContext`) — die
 * laufen gegen die echte Prisma-Instanz und gehören in einen Integration-
 * Test-Lauf, falls wir den später einrichten. Die JWT-Routinen alleine
 * sind pure Funktionen und reichen für die kritischste Sicherheits-Zusicherung:
 * dass kein Token, das nicht mit unserem Secret signiert ist, gültig erscheint.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import {
  signCeremonyToken,
  verifyCeremonyToken,
  signSessionToken,
  verifySessionToken,
  JWT_ISSUER,
} from "./auth";

beforeEach(() => {
  process.env.OWNER_AUTH_SECRET = "a".repeat(32);
});

describe("ceremony token", () => {
  it("round-trips a valid token", async () => {
    const token = await signCeremonyToken({
      ownerAccountId: "ow_1",
      stage: "ENROLL",
      challenge: "abc",
    });
    const claims = await verifyCeremonyToken(token);
    expect(claims.ownerAccountId).toBe("ow_1");
    expect(claims.stage).toBe("ENROLL");
    expect(claims.challenge).toBe("abc");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({
      ownerAccountId: "ow_1",
      stage: "ENROLL",
      challenge: "abc",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(JWT_ISSUER)
      .setSubject("ow_1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("totally-different-secret-of-sufficient-length"));

    await expect(verifyCeremonyToken(token)).rejects.toThrow();
  });

  it("rejects a token with a wrong issuer", async () => {
    const secret = new TextEncoder().encode(process.env.OWNER_AUTH_SECRET!);
    const token = await new SignJWT({
      ownerAccountId: "ow_1",
      stage: "ENROLL",
      challenge: "abc",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("not-habb-owner")
      .setSubject("ow_1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);

    await expect(verifyCeremonyToken(token)).rejects.toThrow();
  });

  it("rejects a malformed payload (missing fields)", async () => {
    const secret = new TextEncoder().encode(process.env.OWNER_AUTH_SECRET!);
    const token = await new SignJWT({ foo: "bar" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(JWT_ISSUER)
      .setSubject("ow_1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);

    await expect(verifyCeremonyToken(token)).rejects.toThrow(/Malformed/);
  });
});

describe("session token", () => {
  it("round-trips with role", async () => {
    const token = await signSessionToken({
      ownerAccountId: "ow_1",
      sessionId: "sess_abc",
      role: "OWNER_ADMIN",
    });
    const claims = await verifySessionToken(token);
    expect(claims.ownerAccountId).toBe("ow_1");
    expect(claims.sessionId).toBe("sess_abc");
    expect(claims.role).toBe("OWNER_ADMIN");
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken({
      ownerAccountId: "ow_1",
      sessionId: "sess_abc",
      role: "OWNER_SUPPORT",
    });
    // Flip a character in the payload portion of the JWT.
    const [h, p, s] = token.split(".");
    const tampered = `${h}.${p.slice(0, -2)}AA.${s}`;
    await expect(verifySessionToken(tampered)).rejects.toThrow();
  });
});

describe("secret guard", () => {
  it("refuses to sign with a too-short secret", async () => {
    process.env.OWNER_AUTH_SECRET = "short";
    await expect(
      signSessionToken({ ownerAccountId: "x", sessionId: "y", role: "OWNER_SUPPORT" }),
    ).rejects.toThrow(/too short/);
  });
});
