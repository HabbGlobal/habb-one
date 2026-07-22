// Unit tests for the pure calculation engine. Coverage target ≥ 90 %
// (briefing requirement).

import { describe, expect, it } from "vitest";
import {
  calcCuringProfile,
  calcOrderItemPrice,
  calcProcessStepMinutes,
  type PriceInput,
} from "./index";
import { buildParameterMap } from "../parameters/store";
import { PARAMETER_SEEDS } from "../parameters/seeds";

/** Build a SystemParameterMap from the seed defaults (used as the
 *  fixture for "default-config" assertions). */
function buildDefaultMap() {
  return buildParameterMap(
    PARAMETER_SEEDS.map((s) => ({
      key: s.key,
      currentValue: String(s.defaultValue),
    }))
  );
}

describe("calcProcessStepMinutes", () => {
  const params = buildDefaultMap();

  it("computes surface-based blasting time × material × complexity", () => {
    // BLAST_SA25 = 7.5 min/m², STAINLESS = 1.25, NORMAL complexity = 1.0
    // 10 m² × 7.5 × 1.25 × 1.0 = 93.75 → ceil = 94
    expect(
      calcProcessStepMinutes({
        processCode: "BLAST_SA25",
        surfaceM2: 10,
        material: "STAINLESS",
        complexity: "NORMAL",
        params,
      })
    ).toBe(94);
  });

  it("ignores material factor for non-blasting processes", () => {
    // WP_TOP_2K = 2.5 min/m², STAINLESS factor MUST NOT apply
    // 5 m² × 2.5 × 1.0 (no mat) × 1.0 (no cplx) = 12.5 → 13
    expect(
      calcProcessStepMinutes({
        processCode: "WP_TOP_2K",
        surfaceM2: 5,
        material: "STAINLESS",
        complexity: "NORMAL",
        params,
      })
    ).toBe(13);
  });

  it("applies complexity factor to MASKING", () => {
    // MASKING = 4 min/m², COMPLEX = 1.4
    // 3 m² × 4 × 1.4 = 16.8 → 17
    expect(
      calcProcessStepMinutes({
        processCode: "MASKING",
        surfaceM2: 3,
        material: "STEEL_S235",
        complexity: "COMPLEX",
        params,
      })
    ).toBe(17);
  });

  it("returns flat minutes for QUALITY_CHECK regardless of surface", () => {
    expect(
      calcProcessStepMinutes({
        processCode: "QUALITY_CHECK",
        surfaceM2: 100,
        material: "STEEL_S235",
        complexity: "NORMAL",
        params,
      })
    ).toBe(10); // seed default
  });

  it("applies complexity to TOUCHUP flat minutes", () => {
    // TOUCHUP flat = 15 min, VERY_COMPLEX = 1.8 → 27
    expect(
      calcProcessStepMinutes({
        processCode: "TOUCHUP",
        surfaceM2: 0,
        material: "STEEL_S235",
        complexity: "VERY_COMPLEX",
        params,
      })
    ).toBe(27);
  });

  it("aluminium speeds blasting (factor 0.85)", () => {
    // BLAST_SA2 = 5 min/m², ALU = 0.85
    // 4 m² × 5 × 0.85 = 17 → 17
    expect(
      calcProcessStepMinutes({
        processCode: "BLAST_SA2",
        surfaceM2: 4,
        material: "ALUMINIUM",
        complexity: "NORMAL",
        params,
      })
    ).toBe(17);
  });

  it("throws when a parameter is missing", () => {
    const empty = buildParameterMap([]);
    expect(() =>
      calcProcessStepMinutes({
        processCode: "BLAST_SA1",
        surfaceM2: 1,
        material: "STEEL_S235",
        complexity: "NORMAL",
        params: empty,
      })
    ).toThrow(/SystemParameter not found/);
  });
});

