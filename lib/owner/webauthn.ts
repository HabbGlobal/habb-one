/**
 * WebAuthn / passkey wrapper for owner 2FA.
 *
 * RP ID (Relying Party): derived from the request origin, **not** set
 * statically. Otherwise local (`localhost`) and Vercel (`*.vercel.app`) would
 * not work without code changes. Browsers accept any suffix of the eTLD+1, so
 * this is OK.
 *
 * Storage: public keys are stored as bytes in `OwnerWebAuthnCredential`; the
 * counter is increased on every successful login.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";

const RP_NAME = "HABB One Owner Console";

/**
 * Proxy-safe origin derivation for WebAuthn ceremonies.
 *
 * Behind Vercel or Cloudflare-proxied DNS, `new URL(req.url).origin` is NOT
 * the address from the browser address bar, but the internal/canonical host
 * (for example *.vercel.app). An RP ID derived from that would not match the
 * actual domain (one.HABB Global (PVT) LTD), and the browser would abort
 * passkey registration with SecurityError. Therefore we use `x-forwarded-*`
 * headers: what the client actually used. Falls back cleanly to req.url
 * locally and in tests.
 */
export function originFromRequest(req: Request): string {
  const h = req.headers;
  const fwdProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const fwdHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  const reqUrl = new URL(req.url);
  const proto = fwdProto || reqUrl.protocol.replace(":", "");
  const host = fwdHost || h.get("host") || reqUrl.host;
  return `${proto}://${host}`;
}

export function rpFromOrigin(origin: string): { rpID: string; expectedOrigin: string } {
  const url = new URL(origin);
  // `localhost` is special-cased by the WebAuthn spec, so we keep it bare.
  const rpID = url.hostname;
  return { rpID, expectedOrigin: origin };
}

/**
 * Build registration options for an OwnerAccount. `existingCredentialIds`
 * is the list of credentialIds the user already has so the browser can
 * refuse to register a Passkey that's already enrolled.
 */
export async function buildRegistrationOptions(input: {
  ownerAccountId: string;
  ownerEmail: string;
  ownerName: string;
  origin: string;
  existingCredentialIds: string[];
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challenge: string; rpID: string }> {
  const { rpID } = rpFromOrigin(input.origin);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: input.ownerEmail,
    userID: new TextEncoder().encode(input.ownerAccountId),
    userDisplayName: input.ownerName,
    attestationType: "none",
    authenticatorSelection: {
      // Either platform (Touch ID, Windows Hello) or roaming (YubiKey).
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: input.existingCredentialIds.map((id) => ({
      id,
      type: "public-key",
    })),
  });
  return { options, challenge: options.challenge, rpID };
}

export async function verifyEnrollmentResponse(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  origin: string;
}): Promise<{ credentialId: string; publicKey: Uint8Array; counter: number; transports: string | null }> {
  const { rpID, expectedOrigin } = rpFromOrigin(input.origin);
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("WebAuthn registration verification failed");
  }
  const info = verification.registrationInfo;
  return {
    credentialId: info.credential.id,
    publicKey: info.credential.publicKey,
    counter: info.credential.counter,
    transports: input.response.response.transports
      ? JSON.stringify(input.response.response.transports)
      : null,
  };
}

export async function buildAuthenticationOptions(input: {
  ownerAccountId: string;
  origin: string;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challenge: string }> {
  const { rpID } = rpFromOrigin(input.origin);
  const credentials = await prisma.ownerWebAuthnCredential.findMany({
    where: { ownerAccountId: input.ownerAccountId },
    select: { credentialId: true, transports: true },
  });
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      type: "public-key",
      transports: c.transports
        ? (JSON.parse(c.transports) as AuthenticatorTransport[])
        : undefined,
    })),
  });
  return { options, challenge: options.challenge };
}

export async function verifyAuthResponse(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  origin: string;
  ownerAccountId: string;
}): Promise<{ credentialId: string; newCounter: number }> {
  const { rpID, expectedOrigin } = rpFromOrigin(input.origin);
  const cred = await prisma.ownerWebAuthnCredential.findFirst({
    where: {
      ownerAccountId: input.ownerAccountId,
      credentialId: input.response.id,
    },
  });
  if (!cred) {
    throw new Error("Unknown credential for this owner");
  }
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: Number(cred.counter),
    },
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw new Error("WebAuthn authentication verification failed");
  }
  return {
    credentialId: cred.credentialId,
    newCounter: verification.authenticationInfo.newCounter,
  };
}

type AuthenticatorTransport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
