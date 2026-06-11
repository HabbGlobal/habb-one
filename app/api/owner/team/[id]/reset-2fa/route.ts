/**
 * POST /api/owner/team/[id]/reset-2fa — alle Passkeys eines Owners
 * löschen, webauthnEnrolledAt zurücksetzen. Beim nächsten Login wird
 * der Enroll-Flow erzwungen.
 *
 * Use-Cases: verlorenes Yubikey, Mitarbeitenden-Wechsel, kompromittierter
 * Passkey-Verdacht. Passwort + E-Mail bleiben unverändert.
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
    select: {
      id: true,
      email: true,
      _count: { select: { webauthnCredentials: true } },
    },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.ownerWebAuthnCredential.deleteMany({ where: { ownerAccountId: id } });
    await tx.ownerAccount.update({
      where: { id },
      data: { webauthnEnrolledAt: null },
    });
    await tx.ownerSession.updateMany({
      where: { ownerAccountId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_2FA_RESET",
    reason: parsed.data.reason,
    payloadBefore: {
      ownerId: before.id,
      ownerEmail: before.email,
      passkeysRemoved: before._count.webauthnCredentials,
    },
  });

  return NextResponse.json({ ok: true, passkeysRemoved: before._count.webauthnCredentials });
}
