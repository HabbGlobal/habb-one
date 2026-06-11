import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" }, {
      status: guard.status,
    });
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

  const before = await prisma.company.findUnique({
    where: { id },
    select: { id: true, suspendedAt: true, suspendedReason: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!before.suspendedAt) {
    return NextResponse.json({ error: "NOT_SUSPENDED" }, { status: 409 });
  }

  await prisma.company.update({
    where: { id },
    data: { suspendedAt: null, suspendedReason: null },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_REACTIVATED",
    targetCompanyId: id,
    reason: parsed.data.reason,
    payloadBefore: {
      suspendedAt: before.suspendedAt.toISOString(),
      suspendedReason: before.suspendedReason,
    },
    payloadAfter: { suspendedAt: null, suspendedReason: null },
  });

  return NextResponse.json({ ok: true });
}
