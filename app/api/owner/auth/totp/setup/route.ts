/**
 * POST /api/owner/auth/totp/setup
 *
 * Erzeugt ein neues TOTP-Secret für den eingeloggten Owner, legt es
 * verschlüsselt ab (noch NICHT aktiv — totpEnrolledAt bleibt null bis
 * /confirm) und liefert QR + Klartext-Secret zurück, damit der Owner
 * es in seine Authenticator-App übernehmen kann.
 *
 * Self-Service für den eigenen Account — der Owner ist bereits voll
 * 2FA-authentifiziert (Passkey-Session). TOTP ist reiner Recovery-
 * Faktor, kein Portalzugang.
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
      // Bewusst NICHT aktivieren — erst nach erfolgreichem /confirm.
      totpEnrolledAt: null,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    },
  });

  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  return NextResponse.json({ secret, otpauthUri: uri, qrDataUrl });
}
