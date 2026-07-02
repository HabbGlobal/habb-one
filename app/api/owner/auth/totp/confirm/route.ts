/**
 * POST /api/owner/auth/totp/confirm  { code }
 *
 * Confirms the secret generated in /setup with a first valid code from the
 * authenticator app and activates TOTP as recovery (totpEnrolledAt = now).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { decryptSecret, verifyTotp } from "@/lib/owner/totp";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const account = await prisma.ownerAccount.findUnique({
    where: { id: guard.ctx.ownerAccountId },
    select: { id: true, totpSecretEnc: true },
  });
  if (!account?.totpSecretEnc) {
    return NextResponse.json({ error: "NO_PENDING_SECRET" }, { status: 400 });
  }

  if (!verifyTotp(decryptSecret(account.totpSecretEnc), parsed.data.code)) {
    return NextResponse.json({ error: "CODE_INVALID" }, { status: 401 });
  }

  await prisma.ownerAccount.update({
    where: { id: account.id },
    data: { totpEnrolledAt: new Date(), totpFailedAttempts: 0, totpLockedUntil: null },
  });
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_2FA_TOTP_ENROLLED",
  });

  return NextResponse.json({ ok: true });
}
