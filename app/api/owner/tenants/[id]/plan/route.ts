/**
 * PUT /api/owner/tenants/[id]/plan: switch tenant plan.
 *
 * Plan controls module visibility and limits (phase v2). Data migration does
 * NOT happen on plan change; the UI adapts live.
 *
 * Audit action: TENANT_STAMMDATEN_UPDATED with an explicit plan diff in the
 * payload; no new enum value needed.
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

  // Plan + module entitlements are atomic: the plan change immediately
  // enables/disables plan-controlled modules (nav + route guard read live
  // entitlements). Manual owner special grants/blocks are preserved; only
  // automatically materialized rows are cleaned up so the new plan applies.
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
