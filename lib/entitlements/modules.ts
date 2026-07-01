/**
 * Plan-to-module enforcement for tenants.
 *
 * The single source of truth for which modules a plan contains is
 * `lib/pricing/plans.ts` through PLANS[].modules. This module derives the
 * tenant's effective module set:
 *
 *   Base       = modules in the current Company.plan
 *   Override   = explicit TenantEntitlement rows (enabled true/false)
 *
 * Enforcement therefore remains correct even when no entitlement rows exist;
 * in that case, the plan alone determines all modules.
 *
 * Model invariant: override rows represent deviations from the plan. A row
 * manually set by an owner carries `updatedByOwnerAccountId` and survives plan
 * changes. During a plan change, only automatically materialized rows without
 * an owner author are removed so the new plan takes effect. See
 * `reconcileEntitlementsForPlanChange`. Full materialization through
 * `syncEntitlementsToPlan` is intended only for backfill scripts.
 */

import type { Prisma, TenantModule, TenantPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/pricing/plans";
import { ALL_MODULES } from "@/lib/owner/entitlements";

/** Modules included in each plan, derived directly from the pricing definition. */
export const PLAN_MODULES: Record<TenantPlan, TenantModule[]> =
  Object.fromEntries(PLANS.map((p) => [p.key, p.modules])) as Record<
    TenantPlan,
    TenantModule[]
  >;

/**
 * Effective module set for a tenant: plan base plus explicit entitlement
 * overrides.
 */
export async function getEnabledModules(
  companyId: string,
): Promise<Set<TenantModule>> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      plan: true,
      entitlements: { select: { module: true, enabled: true } },
    },
  });
  if (!company) return new Set();

  const set = new Set<TenantModule>(PLAN_MODULES[company.plan] ?? []);
  for (const e of company.entitlements) {
    if (e.enabled) set.add(e.module);
    else set.delete(e.module);
  }
  return set;
}

/**
 * Reconciles module enforcement with a new plan without removing manual owner
 * grants or blocks.
 *
 * A manually set owner override always carries `updatedByOwnerAccountId`. The
 * entitlement route sets it, while full materialization does not. During a
 * plan change, only automatically materialized rows with no author are
 * removed. Plan-controlled modules then follow the new plan, while owner
 * overrides remain as deviations layered on top.
 *
 * Call this in the same transaction as the `company.plan` update.
 */
export async function reconcileEntitlementsForPlanChange(
  client: Prisma.TransactionClient | typeof prisma,
  companyId: string,
): Promise<void> {
  await client.tenantEntitlement.deleteMany({
    where: { companyId, updatedByOwnerAccountId: null },
  });
}

/**
 * Writes an explicit TenantEntitlement row for every module according to the
 * plan, fully materializing its state.
 *
 * Intended only for backfill scripts. Do not use this during plan changes,
 * because it would overwrite manual owner overrides. Plan changes use
 * `reconcileEntitlementsForPlanChange`.
 */
export async function syncEntitlementsToPlan(
  client: Prisma.TransactionClient | typeof prisma,
  companyId: string,
  plan: TenantPlan,
): Promise<void> {
  const enabled = new Set<TenantModule>(PLAN_MODULES[plan] ?? []);
  for (const m of ALL_MODULES) {
    await client.tenantEntitlement.upsert({
      where: { companyId_module: { companyId, module: m } },
      create: {
        companyId,
        module: m,
        enabled: enabled.has(m),
        monthlyLimit: null,
      },
      update: { enabled: enabled.has(m) },
    });
  }
}
