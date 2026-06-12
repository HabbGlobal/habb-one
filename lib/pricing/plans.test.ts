import { describe, expect, it } from "vitest";
import { PLANS, PLAN_KEYS, type PlanSpec } from "./plans";

function plan(key: string): PlanSpec {
  const p = PLANS.find((x) => x.key === key);
  if (!p) throw new Error(`Plan ${key} fehlt in PLANS`);
  return p;
}

describe("TIME_ONLY-Paket (Zeiterfassung, CHF 29)", () => {
  it("finds TIME_ONLY correctly", () => {
    const p = plan("TIME_ONLY");
    expect(p.priceUSD).toBe(29);
    expect(p.label).toBe("Zeiterfassung");
  });

  it("enthält GENAU das Zeitstempel-Modul — kein CRM/Aufträge/Rechnungen/Plan", () => {
    // Kern-Vertrag des Pakets: nur Zeiterfassung. Wenn jemand versehentlich
    // STAFF_PLAN o.ä. dazunimmt, schlägt dieser Test fehl.
    expect(plan("TIME_ONLY").modules).toEqual(["TIME_KIOSK"]);
  });

  it("ist günstiger als Starter und steht in der Liste davor", () => {
    const idxTime = PLANS.findIndex((p) => p.key === "TIME_ONLY");
    const idxStarter = PLANS.findIndex((p) => p.key === "STARTER");
    expect(idxTime).toBeGreaterThanOrEqual(0);
    expect(idxTime).toBeLessThan(idxStarter);
  });

  it("has monotonic pricing", () => {
    expect(plan("TIME_ONLY").priceUSD!).toBeLessThan(plan("STARTER").priceUSD!);
  });
});

describe("PLAN_KEYS (Single Source of Truth für z.enum-Validierung)", () => {
  it("spiegelt exakt die PLANS-Keys in Reihenfolge", () => {
    expect(PLAN_KEYS).toEqual(PLANS.map((p) => p.key));
  });

  it("enthält den neuen Plan", () => {
    expect(PLAN_KEYS).toContain("TIME_ONLY");
  });
});
