// All system-parameter seeds for the Tschannen ERP. Single source of
// truth for the values listed in the briefing's Sektion 2 — every default
// time, oven temperature, multiplier, and rate lives here. Code MUST NOT
// hardcode any of these values; it loads them through the parameter store
// (`lib/domain/parameters/store.ts`).

import type { ParamCategory, ParamValueType } from "@prisma/client";

export interface ParameterSeed {
  key: string;
  category: ParamCategory;
  subCategory?: string;
  label: string;
  description?: string;
  valueType: ParamValueType;
  defaultValue: number | string | boolean;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  affectsFormula?: string;
}

// ─────────────────────────────────────────
// PROCESS_TIME — Standardzeiten je ProcessCode (Min/m²)
// ─────────────────────────────────────────
const PROCESS_TIMES: Array<[code: string, defaultMin: number, label: string]> = [
  // Vorbereitung
  ["DEGREASE_MANUAL", 1.5, "Entfettung manuell — Min/m²"],
  ["CHEM_PRETREAT",   2.0, "Chemische Vorbehandlung — Min/m²"],
  ["MASKING",         4.0, "Maskieren / Abkleben — Min/m²"],
  ["MOUNTING",        1.0, "Aufhängen / Bestücken — Min/m²"],
  // Sandstrahlen
  ["BLAST_SA1",        3.0, "Strahlen Sa 1 (leicht) — Min/m²"],
  ["BLAST_SA2",        5.0, "Strahlen Sa 2 (gründlich) — Min/m²"],
  ["BLAST_SA25",       7.5, "Strahlen Sa 2.5 (sehr gründlich) — Min/m²"],
  ["BLAST_SA3",       12.0, "Strahlen Sa 3 (Reinmetall) — Min/m²"],
  ["BLAST_GLASS",      4.5, "Glasperlenstrahlen — Min/m²"],
  // Nasslackieren
  ["WP_PRIMER",        2.0, "Grundierung Nasslack — Min/m²"],
  ["WP_SANDING",       3.0, "Zwischenschliff — Min/m²"],
  ["WP_TOP_1K",        2.5, "Decklack 1K — Min/m²"],
  ["WP_TOP_2K",        2.5, "Decklack 2K — Min/m²"],
  ["WP_CLEAR",         2.0, "Klarlack — Min/m²"],
  // Pulverbeschichtung
  ["PC_APPLICATION",   1.5, "Pulverauftrag — Min/m²"],
  // Nachbereitung
  ["UNMASKING",        2.0, "Demaskieren — Min/m²"],
];

// Pauschalen ohne Min/m² (Demontage, QC, Touchup, Packaging, Curing)
// werden über `process.<CODE>.flatMinutes` modelliert.
const PROCESS_FLAT_MINUTES: Array<[code: string, defaultMin: number, label: string]> = [
  ["DISASSEMBLY",     20, "Demontage — Pauschale Min/Auftrag"],
  ["QUALITY_CHECK",   10, "Qualitätskontrolle — Pauschale Min/Position"],
  ["TOUCHUP",         15, "Nacharbeit Touch-up — Pauschale Min/Position"],
  ["PACKAGING",       10, "Verpackung — Pauschale Min/Position"],
  ["PC_CURING",       20, "Aushärten Pulver — Pauschale Min/Charge"],
  ["PC_DOUBLE",       40, "Doppelbeschichtung — Pauschale Min/Position"],
];

// ─────────────────────────────────────────
// CURING — Pulver-Aushärtungs-Profile
// ─────────────────────────────────────────
const CURING_PROFILES = [
  {
    sub: "polyester-standard",
    label: "Polyester Standard",
    ovenTempC: 180,
    cureMinutes: 15,
    heatupMinutes: 10,
    cooldownMinutes: 30,
  },
  {
    sub: "lowtemp",
    label: "Niedertemperatur-Pulver",
    ovenTempC: 140,
    cureMinutes: 25,
    heatupMinutes: 12,
    cooldownMinutes: 30,
  },
  {
    sub: "structure",
    label: "Strukturpulver",
    ovenTempC: 200,
    cureMinutes: 20,
    heatupMinutes: 12,
    cooldownMinutes: 35,
  },
];

