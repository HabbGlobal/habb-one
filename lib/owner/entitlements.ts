/**
 * Modul-Entitlements pro Mandant.
 *
 * Effektiver Zustand = Plan-Basis + explizite Overrides:
 *   Basis    = Module des aktuellen Company.plan (PLANS[].modules)
 *   Override = TenantEntitlement-Zeile (enabled true/false)
 *
 * Das ist EXAKT dieselbe Logik wie `getEnabledModules` (lib/entitlements/
 * modules.ts), die der Kunde tatsächlich durchgesetzt bekommt (Sidebar +
 * Route-Guard). So zeigt der Owner-Modul-Tab garantiert das, was der Kunde
 * wirklich hat — auch wenn (noch) keine Override-Zeilen existieren.
 *
 * `MODULE_DEFAULTS` liefert nur noch Labels/Beschreibungen; die `enabled`-
 * Felder dort sind NICHT mehr maßgeblich für die Durchsetzung.
 */

import { prisma } from "@/lib/prisma";
import type { TenantModule, TenantPlan } from "@prisma/client";
import { PLANS } from "@/lib/pricing/plans";

/** Plan → enthaltene Module, direkt aus der Pricing-Definition. Bewusst hier
 *  (statt Import aus lib/entitlements/modules) berechnet, um einen Import-
 *  Zyklus zu vermeiden (modules.ts importiert ALL_MODULES von hier). */
const PLAN_MODULE_SET = new Map<string, Set<TenantModule>>(
  PLANS.map((p) => [p.key, new Set<TenantModule>(p.modules)]),
);

function planModuleSet(plan: TenantPlan): Set<TenantModule> {
  return PLAN_MODULE_SET.get(plan) ?? new Set<TenantModule>();
}

/** Ist dieses Modul Teil des angegebenen Plans? */
export function planContainsModule(plan: TenantPlan, module: TenantModule): boolean {
  return planModuleSet(plan).has(module);
}

export interface ModuleDefault {
  enabled: boolean;
  monthlyLimit: number | null;
  label: string;
  description: string;
}

export const MODULE_DEFAULTS: Record<TenantModule, ModuleDefault> = {
  CRM: {
    enabled: true,
    monthlyLimit: null,
    label: "CRM",
    description: "Customer management and contact data.",
  },
  ORDERS_QUOTES: {
    enabled: true,
    monthlyLimit: null,
    label: "Orders & Quotes",
    description: "Order and quote pipeline with process planning.",
  },
  INVOICES_QR: {
    enabled: true,
    monthlyLimit: null,
    label: "Invoices (QR Bill)",
    description: "Swiss QR invoices, PDF export, payment reconciliation.",
  },
  WORKSHOP_PLAN: {
    enabled: true,
    monthlyLimit: null,
    label: "Workshop Plan",
    description: "Machine and area allocation planning.",
  },
  STAFF_PLAN: {
    enabled: true,
    monthlyLimit: null,
    label: "Staff Plan",
    description: "Shift planning and target/actual hours.",
  },
  TIME_KIOSK: {
    enabled: true,
    monthlyLimit: null,
    label: "Time Tracking (Kiosk)",
    description: "Clock kiosk with employee PIN on the workshop tablet.",
  },
  API_ACCESS: {
    enabled: false,
    monthlyLimit: null,
    label: "API Access",
    description: "External API for third-party systems (coming in phase v2).",
  },
  WHITELABEL: {
    enabled: false,
    monthlyLimit: null,
    label: "Whitelabel",
    description: "Custom branding instead of HABB One (Enterprise plan).",
  },
};

export const ALL_MODULES = Object.keys(MODULE_DEFAULTS) as TenantModule[];

export interface EffectiveEntitlement {
  module: TenantModule;
  enabled: boolean;
  monthlyLimit: number | null;
  /** True if an override row exists; false if we fall through to the plan. */
  hasOverride: boolean;
  /** True if this module is part of the tenant's current plan. */
  inPlan: boolean;
  /** Last time the override row was updated, or null when no row exists. */
  updatedAt: Date | null;
  /** Owner who last touched the row, or null. */
  updatedByOwnerAccountId: string | null;
}

export async function getEffectiveEntitlements(
  companyId: string,
): Promise<EffectiveEntitlement[]> {
  const [company, rows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { plan: true } }),
    prisma.tenantEntitlement.findMany({ where: { companyId } }),
  ]);
  const planSet = company ? planModuleSet(company.plan) : new Set<TenantModule>();
  const byModule = new Map(rows.map((r) => [r.module, r]));

  return ALL_MODULES.map<EffectiveEntitlement>((m) => {
    const row = byModule.get(m);
    const inPlan = planSet.has(m);
    return {
      module: m,
      // Plan is the basis; an override row wins if present.
      enabled: row ? row.enabled : inPlan,
      monthlyLimit: row ? row.monthlyLimit : null,
      hasOverride: !!row,
      inPlan,
      updatedAt: row?.updatedAt ?? null,
      updatedByOwnerAccountId: row?.updatedByOwnerAccountId ?? null,
    };
  });
}

export interface UpsertEntitlementInput {
  companyId: string;
  module: TenantModule;
  enabled: boolean;
  monthlyLimit: number | null;
  ownerAccountId: string;
}

export async function upsertEntitlement(input: UpsertEntitlementInput) {
  return prisma.tenantEntitlement.upsert({
    where: { companyId_module: { companyId: input.companyId, module: input.module } },
    create: {
      companyId: input.companyId,
      module: input.module,
      enabled: input.enabled,
      monthlyLimit: input.monthlyLimit,
      updatedByOwnerAccountId: input.ownerAccountId,
    },
    update: {
      enabled: input.enabled,
      monthlyLimit: input.monthlyLimit,
      updatedByOwnerAccountId: input.ownerAccountId,
    },
  });
}
