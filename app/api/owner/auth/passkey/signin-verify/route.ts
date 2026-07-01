/**
 * POST /api/owner/auth/passkey/signin-verify
 *
 * Verifies the authenticator response, bumps the counter, creates OwnerSession
 * + session cookie, clears ceremony cookie, writes audit.
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
import { verifyAuthResponse, originFromRequest } from "@/lib/owner/webauthn";
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
  if (claims.stage !== "SIGNIN") {
    return NextResponse.json({ error: "WRONG_STAGE" }, { status: 400 });
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: claims.ownerAccountId },
  });
  if (!account || !account.isActive) {
    return NextResponse.json({ error: "ACCOUNT_INVALID" }, { status: 401 });
  }

  const origin = originFromRequest(req);
  let credentialId: string;
  let newCounter: number;
  try {
    const v = await verifyAuthResponse({
      response: (body as { response: never }).response,
      expectedChallenge: claims.challenge,
      origin,
      ownerAccountId: account.id,
    });
    credentialId = v.credentialId;
    newCounter = v.newCounter;
  } catch (e) {
    return NextResponse.json(
      { error: "VERIFICATION_FAILED", message: e instanceof Error ? e.message : "" },
      { status: 401 },
    );
  }

  await prisma.ownerWebAuthnCredential.update({
    where: { credentialId },
    data: { counter: BigInt(newCounter), lastUsedAt: new Date() },
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
    action: "OWNER_LOGIN_OK",
  });

  return NextResponse.json({ ok: true });
}