// ─────────────────────────────────────────
// DRYING — Trocknung Nasslack je Lacktyp + Modus
// ─────────────────────────────────────────
const DRYING_PROFILES: Array<[sub: string, modeRT: number, modeOven: number, label: string]> = [
  ["primer",     45,  20, "Grundierung — Trocknung"],
  ["top1k",      360, 30, "Decklack 1K — Trocknung"],
  ["top2k",      720, 30, "Decklack 2K — Trocknung"],
  ["clear",      360, 30, "Klarlack — Trocknung"],
];

// ─────────────────────────────────────────
// MATERIAL — Multiplikatoren auf Strahl-/Vorbehandlungszeit
// ─────────────────────────────────────────
const MATERIAL_FACTORS: Array<[material: string, factor: number, label: string]> = [
  ["STEEL_S235",    1.00, "Stahl S235 — Multiplikator (Referenz)"],
  ["STEEL_HIGH_C",  1.15, "Höher legierter Stahl — Multiplikator"],
  ["STAINLESS",     1.25, "Edelstahl — Multiplikator"],
  ["ALUMINIUM",     0.85, "Aluminium — Multiplikator"],
  ["GALVANIZED",    1.10, "Verzinkt — Multiplikator"],
  ["CAST_IRON",     1.30, "Guss — Multiplikator"],
  ["OTHER",         1.00, "Sonstiges Material — Multiplikator"],
];

// ─────────────────────────────────────────
// COMPLEXITY — Multiplikatoren für Maskieren/Touchup
// ─────────────────────────────────────────
const COMPLEXITY_FACTORS: Array<[level: string, factor: number, label: string]> = [
  ["SIMPLE",       0.8, "Komplexität Einfach"],
  ["NORMAL",       1.0, "Komplexität Normal"],
  ["COMPLEX",      1.4, "Komplexität Komplex"],
  ["VERY_COMPLEX", 1.8, "Komplexität Sehr komplex"],
];

// ─────────────────────────────────────────
// PRICING — Stundensätze, Zuschläge
// ─────────────────────────────────────────
const PRICING_RATES_MACHINE: Array<[type: string, rate: number, label: string]> = [
  ["BLAST_CABIN",  120, "Stundensatz Strahlkabine"],
  ["CHEM_BATH",     90, "Stundensatz Chemiebecken"],
  ["PAINT_CABIN",  140, "Stundensatz Lackierkabine"],
  ["POWDER_CABIN", 150, "Stundensatz Pulverkabine"],
  ["CURING_OVEN",   80, "Stundensatz Einbrennofen"],
  ["DRYING_OVEN",   80, "Stundensatz Trockenofen"],
];

