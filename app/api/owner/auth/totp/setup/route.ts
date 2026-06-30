/**
 * POST /api/owner/auth/totp/setup
 *
 * Creates a new TOTP secret for the logged-in owner, stores it encrypted
 * (NOT active yet; totpEnrolledAt stays null until /confirm), and returns QR +
 * plaintext secret so the owner can add it to their authenticator app.
 *
 * Self-service for the owner's own account. The owner is already fully
 * 2FA-authenticated (passkey session). TOTP is a pure recovery factor, not
 * portal access.
 */

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import {
  generateTotpSecret,
  buildOtpauthUri,
  encryptSecret,
} from "@/lib/owner/totp";

export async function POST() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  const secret = generateTotpSecret();
  const uri = buildOtpauthUri(secret, guard.ctx.ownerEmail);

  await prisma.ownerAccount.update({
    where: { id: guard.ctx.ownerAccountId },
    data: {
      totpSecretEnc: encryptSecret(secret),
      // Intentionally NOT activated until successful /confirm.
      totpEnrolledAt: null,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    },
  });

  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return NextResponse.json({ secret, otpauthUri: uri, qrDataUrl });
}
