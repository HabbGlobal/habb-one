import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { upsertEntitlement, ALL_MODULES, planContainsModule } from "@/lib/owner/entitlements";
import type { TenantModule } from "@prisma/client";

const schema = z.object({
  module: z.enum(ALL_MODULES as [TenantModule, ...TenantModule[]]),
  enabled: z.boolean(),
  monthlyLimit: z.number().int().min(0).nullable(),
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true, plan: true } });
  if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const before = await prisma.tenantEntitlement.findUnique({
    where: { companyId_module: { companyId: id, module: parsed.data.module } },
  });
  // Ohne Override-Zeile ist der effektive Vor-Zustand die Plan-Zugehörigkeit
  // (gleiche Logik wie getEnabledModules/getEffectiveEntitlements) — nicht der
  // alte plan-unabhängige MODULE_DEFAULTS-Wert.
  const inPlan = planContainsModule(company.plan, parsed.data.module);
  const beforeEffective = before
    ? { enabled: before.enabled, monthlyLimit: before.monthlyLimit }
    : { enabled: inPlan, monthlyLimit: null };

  await upsertEntitlement({
    companyId: id,
    module: parsed.data.module,
    enabled: parsed.data.enabled,
    monthlyLimit: parsed.data.monthlyLimit,
    ownerAccountId: guard.ctx.ownerAccountId,
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action:
      beforeEffective.enabled !== parsed.data.enabled
        ? "ENTITLEMENT_TOGGLED"
        : "ENTITLEMENT_LIMIT_CHANGED",
    targetCompanyId: id,
    reason: parsed.data.reason,
    payloadBefore: { module: parsed.data.module, ...beforeEffective },
    payloadAfter: {
      module: parsed.data.module,
      enabled: parsed.data.enabled,
      monthlyLimit: parsed.data.monthlyLimit,
    },
  });

  return NextResponse.json({ ok: true });
}
