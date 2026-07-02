/**
 * POST /api/owner/users/[id]/temp-password
 *
 * Sets a temporary password for the user. The owner must pass it to the user
 * personally (phone, chat); the user is forced to change it on next login
 * (`mustChangePassword=true`).
 *
 * The plaintext password is returned ONCE in the response and is never logged
 * or stored afterwards. It is gone after a browser refresh.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { generateTempPassword } from "@/lib/owner/users";

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
    select: { id: true, companyId: true, deletedAt: true, sessionEpoch: true },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      // Invalidate existing sessions, otherwise the old login remains active.
      sessionEpoch: user.sessionEpoch + 1,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_TEMP_PASSWORD_SET",
    targetCompanyId: user.companyId,
    targetUserId: user.id,
    reason: parsed.data.reason,
    payloadAfter: { mustChangePassword: true, sessionsInvalidated: true },
  });

  return NextResponse.json({ ok: true, tempPassword });
}
