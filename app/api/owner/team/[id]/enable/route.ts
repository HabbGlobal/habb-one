/**
 * POST /api/owner/team/[id]/enable: reactivate owner.
 * Wir verwenden dieselbe DISABLED-Audit-Action, aber mit
 * unterschiedlichem Payload — so muss kein neuer Enum-Wert per
 * migration is added.
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
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const before = await prisma.ownerAccount.findUnique({
    where: { id },
    select: { id: true, email: true, isActive: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (before.isActive) return NextResponse.json({ error: "NO_CHANGE" }, { status: 409 });

  await prisma.ownerAccount.update({ where: { id }, data: { isActive: true } });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_ACCOUNT_DISABLED", // reuse — Payload zeigt action: "enabled"
    reason: parsed.data.reason,
    payloadAfter: {
      ownerId: before.id,
      ownerEmail: before.email,
      action: "enabled",
    },
  });

  return NextResponse.json({ ok: true });
}
