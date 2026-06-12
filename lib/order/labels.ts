// English labels for all ERP domain enums.
//
// Single source of truth for UI, PDF, and Reports. Raw codes are used in code
// for logic/DB, but NEVER passed directly to the user — always via these maps.

import type {
  ProcessCode,
  MachineType,
  SkillCode,
  Material,
  Complexity,
  ColorSystem,
  GlossLevel,
  StepStatus,
} from "@prisma/client";

// ─────────────────────────────────────────
// ProcessCode — Processing Steps
// ─────────────────────────────────────────

/** Long, descriptive label for UI/PDF. */
export const PROCESS_LABEL: Record<ProcessCode, string> = {
  // Preparation
  DISASSEMBLY:      "Disassembly",
  DEGREASE_MANUAL:  "Degreasing (manual)",
  CHEM_PRETREAT:    "Chemical Pre-treatment",
  MASKING:          "Masking",
  MOUNTING:         "Mounting / Hanging",
  // Sandblasting
  BLAST_SA1:        "Sandblasting Sa 1 (light)",
  BLAST_SA2:        "Sandblasting Sa 2 (thorough)",
  BLAST_SA25:       "Sandblasting Sa 2.5 (very thorough)",
  BLAST_SA3:        "Sandblasting Sa 3 (bare metal)",
  BLAST_GLASS:      "Glass Bead Blasting",
  // Wet Painting
  WP_PRIMER:        "Apply Primer",
  WP_SANDING:       "Intermediate Sanding",
  WP_TOP_1K:        "Top Coat 1K (single component)",
  WP_TOP_2K:        "Top Coat 2K (two component)",
  WP_CLEAR:         "Clear Coat",
  // Powder Coating
  PC_APPLICATION:   "Apply Powder",
  PC_CURING:        "Powder Curing",
  PC_DOUBLE:        "Second Powder Layer",
  // Post-processing
  UNMASKING:        "Remove Masking",
  QUALITY_CHECK:    "Quality Control",
  TOUCHUP:          "Touch-up",
  PACKAGING:        "Packaging",
};

/** Short variant for narrow columns / labels. */
export const PROCESS_LABEL_SHORT: Record<ProcessCode, string> = {
  DISASSEMBLY:      "Disassembly",
  DEGREASE_MANUAL:  "Degrease",
  CHEM_PRETREAT:    "Chem. Pretreat",
  MASKING:          "Masking",
  MOUNTING:         "Mounting",
  BLAST_SA1:        "Sa 1",
  BLAST_SA2:        "Sa 2",
  BLAST_SA25:       "Sa 2.5",
  BLAST_SA3:        "Sa 3",
  BLAST_GLASS:      "Glass Beads",
  WP_PRIMER:        "Primer",
  WP_SANDING:       "Sanding",
  WP_TOP_1K:        "Top Coat 1K",
  WP_TOP_2K:        "Top Coat 2K",
  WP_CLEAR:         "Clear Coat",
  PC_APPLICATION:   "Apply Powder",
  PC_CURING:        "Curing",
  PC_DOUBLE:        "Powder 2nd Layer",
  UNMASKING:        "Unmask",
  QUALITY_CHECK:    "QC",
  TOUCHUP:          "Touch-up",
  PACKAGING:        "Packaging",
};

/** Grouping for group dropdowns. */
export const PROCESS_GROUP: Record<ProcessCode, "Preparation" | "Sandblasting" | "Wet Painting" | "Powder Coating" | "Post-processing"> = {
  DISASSEMBLY: "Preparation",
  DEGREASE_MANUAL: "Preparation",
  CHEM_PRETREAT: "Preparation",
  MASKING: "Preparation",
  MOUNTING: "Preparation",
  BLAST_SA1: "Sandblasting",
  BLAST_SA2: "Sandblasting",
  BLAST_SA25: "Sandblasting",
  BLAST_SA3: "Sandblasting",
  BLAST_GLASS: "Sandblasting",
  WP_PRIMER: "Wet Painting",
  WP_SANDING: "Wet Painting",
  WP_TOP_1K: "Wet Painting",
  WP_TOP_2K: "Wet Painting",
  WP_CLEAR: "Wet Painting",
  PC_APPLICATION: "Powder Coating",
  PC_CURING: "Powder Coating",
  PC_DOUBLE: "Powder Coating",
  UNMASKING: "Post-processing",
  QUALITY_CHECK: "Post-processing",
  TOUCHUP: "Post-processing",
  PACKAGING: "Post-processing",
};