describe("calcCuringProfile", () => {
  const params = buildDefaultMap();

  it("polyester-standard at 5 mm thickness", () => {
    // baseHeatup = 10, heatupPerMm = 1.0 → heatup = 15
    // cure = 15, cooldown = 30 → total 60, ovenTempC = 180
    const p = calcCuringProfile({
      powderType: "polyester-standard",
      thicknessMm: 5,
      params,
    });
    expect(p).toEqual({
      ovenTempC: 180,
      heatupMinutes: 15,
      cureMinutes: 15,
      cooldownMinutes: 30,
      totalMinutes: 60,
    });
  });

  it("lowtemp profile uses its own values", () => {
    const p = calcCuringProfile({ powderType: "lowtemp", thicknessMm: 0, params });
    expect(p.ovenTempC).toBe(140);
    expect(p.cureMinutes).toBe(25);
  });

  it("structure profile at 0 mm = no extra heatup", () => {
    const p = calcCuringProfile({ powderType: "structure", thicknessMm: 0, params });
    expect(p.heatupMinutes).toBe(12); // base only
  });

  it("clamps negative thickness to 0", () => {
    const p = calcCuringProfile({
      powderType: "polyester-standard",
      thicknessMm: -3,
      params,
    });
    expect(p.heatupMinutes).toBe(10); // base only
  });
});

describe("calcOrderItemPrice", () => {
  const params = buildDefaultMap();

  it("sums labor + machine rates correctly", () => {
    // Labor: 60 min × 95 CHF/h = 95
    // Machine BLAST_CABIN: 30 min × 120 = 60
    // Net = 155
    const r = calcOrderItemPrice({
      steps: [
        { processCode: "MOUNTING", estimatedMinutes: 60 },
        {
          processCode: "BLAST_SA25",
          estimatedMinutes: 30,
          machineType: "BLAST_CABIN",
        },
      ],
      params,
      isExpress: false,
    });
    expect(r.netCHF).toBe(155);
    expect(r.totalNetCHF).toBe(155);
    expect(r.expressSurchargeCHF).toBe(0);
    expect(r.discountCHF).toBe(0);
  });

  it("applies express surcharge BEFORE discount", () => {
    // Steps net = 100. Express 35 % = 35. Subtotal 135.
    // Customer discount 10 % of 135 = 13.50 → total = 121.50
    const r = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 60, machineType: undefined }],
      params: buildParameterMap([
        ...PARAMETER_SEEDS.filter((s) => s.key !== "pricing.rate.labor.standard")
          .map((s) => ({ key: s.key, currentValue: String(s.defaultValue) })),
        { key: "pricing.rate.labor.standard", currentValue: "100" },
      ]),
      isExpress: true,
      customerDiscountPct: 10,
    });
    expect(r.netCHF).toBe(100);
    expect(r.expressSurchargeCHF).toBe(35);
    expect(r.discountCHF).toBe(13.5);
    expect(r.totalNetCHF).toBe(121.5);
  });

  it("rounds to 2 decimals throughout", () => {
    const r = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 7 }], // 7/60 × 95 = 11.083…
      params,
      isExpress: false,
    });
    expect(r.netCHF).toBe(11.08);
  });

  it("handles empty step list", () => {
    const r = calcOrderItemPrice({
      steps: [],
      params,
      isExpress: false,
    });
    expect(r.netCHF).toBe(0);
    expect(r.totalNetCHF).toBe(0);
  });

  it("uses machine rate when machineType set", () => {
    // Powder cabin = 150 CHF/h, 60 min = 150
    const r = calcOrderItemPrice({
      steps: [
        { processCode: "PC_APPLICATION", estimatedMinutes: 60, machineType: "POWDER_CABIN" },
      ],
      params,
      isExpress: false,
    });
    expect(r.netCHF).toBe(150);
  });

  it("uses fixedUnitPriceCHF and ignores step effort when set", () => {
    // Regression test for issue #34: unitPriceCHF was silently dropped.
    const r = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 60 }], // would be 95 CHF effort-based
      params,
      isExpress: true,
      customerDiscountPct: 10,
      fixedUnitPriceCHF: 100,
    });
    expect(r.netCHF).toBe(100);
    expect(r.expressSurchargeCHF).toBe(0);
    expect(r.discountCHF).toBe(0);
    expect(r.totalNetCHF).toBe(100);
  });

  it("falls back to effort-based pricing when fixedUnitPriceCHF is null or 0", () => {
    const base: PriceInput = {
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 60 }],
      params,
      isExpress: false,
    };
    const withNull = calcOrderItemPrice({ ...base, fixedUnitPriceCHF: null });
    const withZero = calcOrderItemPrice({ ...base, fixedUnitPriceCHF: 0 });
    const withoutField = calcOrderItemPrice(base);
    expect(withNull.totalNetCHF).toBe(95);
    expect(withZero.totalNetCHF).toBe(95);
    expect(withoutField.totalNetCHF).toBe(95);
  });
});
