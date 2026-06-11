import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { OWNER_ASSIGNABLE_ROLES } from "@/lib/owner/users";
import type { UserRole } from "@prisma/client";

const schema = z.object({
  role: z.enum(OWNER_ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]),
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const before = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, companyId: true, deletedAt: true, sessionEpoch: true },
  });
  if (!before || before.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  // SUPERADMIN-Accounts dürfen vom Owner-Portal NICHT umgerollt werden —
  // die sind der Master jedes Mandanten.
  if (before.role === "SUPERADMIN") {
    return NextResponse.json({ error: "SUPERADMIN_PROTECTED" }, { status: 403 });
  }
  if (before.role === parsed.data.role) {
    return NextResponse.json({ error: "NO_CHANGE" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      role: parsed.data.role,
      // Eine Rollen-Änderung wirkt sofort: Sessions invalidieren, damit der
      // User mit dem neuen Permission-Set durchgespült wird.
      sessionEpoch: before.sessionEpoch + 1,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_ROLE_CHANGED",
    targetCompanyId: before.companyId,
    targetUserId: id,
    reason: parsed.data.reason,
    payloadBefore: { role: before.role },
    payloadAfter: { role: parsed.data.role },
  });

  return NextResponse.json({ ok: true });
}
