import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import {
  getOwnerContext,
  revokeOwnerSession,
  clearSessionCookie,
  clearCeremonyCookie,
} from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import {
  clearImpersonationCookie,
  getActiveImpersonation,
} from "@/lib/owner/impersonation";

export async function POST() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const ctx = await getOwnerContext();
  if (ctx) {
    // End any active impersonation cleanly on logout. Otherwise the cookie
    // remains and the next /admin request would carry a "ghost" owner identity
    // switch.
    const imp = await getActiveImpersonation();
    if (imp && imp.ownerAccountId === ctx.ownerAccountId) {
      await prisma.impersonationSession.update({
        where: { id: imp.sessionId },
        data: { endedAt: new Date(), endedReason: "FORCED_END" },
      });
      await ownerAudit({
        ownerAccountId: ctx.ownerAccountId,
        ownerEmail: ctx.ownerEmail,
        action: "IMPERSONATION_ENDED",
        targetCompanyId: imp.targetCompanyId,
        targetUserId: imp.targetUserId,
        payloadAfter: { sessionId: imp.sessionId, reason: "FORCED_END_VIA_LOGOUT" },
      });
    }

    await revokeOwnerSession(ctx.sessionId);
    await ownerAudit({
      ownerAccountId: ctx.ownerAccountId,
      ownerEmail: ctx.ownerEmail,
      action: "OWNER_LOGOUT",
    });
  }
  await clearSessionCookie();
  await clearCeremonyCookie();
  await clearImpersonationCookie();
  return NextResponse.json({ ok: true });
}
