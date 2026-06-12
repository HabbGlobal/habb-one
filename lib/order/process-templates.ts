// Standard-Prozessvorlagen + Ressourcen-Mapping pro ProcessCode.
//
// habb global-spezifische Vorlagen aus Sektion 2.1 des Briefings. Beim Wizard
// kann der User eine Vorlage anwenden (= Steps mit Default-Reihenfolge,
// Skill, MachineType anlegen) und danach einzelne Schritte editieren.

import type { ProcessCode, MachineType, SkillCode } from "@prisma/client";

// ─────────────────────────────────────────
// Pro ProcessCode:  Skill + (optional) Maschinentyp
// ─────────────────────────────────────────

export interface ProcessResources {
  skill: SkillCode;
  machine: MachineType | null;
  /** Default-Wartezeit (Trocknung/Aushärtung) — wird vom Calc-Engine
   *  überschrieben, wenn ein Curing-Profil greift. */
  defaultWaitMinutes: number;
}

export const PROCESS_RESOURCES: Record<ProcessCode, ProcessResources> = {
  // Vorbereitung
  DISASSEMBLY: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
  DEGREASE_MANUAL: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
  CHEM_PRETREAT: { skill: "PREP", machine: "CHEM_BATH", defaultWaitMinutes: 30 },
  MASKING: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
  MOUNTING: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
  // Sandstrahlen
  BLAST_SA1: { skill: "BLASTER", machine: "BLAST_CABIN", defaultWaitMinutes: 0 },
  BLAST_SA2: { skill: "BLASTER", machine: "BLAST_CABIN", defaultWaitMinutes: 0 },
  BLAST_SA25: { skill: "BLASTER", machine: "BLAST_CABIN", defaultWaitMinutes: 0 },
  BLAST_SA3: { skill: "BLASTER", machine: "BLAST_CABIN", defaultWaitMinutes: 0 },
  BLAST_GLASS: { skill: "BLASTER", machine: "BLAST_CABIN", defaultWaitMinutes: 0 },
  // Nasslackieren
  WP_PRIMER: { skill: "PAINTER", machine: "PAINT_CABIN", defaultWaitMinutes: 60 },
  WP_SANDING: { skill: "PAINTER", machine: null, defaultWaitMinutes: 0 },
  WP_TOP_1K: { skill: "PAINTER", machine: "PAINT_CABIN", defaultWaitMinutes: 240 },
  WP_TOP_2K: { skill: "PAINTER", machine: "PAINT_CABIN", defaultWaitMinutes: 720 },
  WP_CLEAR: { skill: "PAINTER", machine: "PAINT_CABIN", defaultWaitMinutes: 240 },
  // Pulverbeschichtung
  PC_APPLICATION: { skill: "POWDER_COATER", machine: "POWDER_CABIN", defaultWaitMinutes: 0 },
  PC_CURING: { skill: "POWDER_COATER", machine: "CURING_OVEN", defaultWaitMinutes: 30 },
  PC_DOUBLE: { skill: "POWDER_COATER", machine: "POWDER_CABIN", defaultWaitMinutes: 0 },
  // Nachbereitung
  UNMASKING: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
  QUALITY_CHECK: { skill: "QC", machine: null, defaultWaitMinutes: 0 },
  TOUCHUP: { skill: "PAINTER", machine: null, defaultWaitMinutes: 0 },
  PACKAGING: { skill: "PREP", machine: null, defaultWaitMinutes: 0 },
};

// ─────────────────────────────────────────
// Vorlagen — Liste benannter Workflow-Sequenzen
// ─────────────────────────────────────────

export interface ProcessTemplate {
  id: string;
  label: string;
  description: string;
  /** Reihenfolge der Schritte. Sequence wird automatisch in 10er-Schritten
   *  vergeben (10, 20, 30, ...). */
  steps: ProcessCode[];
}

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: "powder-standard",
    label: "Standard powder coating",
    description: "Sandblasting Sa 2.5 → Powder application → Curing — typical steel part.",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "MASKING",
      "MOUNTING",
      "PC_APPLICATION",
      "PC_CURING",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
  {
    id: "powder-double",
    label: "Powder — 2-layer",
    description: "Two powder layers with two curings.",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "MASKING",
      "MOUNTING",
      "PC_APPLICATION",
      "PC_CURING",
      "PC_DOUBLE",
      "PC_CURING",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
  {
    id: "wet-1k",
    label: "Wet painting 1K",
    description: "Sandblasting → Primer → Topcoat 1K — simple wet painting.",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "MASKING",
      "WP_PRIMER",
      "WP_SANDING",
      "WP_TOP_1K",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
  {
    id: "wet-2k",
    label: "Wet painting 2K",
    description: "High-quality 2K paint with clear coat.",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "MASKING",
      "WP_PRIMER",
      "WP_SANDING",
      "WP_TOP_2K",
      "WP_CLEAR",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
  {
    id: "blast-only",
    label: "Sandblasting only",
    description: "Pure sandblasting treatment without coating.",
    steps: ["BLAST_SA25", "QUALITY_CHECK", "PACKAGING"],
  },
  {
    id: "chem-blast-powder",
    label: "Chemical pretreatment + Powder",
    description: "With phosphating — typical for aluminium and non-ferrous metals.",
    steps: [
      "DEGREASE_MANUAL",
      "CHEM_PRETREAT",
      "MASKING",
      "MOUNTING",
      "PC_APPLICATION",
      "PC_CURING",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
];

/**
 * Resolve a template by id, expanding each ProcessCode to a concrete
 * step-skeleton (sequence, skill, machine, default wait). Calculation of
 * `estimatedMinutes` happens in the calc engine — not here, since we don't
 * have surface/material/complexity at this stage.
 */
export function expandTemplate(templateId: string): {
  sequence: number;
  processCode: ProcessCode;
  skillRequired: SkillCode;
  machineTypeRequired: MachineType | null;
  waitMinutesAfter: number;
}[] {
  const tpl = PROCESS_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) throw new Error(`Unknown template: ${templateId}`);
  return tpl.steps.map((code, i) => {
    const r = PROCESS_RESOURCES[code];
    return {
      sequence: (i + 1) * 10,
      processCode: code,
      skillRequired: r.skill,
      machineTypeRequired: r.machine,
      waitMinutesAfter: r.defaultWaitMinutes,
    };
  });
}
