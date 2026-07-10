// Compute a meaningful "before vs. after" preview for a single parameter
// change. Pure — no DB/network. Receives the current parameter map plus the
// proposed override and returns a human-readable diff line.

import {
  buildParameterMap,
  buildParameterMapFromSnapshot,
  type SystemParameterMap,
} from "@/lib/domain/parameters/store";
import {
  calcCuringProfile,
  calcOrderItemPrice,
  calcProcessStepMinutes,
  type PowderType,
} from "@/lib/domain/calculation";
import type { Material, Complexity, ProcessCode, MachineType } from "@prisma/client";

const SAMPLE_M2 = 10;
const SAMPLE_MATERIAL: Material = "STEEL_S235";
const SAMPLE_COMPLEXITY: Complexity = "NORMAL";
const SAMPLE_THICKNESS_MM = 5;
const SAMPLE_LABOR_MINUTES = 60;

/**
 * Builds a SystemParameterMap from the live row set and an optional
 * single-key override (the value the user is proposing in the editor).
 */
function mapWithOverride(
  rows: { key: string; currentValue: string }[],
  override?: { key: string; value: string },
): SystemParameterMap {
  if (!override) return buildParameterMap(rows);
  const merged = rows.map((r) =>
    r.key === override.key ? { ...r, currentValue: override.value } : r,
  );
  if (!rows.some((r) => r.key === override.key)) {
    merged.push({ key: override.key, currentValue: override.value });
  }
  return buildParameterMap(merged);
}

export interface PreviewResult {
  /** Short human-readable summary (e.g. "Bei 10 m² Stahl S235, Sa 2.5: 75 → 80 Min (+6.7%)"). */
  summary: string;
  /** Numeric delta in the unit of the underlying calculation. */
  deltaText: string;
  /** Optional context line (sample inputs used). */
  sample: string;
}

/**
 * Returns null when no formula matches the parameter — the UI should fall
 * back to a plain numeric "vorher → nachher" line in that case.
 */