export function processLabel(code: ProcessCode): string {
  return PROCESS_LABEL[code] ?? code;
}
export function processLabelShort(code: ProcessCode): string {
  return PROCESS_LABEL_SHORT[code] ?? code;
}

// ─────────────────────────────────────────
// MachineType
// ─────────────────────────────────────────

export const MACHINE_LABEL: Record<MachineType, string> = {
  BLAST_CABIN:  "Blast Cabin",
  CHEM_BATH:    "Chemical Bath",
  PAINT_CABIN:  "Paint Cabin",
  POWDER_CABIN: "Powder Cabin",
  CURING_OVEN:  "Curing Oven",
  DRYING_OVEN:  "Drying Oven",
};

export function machineLabel(t: MachineType | null | undefined): string {
  if (!t) return "—";
  return MACHINE_LABEL[t] ?? t;
}

// ─────────────────────────────────────────
// SkillCode — Employee Qualification
// ─────────────────────────────────────────

export const SKILL_LABEL: Record<SkillCode, string> = {
  PREP:            "Preparation & Post-processing",
  BLASTER:         "Sandblaster",
  PAINTER:         "Painter",
  POWDER_COATER:   "Powder Coater",
  QC:              "Quality Control",
  TEAM_LEAD_SKILL: "Team Lead",
};

export function skillLabel(s: SkillCode): string {
  return SKILL_LABEL[s] ?? s;
}

// ─────────────────────────────────────────
// Material
// ─────────────────────────────────────────

export const MATERIAL_LABEL: Record<Material, string> = {
  STEEL_S235:   "Steel S235",
  STEEL_HIGH_C: "High-Carbon Steel",
  STAINLESS:    "Stainless Steel",
  ALUMINIUM:    "Aluminium",
  GALVANIZED:   "Galvanized Steel",
  CAST_IRON:    "Cast Iron",
  OTHER:        "Other Material",
};

export function materialLabel(m: Material): string {
  return MATERIAL_LABEL[m] ?? m;
}

// ─────────────────────────────────────────
// Complexity
// ─────────────────────────────────────────

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  SIMPLE:       "Simple",
  NORMAL:       "Normal",
  COMPLEX:      "Complex",
  VERY_COMPLEX: "Very Complex",
};

export function complexityLabel(c: Complexity): string {
  return COMPLEXITY_LABEL[c] ?? c;
}

// ─────────────────────────────────────────
// ColorSystem & GlossLevel
// ─────────────────────────────────────────

export const COLOR_SYSTEM_LABEL: Record<ColorSystem, string> = {
  RAL:     "RAL",
  NCS:     "NCS",
  PANTONE: "Pantone",
  CUSTOM:  "Custom",
};

export const GLOSS_LEVEL_LABEL: Record<GlossLevel, string> = {
  MATT:        "Matt",
  SEMI_GLOSS:  "Semi-Gloss",
  GLOSSY:      "Glossy",
  HIGH_GLOSS:  "High Gloss",
};

export function colorSystemLabel(c: ColorSystem | null | undefined): string {
  if (!c) return "";
  return COLOR_SYSTEM_LABEL[c] ?? c;
}

export function glossLevelLabel(g: GlossLevel | null | undefined): string {
  if (!g) return "";
  return GLOSS_LEVEL_LABEL[g] ?? g;
}

// ─────────────────────────────────────────
// ApplicationArea — Indoor/Outdoor/Both
// ─────────────────────────────────────────

export const APPLICATION_AREA_LABEL = {
  INDOOR: "Indoor",
  OUTDOOR: "Outdoor",
  BOTH: "Indoor + Outdoor",
} as const;

export function applicationAreaLabel(
  a: "INDOOR" | "OUTDOOR" | "BOTH" | null | undefined,
): string {
  if (!a) return "";
  return APPLICATION_AREA_LABEL[a];
}

// ─────────────────────────────────────────
// StepStatus
// ─────────────────────────────────────────

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  PENDING:     "Pending",
  SCHEDULED:   "Scheduled",
  IN_PROGRESS: "In Progress",
  DONE:        "Done",
  BLOCKED:     "Blocked",
  CANCELLED:   "Cancelled",
};

export function stepStatusLabel(s: StepStatus): string {
  return STEP_STATUS_LABEL[s] ?? s;
}
