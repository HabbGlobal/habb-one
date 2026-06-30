/**
 * POST /api/owner/impersonation/cancel
 *
 * Cancels a consent request BEFORE the OTP was verified, for example because
 * the customer cannot answer the phone after all. Marks the token as cancelled
 * so the OTP can no longer be redeemed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  isOwnerPortalEnabled,
  ownerPortalDisabledResponse,
} from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({ consentTokenId: z.string().min(1) });

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_SUPPORT" });
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const token = await prisma.impersonationConsentToken.findUnique({
    where: { id: parsed.data.consentTokenId },
    select: {
      id: true,
      ownerAccountId: true,
      targetCompanyId: true,
      targetUserId: true,
      consumedAt: true,
      cancelledAt: true,
    },
  });
  if (!token) return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
  if (token.ownerAccountId !== guard.ctx.ownerAccountId) {
    return NextResponse.json({ error: "TOKEN_OWNER_MISMATCH" }, { status: 403 });
  }
  if (token.consumedAt) {
    return NextResponse.json({ error: "TOKEN_USED" }, { status: 409 });
  }
  if (token.cancelledAt) {
    return NextResponse.json({ ok: true, alreadyCancelled: true });
  }

  await prisma.impersonationConsentToken.update({
    where: { id: token.id },
    data: { cancelledAt: new Date() },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "IMPERSONATION_CANCELLED",
    targetCompanyId: token.targetCompanyId,
    targetUserId: token.targetUserId,
    payloadAfter: { consentTokenId: token.id },
  });

  return NextResponse.json({ ok: true });
}
