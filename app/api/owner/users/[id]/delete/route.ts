import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

/**
 * Soft-Delete. Setzt `deletedAt`; ein Cron räumt nach 30 Tagen final auf.
 * Aktive Sessions werden via `sessionEpoch++` invalidiert.
 */
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
    select: { id: true, companyId: true, email: true, role: true, deletedAt: true, sessionEpoch: true },
  });
  if (!user) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (user.deletedAt) {
    return NextResponse.json({ error: "ALREADY_DELETED" }, { status: 409 });
  }
  if (user.role === "SUPERADMIN") {
    return NextResponse.json({ error: "SUPERADMIN_PROTECTED" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      sessionEpoch: user.sessionEpoch + 1,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_SOFT_DELETED",
    targetCompanyId: user.companyId,
    targetUserId: id,
    reason: parsed.data.reason,
    payloadAfter: { email: user.email, role: user.role },
  });

  return NextResponse.json({ ok: true });
}
