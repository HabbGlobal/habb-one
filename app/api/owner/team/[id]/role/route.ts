/**
 * PUT /api/owner/team/[id]/role — Rolle eines Owner-Accounts ändern.
 * OWNER_ROOT only. Eigenen Account kann man nicht degradieren (Self-
 * Protect); existierende Sessions werden revoked, damit die neue Rolle
 * beim nächsten Login frisch greift.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  role: z.enum(["OWNER_SUPPORT", "OWNER_ADMIN", "OWNER_ROOT"]),
  reason: z.string().trim().min(10).max(500),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    select: { id: true, email: true, role: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (before.role === parsed.data.role) {
    return NextResponse.json({ error: "NO_CHANGE" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.ownerAccount.update({
      where: { id },
      data: { role: parsed.data.role },
    });
    // Bestehende Sessions invalidieren, damit die neue Rolle beim
    // nächsten Login frisch greift (Token enthält die Rolle).
    await tx.ownerSession.updateMany({
      where: { ownerAccountId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_ACCOUNT_ROLE_CHANGED",
    reason: parsed.data.reason,
    payloadBefore: { ownerId: before.id, ownerEmail: before.email, role: before.role },
    payloadAfter: { ownerId: before.id, ownerEmail: before.email, role: parsed.data.role },
  });

  return NextResponse.json({ ok: true });
}
