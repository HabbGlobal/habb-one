/**
 * POST /api/owner/auth/passkey/enroll-verify
 *
 * Verifies the WebAuthn attestation for registration. On success:
 *   1. Persist credential in the DB
 *   2. Set `webauthnEnrolledAt` to now
 *   3. Create OwnerSession + session cookie -> owner is signed in
 *   4. Clear ceremony cookie
 *   5. Audit: OWNER_2FA_ENROLLED + OWNER_LOGIN_OK
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import {
  COOKIE_CEREMONY,
  verifyCeremonyToken,
  clearCeremonyCookie,
  createOwnerSession,
  setSessionCookie,
  readRequestContext,
} from "@/lib/owner/auth";
import { verifyEnrollmentResponse, originFromRequest } from "@/lib/owner/webauthn";
import { ownerAudit } from "@/lib/owner/audit";

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("response" in body)) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const jar = await cookies();
  const ceremonyToken = jar.get(COOKIE_CEREMONY)?.value;
  if (!ceremonyToken) return NextResponse.json({ error: "NO_CEREMONY" }, { status: 401 });

  let claims;
  try {
    claims = await verifyCeremonyToken(ceremonyToken);
  } catch {
    return NextResponse.json({ error: "INVALID_CEREMONY" }, { status: 401 });
  }
  if (claims.stage !== "ENROLL") {
    return NextResponse.json({ error: "WRONG_STAGE" }, { status: 400 });
  }

  const origin = originFromRequest(req);
  let credentialId: string;
  let publicKey: Uint8Array;
  let counter: number;
  let transports: string | null;
  try {
    const v = await verifyEnrollmentResponse({
      response: (body as { response: never }).response,
      expectedChallenge: claims.challenge,
      origin,
    });
    credentialId = v.credentialId;
    publicKey = v.publicKey;
    counter = v.counter;
    transports = v.transports;
  } catch (e) {
    return NextResponse.json(
      { error: "VERIFICATION_FAILED", message: e instanceof Error ? e.message : "" },
      { status: 401 },
    );
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: claims.ownerAccountId },
  });
  if (!account || !account.isActive) {
    return NextResponse.json({ error: "ACCOUNT_INVALID" }, { status: 401 });
  }

  // Atomic write: credential + enrolledAt + audit.
  await prisma.$transaction(async (tx) => {
    await tx.ownerWebAuthnCredential.create({
      data: {
        ownerAccountId: account.id,
        credentialId,
        publicKey: Buffer.from(publicKey),
        counter: BigInt(counter),
        transports,
      },
    });
    if (!account.webauthnEnrolledAt) {
      await tx.ownerAccount.update({
        where: { id: account.id },
        data: { webauthnEnrolledAt: new Date() },
      });
    }
  });

  const { ip, ua } = await readRequestContext();
  const token = await createOwnerSession({
    ownerAccountId: account.id,
    role: account.role,
    ipAddress: ip,
    userAgent: ua,
  });
  await setSessionCookie(token);
  await clearCeremonyCookie();

  await ownerAudit({
    ownerAccountId: account.id,
    ownerEmail: account.email,
    action: "OWNER_2FA_ENROLLED",
  });
  await ownerAudit({
    ownerAccountId: account.id,
    ownerEmail: account.email,
    action: "OWNER_LOGIN_OK",
  });

  return NextResponse.json({ ok: true });
}
