/**
 * GET /api/owner/auth/passkey/signin-options
 *
 * Returns WebAuthn authentication options for the ceremony owner.
 * Updates the ceremony cookie with the fresh challenge.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import {
  COOKIE_CEREMONY,
  verifyCeremonyToken,
  signCeremonyToken,
  setCeremonyCookie,
} from "@/lib/owner/auth";
import { buildAuthenticationOptions, originFromRequest } from "@/lib/owner/webauthn";

export async function GET(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

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

  const origin = originFromRequest(req);
  const { options, challenge } = await buildAuthenticationOptions({
    ownerAccountId: claims.ownerAccountId,
    origin,
  });

  const newToken = await signCeremonyToken({
    ownerAccountId: claims.ownerAccountId,
    stage: "SIGNIN",
    challenge,
  });
  await setCeremonyCookie(newToken);

  return NextResponse.json(options);
}