// ─────────────────────────────────────────
// Compose
// ─────────────────────────────────────────
export const PARAMETER_SEEDS: ParameterSeed[] = [
  ...PROCESS_TIMES.map(([code, def, label]): ParameterSeed => ({
    key: `process.${code}.minutesPerM2`,
    category: "PROCESS_TIME",
    subCategory: code,
    label,
    valueType: "NUMBER",
    defaultValue: def,
    unit: "min/m²",
    minValue: 0.5, maxValue: 60, step: 0.1,
    affectsFormula: "calcProcessStepMinutes",
  })),
  ...PROCESS_FLAT_MINUTES.map(([code, def, label]): ParameterSeed => ({
    key: `process.${code}.flatMinutes`,
    category: "PROCESS_TIME",
    subCategory: code,
    label,
    valueType: "INTEGER",
    defaultValue: def,
    unit: "min",
    minValue: 1, maxValue: 240, step: 1,
    affectsFormula: "calcProcessStepMinutes (Pauschale)",
  })),
  // Curing-Profile (4 Werte je Profil)
  ...CURING_PROFILES.flatMap((p): ParameterSeed[] => [
    {
      key: `curing.${p.sub}.ovenTempC`,
      category: "CURING", subCategory: p.sub,
      label: `${p.label} — Ofentemperatur`,
      valueType: "TEMPERATURE_C", defaultValue: p.ovenTempC,
      unit: "°C", minValue: 100, maxValue: 250, step: 5,
    },
    {
      key: `curing.${p.sub}.cureMinutes`,
      category: "CURING", subCategory: p.sub,
      label: `${p.label} — Aushärtung bei Objekttemperatur`,
      valueType: "INTEGER", defaultValue: p.cureMinutes,
      unit: "min", minValue: 5, maxValue: 60, step: 1,
    },
    {
      key: `curing.${p.sub}.heatupMinutes`,
      category: "CURING", subCategory: p.sub,
      label: `${p.label} — Basis-Aufheizzeit`,
      valueType: "INTEGER", defaultValue: p.heatupMinutes,
      unit: "min", minValue: 0, maxValue: 60, step: 1,
    },
    {
      key: `curing.${p.sub}.cooldownMinutes`,
      category: "CURING", subCategory: p.sub,
      label: `${p.label} — Abkühlung`,
      valueType: "INTEGER", defaultValue: p.cooldownMinutes,
      unit: "min", minValue: 0, maxValue: 120, step: 5,
    },
  ]),
  {
    key: "curing.global.heatupPerMm",
    category: "CURING", subCategory: "global",
    label: "Zusatz-Aufheizzeit pro mm Materialdicke",
    valueType: "NUMBER", defaultValue: 1.0,
    unit: "min/mm", minValue: 0, maxValue: 5, step: 0.1,
    affectsFormula: "calcCuringProfile",
  },
  // Drying (RT + Ofen je Profil)
  ...DRYING_PROFILES.flatMap(([sub, rt, oven, label]): ParameterSeed[] => [
    {
      key: `drying.${sub}.rtMinutes`,
      category: "DRYING", subCategory: sub,
      label: `${label} bei Raumtemperatur`,
      valueType: "INTEGER", defaultValue: rt,
      unit: "min", minValue: 0, maxValue: 1440, step: 10,
    },
    {
      key: `drying.${sub}.ovenMinutes`,
      category: "DRYING", subCategory: sub,
      label: `${label} im Ofen`,
      valueType: "INTEGER", defaultValue: oven,
      unit: "min", minValue: 0, maxValue: 240, step: 5,
    },
  ]),
  // Material
  ...MATERIAL_FACTORS.map(([m, f, label]): ParameterSeed => ({
    key: `material.${m}.factor`,
    category: "MATERIAL", subCategory: m,
    label,
    valueType: "DECIMAL", defaultValue: f,
    unit: "Faktor", minValue: 0.3, maxValue: 3.0, step: 0.05,
    affectsFormula: "calcProcessStepMinutes (BLASTING + PRE_TREATMENT)",
  })),
  // Complexity
  ...COMPLEXITY_FACTORS.map(([c, f, label]): ParameterSeed => ({
    key: `complexity.${c}.factor`,
    category: "COMPLEXITY", subCategory: c,
    label,
    valueType: "DECIMAL", defaultValue: f,
    unit: "Faktor", minValue: 0.3, maxValue: 3.0, step: 0.1,
    affectsFormula: "calcProcessStepMinutes (MASKING/MOUNTING/UNMASKING/TOUCHUP)",
  })),
  // Stundensätze pro Maschinentyp
  ...PRICING_RATES_MACHINE.map(([t, r, label]): ParameterSeed => ({
    key: `pricing.rate.machine.${t}`,
    category: "PRICING_RATE", subCategory: t,
    label,
    valueType: "CURRENCY_CHF", defaultValue: r,
    unit: "CHF/h", minValue: 30, maxValue: 300, step: 5,
    affectsFormula: "calcOrderItemPrice",
  })),
  {
    key: "pricing.rate.labor.standard",
    category: "PRICING_RATE", subCategory: "labor",
    label: "Standard-Stundensatz Mitarbeiter",
    valueType: "CURRENCY_CHF", defaultValue: 95,
    unit: "CHF/h", minValue: 50, maxValue: 200, step: 5,
    affectsFormula: "calcOrderItemPrice",
  },
  // Surcharges
  {
    key: "pricing.surcharge.express.percent",
    category: "PRICING_SURCHARGE", subCategory: "express",
    label: "Express-Zuschlag",
    valueType: "PERCENTAGE", defaultValue: 35,
    unit: "%", minValue: 0, maxValue: 100, step: 5,
  },
  {
    key: "pricing.surcharge.minOrder.CHF",
    category: "PRICING_SURCHARGE", subCategory: "minOrder",
    label: "Mindestauftragswert",
    valueType: "CURRENCY_CHF", defaultValue: 80,
    unit: "CHF", minValue: 0, maxValue: 500, step: 10,
  },
  {
    key: "pricing.surcharge.delivery.CHF",
    category: "PRICING_SURCHARGE", subCategory: "delivery",
    label: "Anlieferungs-Pauschale",
    valueType: "CURRENCY_CHF", defaultValue: 0,
    unit: "CHF", minValue: 0, maxValue: 1000, step: 10,
  },
  // Scheduler
  {
    key: "scheduler.safetyBufferMinutes",
    category: "SCHEDULER", subCategory: "buffer",
    label: "Sicherheitspuffer vor Liefertermin",
    valueType: "INTEGER", defaultValue: 240,
    unit: "min", minValue: 0, maxValue: 1440, step: 30,
    description:
      "Auto-Planer plant den letzten Schritt mindestens N Minuten vor `promisedAt`.",
  },
  {
    key: "scheduler.powderChangePenaltyMin",
    category: "SCHEDULER", subCategory: "switching",
    label: "Strafzeit Pulverwechsel",
    valueType: "INTEGER", defaultValue: 30,
    unit: "min", minValue: 0, maxValue: 120, step: 5,
  },
  {
    key: "scheduler.colorChangePenaltyMin",
    category: "SCHEDULER", subCategory: "switching",
    label: "Strafzeit Farbwechsel",
    valueType: "INTEGER", defaultValue: 20,
    unit: "min", minValue: 0, maxValue: 120, step: 5,
  },
  // Tax
  {
    key: "tax.vat.standard.percent",
    category: "TAX", subCategory: "standard",
    label: "MwSt Normalsatz CH",
    valueType: "PERCENTAGE", defaultValue: 8.10,
    unit: "%", minValue: 0, maxValue: 25, step: 0.05,
    description: "Aktuell 8.1 % seit 01.01.2024.",
  },
  {
    key: "tax.vat.reduced.percent",
    category: "TAX", subCategory: "reduced",
    label: "MwSt reduzierter Satz CH",
    valueType: "PERCENTAGE", defaultValue: 2.60,
    unit: "%", minValue: 0, maxValue: 25, step: 0.05,
  },
  {
    key: "tax.vat.special.percent",
    category: "TAX", subCategory: "special",
    label: "MwSt Sondersatz CH (Beherbergung)",
    valueType: "PERCENTAGE", defaultValue: 3.80,
    unit: "%", minValue: 0, maxValue: 25, step: 0.05,
  },
  // Working hours / 2K pot life
  {
    key: "process.WP_TOP_2K.potLifeHours",
    category: "WORKING_HOURS", subCategory: "potLife",
    label: "Topfzeit 2K-Lacke",
    valueType: "INTEGER", defaultValue: 6,
    unit: "h", minValue: 1, maxValue: 24, step: 1,
    description:
      "Maximale Verarbeitungszeit nach Anmischung — Material verfällt danach.",
  },
];
