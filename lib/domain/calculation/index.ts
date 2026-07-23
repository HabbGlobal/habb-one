// Pure calculation functions for the habb global ERP.
//
// Reading rules:
//   - All functions are PURE — no DB calls, no Date.now(), no network.
//   - The caller injects a SystemParameterMap (live or snapshot).
//   - No hardcoded process times, multipliers, or rates. EVER.
//   - Functions are < 30 lines each (briefing rule).
//
// Cf. docs/parameters.md for snapshot semantics.

import type {
  Material,
  Complexity,
  ProcessCode,
  MachineType,
} from "@prisma/client";
import type { SystemParameterMap } from "../parameters/store";

// ─────────────────────────────────────────
// Process step duration
// ─────────────────────────────────────────

const SURFACE_BASED_PROCESSES: ProcessCode[] = [
  "DEGREASE_MANUAL", "CHEM_PRETREAT", "MASKING", "MOUNTING",
  "BLAST_SA1", "BLAST_SA2", "BLAST_SA25", "BLAST_SA3", "BLAST_GLASS",
  "WP_PRIMER", "WP_SANDING", "WP_TOP_1K", "WP_TOP_2K", "WP_CLEAR",
  "PC_APPLICATION",
  "UNMASKING",
];

const BLASTING_AND_PRETREAT: ProcessCode[] = [
  "DEGREASE_MANUAL", "CHEM_PRETREAT",
  "BLAST_SA1", "BLAST_SA2", "BLAST_SA25", "BLAST_SA3", "BLAST_GLASS",
];

const COMPLEXITY_AFFECTED: ProcessCode[] = [
  "MASKING", "MOUNTING", "UNMASKING", "TOUCHUP",
];

interface ProcessStepInput {
  processCode: ProcessCode;
  surfaceM2: number;
  material: Material;
  complexity: Complexity;
  params: SystemParameterMap;
}

/**
 * Estimated minutes for a process step.
 *
 *   surface-based: ceil(surfaceM2 × baseMinPerM2 × materialFactor × complexityFactor)
 *   flat:          flatMinutes (multipliers ignored)
 *
 * Material factor only applied to BLASTING + PRE_TREATMENT codes.
 * Complexity factor only applied to MASKING/MOUNTING/UNMASKING/TOUCHUP.
 */
export function calcProcessStepMinutes(input: ProcessStepInput): number {
  const { processCode, surfaceM2, material, complexity, params } = input;

  if (SURFACE_BASED_PROCESSES.includes(processCode)) {
    const base = params.getNumber(`process.${processCode}.minutesPerM2`);
    const matFactor = BLASTING_AND_PRETREAT.includes(processCode)
      ? params.getNumber(`material.${material}.factor`)
      : 1.0;
    const cplxFactor = COMPLEXITY_AFFECTED.includes(processCode)
      ? params.getNumber(`complexity.${complexity}.factor`)
      : 1.0;
    return Math.ceil(surfaceM2 * base * matFactor * cplxFactor);
  }

  // Flat-rate step (DISASSEMBLY, QC, TOUCHUP, PACKAGING, PC_CURING, PC_DOUBLE)
  const flatBase = params.getInteger(`process.${processCode}.flatMinutes`);
  if (processCode === "TOUCHUP") {
    const factor = params.getNumber(`complexity.${complexity}.factor`);
    return Math.ceil(flatBase * factor);
  }
  return flatBase;
}

// ─────────────────────────────────────────
// Curing profile
// ─────────────────────────────────────────

export type PowderType = "polyester-standard" | "lowtemp" | "structure";

export interface CuringProfile {
  ovenTempC: number;
  heatupMinutes: number;
  cureMinutes: number;
  cooldownMinutes: number;
  /** total = heatup + cure + cooldown */
  totalMinutes: number;
}

interface CuringInput {
  powderType: PowderType;
  thicknessMm: number;
  params: SystemParameterMap;
}

