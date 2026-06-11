/**
 * POST /api/owner/impersonation/end
 *
 * Beendet die aktuell laufende Impersonation. Wird vom Banner-Button
 * "Sitzung beenden" und vom Owner-Logout aufgerufen.
 *
 * Idempotent: wenn keine Session läuft, antworten wir trotzdem 200 und
 * räumen den Cookie weg.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isOwnerPortalEnabled,
  ownerPortalDisabledResponse,
} from "@/lib/owner/feature-flag";
import { ownerAudit } from "@/lib/owner/audit";
import {
  clearImpersonationCookie,
  getActiveImpersonation,
} from "@/lib/owner/impersonation";

export async function POST() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const active = await getActiveImpersonation();
  if (!active) {
    await clearImpersonationCookie();
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  await prisma.impersonationSession.update({
    where: { id: active.sessionId },
    data: { endedAt: new Date(), endedReason: "EXIT_BY_OWNER" },
  });
  await clearImpersonationCookie();

  await ownerAudit({
    ownerAccountId: active.ownerAccountId,
    ownerEmail: active.ownerEmail,
    action: "IMPERSONATION_ENDED",
    targetCompanyId: active.targetCompanyId,
    targetUserId: active.targetUserId,
    payloadAfter: { sessionId: active.sessionId, reason: "EXIT_BY_OWNER" },
  });

  return NextResponse.json({
    ok: true,
    redirectTo: `/owner/tenants/${active.targetCompanyId}/users`,
  });
}
