import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Reason must be at least 10 characters long."),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, companyId: true, lockedAt: true, lockedReason: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!user.lockedAt) {
    return NextResponse.json({ error: "NOT_LOCKED" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      isActive: true,
      lockedAt: null,
      lockedReason: null,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_UNLOCKED",
    targetCompanyId: user.companyId,
    targetUserId: id,
    reason: parsed.data.reason,
    payloadBefore: {
      lockedAt: user.lockedAt.toISOString(),
      lockedReason: user.lockedReason,
    },
  });

  return NextResponse.json({ ok: true });
}
