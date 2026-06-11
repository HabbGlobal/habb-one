/**
 * Plan → Modul-Durchsetzung (Tenant-Seite).
 *
 * Single Source of Truth für "welche Module hat ein Plan" ist
 * `lib/pricing/plans.ts` (PLANS[].modules). Hier wird daraus die
 * effektive Modul-Menge eines Mandanten abgeleitet:
 *
 *   Basis      = Module des aktuellen Company.plan
 *   Override   = explizite TenantEntitlement-Zeilen (enabled true/false)
 *
 * Dadurch ist die Durchsetzung auch dann korrekt, wenn (noch) keine
 * Entitlement-Zeilen existieren — der Plan allein bestimmt dann alles.
 *
 * WICHTIG (Modell): Override-Zeilen sind ABWEICHUNGEN vom Plan. Eine vom
 * Owner manuell gesetzte Zeile trägt `updatedByOwnerAccountId` und gilt als
 * "Sonderfreischaltung/-sperre" — sie ÜBERLEBT einen Plan-Wechsel. Beim
 * Plan-Wechsel werden nur die automatisch materialisierten Zeilen (ohne
 * Owner-Autor) bereinigt, damit der neue Plan greift — siehe
 * `reconcileEntitlementsForPlanChange`. `syncEntitlementsToPlan` (Voll-
 * Materialisierung) ist nur noch für Backfill-Skripte gedacht.
 */

import type { Prisma, TenantModule, TenantPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/pricing/plans";
import { ALL_MODULES } from "@/lib/owner/entitlements";

/** Plan → enthaltene Module, direkt aus der Pricing-Definition. */
export const PLAN_MODULES: Record<TenantPlan, TenantModule[]> =
  Object.fromEntries(PLANS.map((p) => [p.key, p.modules])) as Record<
    TenantPlan,
    TenantModule[]
  >;

/**
 * Effektive Modul-Menge eines Mandanten: Plan-Basis + explizite
 * Entitlement-Overrides.
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
 * Plan-Wechsel: bringt die Modul-Durchsetzung auf den neuen Plan, OHNE
 * manuelle Sonderfreischaltungen/-sperren zu zerstören.
 *
 * Modell: Eine vom Owner manuell gesetzte Override-Zeile trägt immer
 * `updatedByOwnerAccountId` (die Entitlement-Route setzt es; die Voll-
 * Materialisierung NICHT). Beim Plan-Wechsel löschen wir genau die
 * automatisch materialisierten Zeilen (Autor = null) — die plan-gesteuerten
 * Module folgen damit wieder dem (neuen) Plan. Owner-Overrides bleiben
 * erhalten und gelten als Abweichung weiter auf den neuen Plan oben drauf.
 *
 * In derselben Transaktion wie das `company.plan`-Update aufrufen.
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
 * Schreibt für JEDES Modul eine explizite TenantEntitlement-Zeile
 * passend zum Plan (Voll-Materialisierung).
 *
 * NUR noch für Backfill-Skripte gedacht — NICHT mehr beim Plan-Wechsel
 * verwenden, da es manuelle Owner-Overrides überschreiben würde. Der
 * Plan-Wechsel nutzt `reconcileEntitlementsForPlanChange`.
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