export function computePreview(args: {
  paramKey: string;
  rows: { key: string; currentValue: string }[];
  newValue: string;
  currency?: string;
  locale?: string;
}): PreviewResult | null {
  const { paramKey, rows, newValue, currency = "CHF", locale = "de-CH" } = args;
  const before = mapWithOverride(rows);
  const after = mapWithOverride(rows, { key: paramKey, value: newValue });

  // process.<CODE>.minutesPerM2
  const procPerM2 = /^process\.([A-Z_]+)\.minutesPerM2$/.exec(paramKey);
  if (procPerM2) {
    const code = procPerM2[1] as ProcessCode;
    return previewProcessStep(code, before, after);
  }

  // process.<CODE>.flatMinutes
  const procFlat = /^process\.([A-Z_]+)\.flatMinutes$/.exec(paramKey);
  if (procFlat) {
    const code = procFlat[1] as ProcessCode;
    return previewProcessStep(code, before, after);
  }

  // material.<X>.factor — preview against blasting
  const matFactor = /^material\.([A-Z_]+)\.factor$/.exec(paramKey);
  if (matFactor) {
    return previewProcessStep(
      "BLAST_SA25",
      before,
      after,
      `Example: 10 m² ${matFactor[1]}, Sa 2.5, Complexity NORMAL`,
      matFactor[1] as Material,
    );
  }

  // complexity.<X>.factor — preview against MASKING
  const cplxFactor = /^complexity\.([A-Z_]+)\.factor$/.exec(paramKey);
  if (cplxFactor) {
    return previewProcessStep(
      "MASKING",
      before,
      after,
      `Example: 10 m² steel S235, masking, complexity ${cplxFactor[1]}`,
      "STEEL_S235",
      cplxFactor[1] as Complexity,
    );
  }

  // curing.<sub>.* → compute total profile minutes
  const curingMatch = /^curing\.([a-z-]+)\./.exec(paramKey);
  if (curingMatch && curingMatch[1] !== "global") {
    const sub = curingMatch[1] as PowderType;
    try {
      const a = calcCuringProfile({
        powderType: sub,
        thicknessMm: SAMPLE_THICKNESS_MM,
        params: before,
      });
      const b = calcCuringProfile({
        powderType: sub,
        thicknessMm: SAMPLE_THICKNESS_MM,
        params: after,
      });
      return diffMinutes(
        `Example: ${sub}, ${SAMPLE_THICKNESS_MM} mm material thickness`,
        a.totalMinutes,
        b.totalMinutes,
        "Total curing",
      );
    } catch {
      return null;
    }
  }

  // pricing.rate.* → CHF for a 60-min step
  const machineRate = /^pricing\.rate\.machine\.([A-Z_]+)$/.exec(paramKey);
  if (machineRate) {
    const type = machineRate[1] as MachineType;
    const a = calcOrderItemPrice({
      steps: [
        { processCode: "PC_APPLICATION", estimatedMinutes: SAMPLE_LABOR_MINUTES, machineType: type },
      ],
      params: before,
      isExpress: false,
    });
    const b = calcOrderItemPrice({
      steps: [
        { processCode: "PC_APPLICATION", estimatedMinutes: SAMPLE_LABOR_MINUTES, machineType: type },
      ],
      params: after,
      isExpress: false,
    });
    return diffCHF(`Example: 60 min machine time on ${type}`, a.netCHF, b.netCHF, currency, locale);
  }
  if (paramKey === "pricing.rate.labor.standard") {
    const a = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: SAMPLE_LABOR_MINUTES }],
      params: before,
      isExpress: false,
    });
    const b = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: SAMPLE_LABOR_MINUTES }],
      params: after,
      isExpress: false,
    });
    return diffCHF("Example: 60 min employee hourly rate", a.netCHF, b.netCHF, currency, locale);
  }
  if (paramKey === "pricing.surcharge.express.percent") {
    // 100 CHF order → express surcharge
    const a = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 60 }],
      params: before,
      isExpress: true,
    });
    const b = calcOrderItemPrice({
      steps: [{ processCode: "MOUNTING", estimatedMinutes: 60 }],
      params: after,
      isExpress: true,
    });
    return diffCHF(
      "Example: 1-hour order express",
      a.totalNetCHF,
      b.totalNetCHF,
      currency,
      locale,
    );
  }

  return null;
}

function previewProcessStep(
  code: ProcessCode,
  before: SystemParameterMap,
  after: SystemParameterMap,
  sample = `Example: 10 m² steel S235, ${code}, complexity NORMAL`,
  material: Material = SAMPLE_MATERIAL,
  complexity: Complexity = SAMPLE_COMPLEXITY,
): PreviewResult | null {
  try {
    const a = calcProcessStepMinutes({
      processCode: code,
      surfaceM2: SAMPLE_M2,
      material,
      complexity,
      params: before,
    });
    const b = calcProcessStepMinutes({
      processCode: code,
      surfaceM2: SAMPLE_M2,
      material,
      complexity,
      params: after,
    });
    return diffMinutes(sample, a, b);
  } catch {
    return null;
  }
}

function diffMinutes(sample: string, before: number, after: number, label = "Step duration"): PreviewResult {
  const delta = after - before;
  const pct = before === 0 ? 0 : (delta / before) * 100;
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
  return {
    summary: `${label}: ${before} → ${after} min (${sign}${delta} min, ${formatPct(pct)})`,
    deltaText: `${sign}${delta} min`,
    sample,
  };
}

function diffCHF(sample: string, before: number, after: number, currency: string, locale: string): PreviewResult {
  const delta = after - before;
  const pct = before === 0 ? 0 : (delta / before) * 100;
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
  return {
    summary: `${formatCHF(before, currency, locale)} → ${formatCHF(after, currency, locale)} (${sign}${formatCHF(delta, currency, locale)}, ${formatPct(pct)})`,
    deltaText: `${sign}${formatCHF(delta, currency, locale)}`,
    sample,
  };
}

function formatPct(p: number): string {
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)} %`;
}

function formatCHF(n: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(n);
}

// `buildParameterMapFromSnapshot` re-exported so callers can compose with
// snapshot-mode previews if needed.
export { buildParameterMapFromSnapshot };
