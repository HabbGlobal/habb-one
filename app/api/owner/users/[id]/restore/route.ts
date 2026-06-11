/**
 * POST /api/owner/users/[id]/restore
 *
 * Stellt einen zuvor soft-gelöschten Tenant-User wieder her. Das ist die
 * Umkehroperation zu `/delete` — `deletedAt` zurück auf null, `isActive`
 * wieder true. Sessions waren beim Delete via `sessionEpoch++` invalidiert
 * worden; wir bumpen NICHT nochmal, weil ohnehin niemand mehr eingeloggt
 * sein kann.
 *
 * Email-Konflikte können nicht auftreten: solange die Row existiert, hält
 * sie ihren unique-Slot. Erst der finale Cron-Purge nach 30 Tagen löst
 * den Slot frei.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  isOwnerPortalEnabled,
  ownerPortalDisabledResponse,
} from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
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
    select: {
      id: true,
      companyId: true,
      email: true,
      role: true,
      deletedAt: true,
      company: { select: { suspendedAt: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!user.deletedAt) {
    return NextResponse.json({ error: "NOT_DELETED" }, { status: 409 });
  }
  if (user.company.suspendedAt) {
    // Mandant ist suspendiert → User-Restore macht keinen Sinn, der Login
    // würde sowieso scheitern. Owner muss erst Mandant reaktivieren.
    return NextResponse.json({ error: "COMPANY_SUSPENDED" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: null,
      isActive: true,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_RESTORED",
    targetCompanyId: user.companyId,
    targetUserId: id,
    reason: parsed.data.reason,
    payloadAfter: { email: user.email, role: user.role },
  });

  return NextResponse.json({ ok: true });
}
