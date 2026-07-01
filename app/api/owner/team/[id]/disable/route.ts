/**
 * POST /api/owner/team/[id]/disable: deactivate owner. Login is blocked
 * immediately and running sessions are additionally revoked.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({ reason: z.string().trim().min(10).max(500) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner({ minRole: "OWNER_ROOT", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }
  const { id } = await params;
  if (id === guard.ctx.ownerAccountId) {
    return NextResponse.json({ error: "SELF_PROTECTED" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const before = await prisma.ownerAccount.findUnique({
    where: { id },
    select: { id: true, email: true, isActive: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!before.isActive) return NextResponse.json({ error: "NO_CHANGE" }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.ownerAccount.update({ where: { id }, data: { isActive: false } });
    await tx.ownerSession.updateMany({
      where: { ownerAccountId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_ACCOUNT_DISABLED",
    reason: parsed.data.reason,
    payloadAfter: { ownerId: before.id, ownerEmail: before.email },
  });

  return NextResponse.json({ ok: true });
}
