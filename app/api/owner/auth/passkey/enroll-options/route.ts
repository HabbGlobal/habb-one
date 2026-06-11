/**
 * GET /api/owner/auth/passkey/enroll-options
 *
 * Liefert WebAuthn-Registrierungs-Optionen für den Ceremony-Owner.
 * Schreibt die frische Challenge in einen ersetzten Ceremony-Cookie, damit
 * der nachfolgende `enroll-verify` sie timing-safe vergleichen kann.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import {
  COOKIE_CEREMONY,
  verifyCeremonyToken,
  signCeremonyToken,
  setCeremonyCookie,
} from "@/lib/owner/auth";
import { buildRegistrationOptions, originFromRequest } from "@/lib/owner/webauthn";

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
  if (claims.stage !== "ENROLL") {
    return NextResponse.json({ error: "WRONG_STAGE" }, { status: 400 });
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: claims.ownerAccountId },
    select: {
      id: true,
      email: true,
      name: true,
      webauthnCredentials: { select: { credentialId: true } },
    },
  });
  if (!account) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const origin = originFromRequest(req);
  const { options, challenge } = await buildRegistrationOptions({
    ownerAccountId: account.id,
    ownerEmail: account.email,
    ownerName: account.name,
    origin,
    existingCredentialIds: account.webauthnCredentials.map((c) => c.credentialId),
  });

  // Replace ceremony cookie so the verify endpoint can read the challenge back.
  const newToken = await signCeremonyToken({
    ownerAccountId: account.id,
    stage: "ENROLL",
    challenge,
  });
  await setCeremonyCookie(newToken);

  return NextResponse.json(options);
}
