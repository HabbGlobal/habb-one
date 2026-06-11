/**
 * Regressions-Tests für die EINE Wahrheit der Modul-Durchsetzung:
 *
 * Der Owner-Modul-Tab (`getEffectiveEntitlements`) MUSS exakt dieselbe
 * effektive Modul-Menge zeigen wie das, was der Kunde tatsächlich bekommt
 * (`getEnabledModules`, Sidebar + Route-Guard). Beide = Plan-Basis + Overrides.
 *
 * Früher basierte die Owner-Sicht auf plan-unabhängigen MODULE_DEFAULTS und
 * konnte daher abweichen, wenn keine Override-Zeilen existierten. Dieser Test
 * verriegelt die Konsistenz.
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
  // getEnabledModules liest company.entitlements (via include),
  // getEffectiveEntitlements liest company.plan + tenantEntitlement.findMany.
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

describe("Owner-Sicht == Kunden-Durchsetzung", () => {
  it("ohne Overrides: TIME_ONLY-Plan => genau TIME_KIOSK, beide Sichten gleich", async () => {
    setup("TIME_ONLY");
    const { owner, enforced } = await bothViews();
    expect(enforced).toEqual(["TIME_KIOSK"]);
    expect(owner).toEqual(enforced);
  });

  it("ohne Overrides: STARTER-Plan, beide Sichten identisch (und kein WORKSHOP_PLAN)", async () => {
    setup("STARTER");
    const { owner, enforced } = await bothViews();
    expect(owner).toEqual(enforced);
    expect(enforced).not.toContain("WORKSHOP_PLAN");
    expect(enforced).toContain("TIME_KIOSK");
  });

  it("Upgrade-Override: Modul zusätzlich freigeschaltet erscheint in beiden", async () => {
    setup("TIME_ONLY", [{ module: "WORKSHOP_PLAN", enabled: true }]);
    const { owner, enforced } = await bothViews();
    expect(enforced).toEqual(["TIME_KIOSK", "WORKSHOP_PLAN"]);
    expect(owner).toEqual(enforced);
  });

  it("Downgrade-Override: ein Plan-Modul gesperrt verschwindet in beiden", async () => {
    setup("STARTER", [{ module: "INVOICES_QR", enabled: false }]);
    const { owner, enforced } = await bothViews();
    expect(enforced).not.toContain("INVOICES_QR");
    expect(owner).toEqual(enforced);
  });
});

describe("Quellen-Isolation (kein Tautologie-Test)", () => {
  // Beweist, dass jede Funktion aus IHRER eigenen Query liest:
  //   getEnabledModules         -> company.findUnique(include entitlements)
  //   getEffectiveEntitlements  -> tenantEntitlement.findMany
  // Dazu füttern wir die beiden Kanäle BEWUSST mit unterschiedlichen Daten.
  // Würde eine Funktion versehentlich aus der falschen Quelle lesen, schlägt
  // genau dieser Test fehl (die "agree"-Tests oben würden es nicht merken).
  it("getEnabledModules liest company.entitlements — nicht tenantEntitlement.findMany", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      plan: "TIME_ONLY",
      entitlements: [{ module: "WORKSHOP_PLAN", enabled: true }], // nur dieser Kanal
    });
    mockEntitlementFindMany.mockResolvedValue([
      { module: "CRM", enabled: true, monthlyLimit: null, updatedAt: null, updatedByOwnerAccountId: null }, // Poison
    ]);
    const { getEnabledModules } = await fresh();
    const enforced = Array.from(await getEnabledModules("c1"));
    expect(enforced).toContain("WORKSHOP_PLAN"); // aus company.entitlements
    expect(enforced).not.toContain("CRM"); // findMany wurde NICHT gelesen
  });

  it("getEffectiveEntitlements liest tenantEntitlement.findMany — nicht company.entitlements", async () => {
    mockCompanyFindUnique.mockResolvedValue({
      plan: "TIME_ONLY",
      entitlements: [{ module: "WORKSHOP_PLAN", enabled: true }], // Poison
    });
    mockEntitlementFindMany.mockResolvedValue([
      { module: "CRM", enabled: true, monthlyLimit: null, updatedAt: null, updatedByOwnerAccountId: null }, // nur dieser Kanal
    ]);
    const { getEffectiveEntitlements } = await fresh();
    const enabled = (await getEffectiveEntitlements("c1"))
      .filter((e) => e.enabled)
      .map((e) => e.module);
    expect(enabled).toContain("CRM"); // aus findMany
    expect(enabled).not.toContain("WORKSHOP_PLAN"); // company.entitlements wurde NICHT gelesen
  });
});

describe("reconcileEntitlementsForPlanChange — Overrides überleben Plan-Wechsel", () => {
  it("löscht NUR automatisch materialisierte Zeilen (Autor = null)", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    const client = { tenantEntitlement: { deleteMany } } as unknown as Parameters<
      Awaited<ReturnType<typeof fresh>>["reconcileEntitlementsForPlanChange"]
    >[0];
    const { reconcileEntitlementsForPlanChange } = await fresh();
    await reconcileEntitlementsForPlanChange(client, "c1");
    // Owner-Overrides (updatedByOwnerAccountId != null) bleiben verschont.
    expect(deleteMany).toHaveBeenCalledWith({
      where: { companyId: "c1", updatedByOwnerAccountId: null },
    });
  });

  it("eine manuelle Sonderfreischaltung gilt auf JEDEM Plan weiter", async () => {
    // getEnabledModules liest company.entitlements; die Owner-Override-Zeile
    // bleibt nach reconcile erhalten und wirkt auf den aktuellen Plan oben drauf.
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

  it("eine manuelle Sperre eines Plan-Moduls bleibt nach Plan-Wechsel bestehen", async () => {
    const { getEnabledModules } = await fresh();
    // STARTER enthält INVOICES_QR; Owner sperrt es manuell (enabled=false).
    mockCompanyFindUnique.mockResolvedValue({
      plan: "STARTER",
      entitlements: [{ module: "INVOICES_QR", enabled: false }],
    });
    expect(Array.from(await getEnabledModules("c1"))).not.toContain("INVOICES_QR");
    // Auch nach Wechsel auf PRO (enthält INVOICES_QR ebenfalls) bleibt es gesperrt.
    mockCompanyFindUnique.mockResolvedValue({
      plan: "PRO",
      entitlements: [{ module: "INVOICES_QR", enabled: false }],
    });
    expect(Array.from(await getEnabledModules("c1"))).not.toContain("INVOICES_QR");
  });
});

describe("inPlan-Provenance", () => {
  it("markiert nur Plan-Module als inPlan (TIME_ONLY => nur TIME_KIOSK)", async () => {
    setup("TIME_ONLY");
    const { getEffectiveEntitlements } = await fresh();
    const ents = await getEffectiveEntitlements("c1");
    const inPlan = ents.filter((e) => e.inPlan).map((e) => e.module).sort();
    expect(inPlan).toEqual(["TIME_KIOSK"]);
  });

  it("ein Upgrade-Override ist enabled, aber NICHT inPlan (=> Provenance 'Manuell +')", async () => {
    setup("TIME_ONLY", [{ module: "CRM", enabled: true }]);
    const { getEffectiveEntitlements } = await fresh();
    const crm = (await getEffectiveEntitlements("c1")).find((e) => e.module === "CRM")!;
    expect(crm.enabled).toBe(true);
    expect(crm.inPlan).toBe(false);
    expect(crm.hasOverride).toBe(true);
  });
});
