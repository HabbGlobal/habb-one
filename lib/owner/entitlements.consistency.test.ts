/**
 * Regression tests for the ONE source of truth for module enforcement:
 *
 * The owner module tab (`getEffectiveEntitlements`) MUST show exactly the same
 * effective module set as what the customer actually receives
 * (`getEnabledModules`, sidebar + route guard). Both = plan base + overrides.
 *
 * Previously, the owner view was based on plan-independent MODULE_DEFAULTS and
 * could therefore diverge when no override rows existed. This test locks that
 * consistency down.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCompanyFindUnique = vi.fn();
const mockEntitlementFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: mockCompanyFindUnique },
    tenantEntitlement: { findMany: mockEntitlementFindMany },
  },
}));

import type { TenantModule, TenantPlan } from "@prisma/client";

async function fresh() {
  vi.resetModules();
  const owner = await import("./entitlements");
  const enforce = await import("@/lib/entitlements/modules");
  return { ...owner, ...enforce };
}

function setup(
  plan: TenantPlan,
  overrides: { module: TenantModule; enabled: boolean }[] = [],
) {
  // getEnabledModules reads company.entitlements (via include),
  // getEffectiveEntitlements reads company.plan + tenantEntitlement.findMany.
  mockCompanyFindUnique.mockResolvedValue({
    plan,
    entitlements: overrides.map((o) => ({ module: o.module, enabled: o.enabled })),
  });
  mockEntitlementFindMany.mockResolvedValue(
    overrides.map((o) => ({
      module: o.module,
      enabled: o.enabled,
      monthlyLimit: null,
      updatedAt: null,
      updatedByOwnerAccountId: null,
    })),
  );
}

beforeEach(() => {
  mockCompanyFindUnique.mockReset();
  mockEntitlementFindMany.mockReset();
});

async function bothViews() {
  const { getEffectiveEntitlements, getEnabledModules } = await fresh();
  const owner = (await getEffectiveEntitlements("c1"))
    .filter((e) => e.enabled)
    .map((e) => e.module)
    .sort();
  const enforced = Array.from(await getEnabledModules("c1")).sort();
  return { owner, enforced };
}

describe("Owner view == customer enforcement", () => {
  it("without overrides: TIME_ONLY plan => exactly TIME_KIOSK, both views equal", async () => {
    setup("TIME_ONLY");
    const { owner, enforced } = await bothViews();
    expect(enforced).toEqual(["TIME_KIOSK"]);
    expect(owner).toEqual(enforced);
  });

  it("without overrides: STARTER plan, both views identical and no WORKSHOP_PLAN", async () => {
    setup("STARTER");
    const { owner, enforced } = await bothViews();
    expect(owner).toEqual(enforced);
    expect(enforced).not.toContain("WORKSHOP_PLAN");
    expect(enforced).toContain("TIME_KIOSK");
  });

  it("upgrade override: additionally enabled module appears in both", async () => {
    setup("TIME_ONLY", [{ module: "WORKSHOP_PLAN", enabled: true }]);
    const { owner, enforced } = await bothViews();
    expect(enforced).toEqual(["TIME_KIOSK", "WORKSHOP_PLAN"]);
    expect(owner).toEqual(enforced);
  });

  it("downgrade override: a blocked plan module disappears from both", async () => {
    setup("STARTER", [{ module: "INVOICES_QR", enabled: false }]);
    const { owner, enforced } = await bothViews();
    expect(enforced).not.toContain("INVOICES_QR");
    expect(owner).toEqual(enforced);
  });
});

describe("Source isolation, not a tautology test", () => {
  // Proves that each function reads from ITS own query:
  //   getEnabledModules         -> company.findUnique(include entitlements)
  //   getEffectiveEntitlements  -> tenantEntitlement.findMany
  // We intentionally feed both channels different data. If a function
  // accidentally reads from the wrong source, exactly this test fails; the
  // "agree" tests above would not notice.
  it("getEnabledModules reads company.entitlements, not tenantEntitlement.findMany", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      plan: "TIME_ONLY",
      entitlements: [{ module: "WORKSHOP_PLAN", enabled: true }], // only this channel
    });
    mockEntitlementFindMany.mockResolvedValue([
      { module: "CRM", enabled: true, monthlyLimit: null, updatedAt: null, updatedByOwnerAccountId: null }, // Poison
    ]);
    const { getEnabledModules } = await fresh();
    const enforced = Array.from(await getEnabledModules("c1"));
    expect(enforced).toContain("WORKSHOP_PLAN"); // from company.entitlements
    expect(enforced).not.toContain("CRM"); // findMany was NOT read
  });

  it("getEffectiveEntitlements reads tenantEntitlement.findMany, not company.entitlements", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      plan: "TIME_ONLY",
      entitlements: [{ module: "WORKSHOP_PLAN", enabled: true }], // Poison
    });
    mockEntitlementFindMany.mockResolvedValue([
      { module: "CRM", enabled: true, monthlyLimit: null, updatedAt: null, updatedByOwnerAccountId: null }, // only this channel
    ]);
    const { getEffectiveEntitlements } = await fresh();
    const enabled = (await getEffectiveEntitlements("c1"))
      .filter((e) => e.enabled)
      .map((e) => e.module);
    expect(enabled).toContain("CRM"); // from findMany
    expect(enabled).not.toContain("WORKSHOP_PLAN"); // company.entitlements was NOT read
  });
});

describe("reconcileEntitlementsForPlanChange: overrides survive plan changes", () => {
  it("deletes ONLY automatically materialized rows (author = null)", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    const client = { tenantEntitlement: { deleteMany } } as unknown as Parameters<
      Awaited<ReturnType<typeof fresh>>["reconcileEntitlementsForPlanChange"]
    >[0];
    const { reconcileEntitlementsForPlanChange } = await fresh();
    await reconcileEntitlementsForPlanChange(client, "c1");
    // Owner overrides (updatedByOwnerAccountId != null) are spared.
    expect(deleteMany).toHaveBeenCalledWith({
      where: { companyId: "c1", updatedByOwnerAccountId: null },
    });
  });

  it("a manual special grant continues to apply on EVERY plan", async () => {
    // getEnabledModules reads company.entitlements; the owner override row
    // remains after reconcile and applies on top of the current plan.
    const { getEnabledModules } = await fresh();
    const onPlan = async (plan: TenantPlan) => {
      mockCompanyFindUnique.mockResolvedValue({
        plan,
        entitlements: [{ module: "WORKSHOP_PLAN", enabled: true }],
      });
      return Array.from(await getEnabledModules("c1"));
    };
    expect(await onPlan("TIME_ONLY")).toContain("WORKSHOP_PLAN");
    expect(await onPlan("STARTER")).toContain("WORKSHOP_PLAN");
  });

  it("a manual block of a plan module remains after plan change", async () => {
    const { getEnabledModules } = await fresh();
    // STARTER contains INVOICES_QR; owner blocks it manually (enabled=false).
    mockCompanyFindUnique.mockResolvedValue({
      plan: "STARTER",
      entitlements: [{ module: "INVOICES_QR", enabled: false }],
    });
    expect(Array.from(await getEnabledModules("c1"))).not.toContain("INVOICES_QR");
    // Even after switching to PRO, which also contains INVOICES_QR, it remains blocked.
    mockCompanyFindUnique.mockResolvedValue({
      plan: "PRO",
      entitlements: [{ module: "INVOICES_QR", enabled: false }],
    });
    expect(Array.from(await getEnabledModules("c1"))).not.toContain("INVOICES_QR");
  });
});

describe("inPlan-Provenance", () => {
  it("marks only plan modules as inPlan (TIME_ONLY => only TIME_KIOSK)", async () => {
    setup("TIME_ONLY");
    const { getEffectiveEntitlements } = await fresh();
    const ents = await getEffectiveEntitlements("c1");
    const inPlan = ents.filter((e) => e.inPlan).map((e) => e.module).sort();
    expect(inPlan).toEqual(["TIME_KIOSK"]);
  });

  it("an upgrade override is enabled, but NOT inPlan (=> provenance 'Manual +')", async () => {
    setup("TIME_ONLY", [{ module: "CRM", enabled: true }]);
    const { getEffectiveEntitlements } = await fresh();
    const crm = (await getEffectiveEntitlements("c1")).find((e) => e.module === "CRM")!;
    expect(crm.enabled).toBe(true);
    expect(crm.inPlan).toBe(false);
    expect(crm.hasOverride).toBe(true);
  });
});
