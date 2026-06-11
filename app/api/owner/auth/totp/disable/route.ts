/**
 * POST /api/owner/auth/totp/disable
 *
 * Entfernt den TOTP-Recovery-Faktor des eigenen Accounts vollständig.
 * Passkey bleibt davon unberührt.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

export async function POST() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  await prisma.ownerAccount.update({
    where: { id: guard.ctx.ownerAccountId },
    data: {
      totpSecretEnc: null,
      totpEnrolledAt: null,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    },
  });
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_2FA_TOTP_DISABLED",
  });

  return NextResponse.json({ ok: true });
}