/**
 * Returns the curing profile for a given powder type and material thickness.
 *
 *   heatup = baseHeatup + thicknessMm × heatupPerMm
 *   cure   = parameter
 *   cooldown = parameter
 */
export function calcCuringProfile(input: CuringInput): CuringProfile {
  const { powderType, thicknessMm, params } = input;
  const ovenTempC = params.getInteger(`curing.${powderType}.ovenTempC`);
  const baseHeatup = params.getInteger(`curing.${powderType}.heatupMinutes`);
  const cureMinutes = params.getInteger(`curing.${powderType}.cureMinutes`);
  const cooldownMinutes = params.getInteger(`curing.${powderType}.cooldownMinutes`);
  const heatupPerMm = params.getNumber("curing.global.heatupPerMm");

  const heatupMinutes = Math.ceil(baseHeatup + Math.max(0, thicknessMm) * heatupPerMm);
  return {
    ovenTempC,
    heatupMinutes,
    cureMinutes,
    cooldownMinutes,
    totalMinutes: heatupMinutes + cureMinutes + cooldownMinutes,
  };
}

// ─────────────────────────────────────────
// Order item price
// ─────────────────────────────────────────

export interface PriceStepInput {
  processCode: ProcessCode;
  estimatedMinutes: number;
  /** When set, the machine's hourly rate is used (`pricing.rate.machine.<TYPE>`). */
  machineType?: MachineType;
}

export interface PriceInput {
  steps: PriceStepInput[];
  params: SystemParameterMap;
  /** 0..100. Customer-specific default discount. */
  customerDiscountPct?: number;
  /** True when Priority=EXPRESS — adds the express surcharge. */
  isExpress: boolean;
  /**
   * When set (> 0), this fixed price per unit is used instead of the
   * effort-based step calculation (e.g. "10 railings @ 125.50"). Mirrors
   * the billing logic used for invoice generation — see docs/parameters.md.
   */
  fixedUnitPriceCHF?: number | null;
}

export interface PriceResult {
  /** Sum of step costs at full rate. */
  netCHF: number;
  /** Express surcharge in CHF (already added to totalNetCHF). */
  expressSurchargeCHF: number;
  /** Discount in CHF (already subtracted from totalNetCHF). */
  discountCHF: number;
  /** Net total to bill (still excl. VAT). */
  totalNetCHF: number;
}

/**
 * Sums labor + machine cost for an order item, applying express surcharge
 * and customer discount in the briefing-defined order:
 *
 *   net      = Σ steps
 *   express  = isExpress ? net × pct/100 : 0
 *   discount = (net + express) × customerDiscountPct/100
 *   total    = net + express − discount
 */
export function calcOrderItemPrice(input: PriceInput): PriceResult {
  const { steps, params, customerDiscountPct = 0, isExpress, fixedUnitPriceCHF } = input;

  if (fixedUnitPriceCHF != null && fixedUnitPriceCHF > 0) {
    return {
      netCHF: fixedUnitPriceCHF,
      expressSurchargeCHF: 0,
      discountCHF: 0,
      totalNetCHF: fixedUnitPriceCHF,
    };
  }

  const laborRate = params.getCurrency("pricing.rate.labor.standard");

  let netCHF = 0;
  for (const s of steps) {
    const rate = s.machineType
      ? params.getCurrency(`pricing.rate.machine.${s.machineType}`)
      : laborRate;
    netCHF += (s.estimatedMinutes / 60) * rate;
  }
  netCHF = round2(netCHF);

  const expressPct = isExpress
    ? params.getPercent("pricing.surcharge.express.percent")
    : 0;
  const expressSurchargeCHF = round2((netCHF * expressPct) / 100);

  const grossBeforeDiscount = netCHF + expressSurchargeCHF;
  const discountCHF = round2((grossBeforeDiscount * customerDiscountPct) / 100);

  const totalNetCHF = round2(grossBeforeDiscount - discountCHF);
  return { netCHF, expressSurchargeCHF, discountCHF, totalNetCHF };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
