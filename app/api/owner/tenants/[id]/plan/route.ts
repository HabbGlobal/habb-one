/**
 * PUT /api/owner/tenants/[id]/plan — Tenant-Plan wechseln.
 *
 * Plan steuert Modul-Sichtbarkeit und Limits (Phase v2). Daten-Migration
 * findet beim Plan-Wechsel NICHT statt — UI passt sich live an.
 *
 * Audit-Action: TENANT_STAMMDATEN_UPDATED mit explizitem Plan-Diff im
 * Payload — kein neuer Enum-Wert nötig.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { reconcileEntitlementsForPlanChange } from "@/lib/entitlements/modules";
import { PLAN_KEYS } from "@/lib/pricing/plans";

const schema = z.object({
  plan: z.enum(PLAN_KEYS),
  reason: z.string().trim().min(10).max(500),
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
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const before = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, plan: true, suspendedAt: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (before.suspendedAt) {
    return NextResponse.json({ error: "COMPANY_SUSPENDED" }, { status: 400 });
  }
  if (before.plan === parsed.data.plan) {
    return NextResponse.json({ error: "NO_CHANGE" }, { status: 409 });
  }

  // Plan + Modul-Entitlements atomar: der Plan-Wechsel schaltet die
  // plan-gesteuerten Module sofort frei/aus (Nav + Route-Guard lesen die
  // Entitlements live). Manuelle Owner-Sonderfreischaltungen/-sperren
  // bleiben dabei erhalten — nur automatisch materialisierte Zeilen werden
  // bereinigt, damit der neue Plan greift.
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id },
      data: { plan: parsed.data.plan },
    });
    await reconcileEntitlementsForPlanChange(tx, id);
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_STAMMDATEN_UPDATED",
    targetCompanyId: id,
    reason: parsed.data.reason,
    payloadBefore: { plan: before.plan },
    payloadAfter: { plan: parsed.data.plan, field: "plan" },
  });

  return NextResponse.json({ ok: true });
}
