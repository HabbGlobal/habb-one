// Deutsche Bezeichnungen für alle ERP-Domänen-Enums.
//
// Single source of truth für UI, PDF und Reports. Roh-Codes werden im Code
// für Logik/DB verwendet, aber NIE direkt zum User durchgereicht — immer
// über diese Maps.

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
// ProcessCode — Bearbeitungsschritte
// ─────────────────────────────────────────

/** Lange, sprechende Bezeichnung für UI/PDF. */
export const PROCESS_LABEL: Record<ProcessCode, string> = {
  // Vorbereitung
  DISASSEMBLY:      "Demontage / Zerlegen",
  DEGREASE_MANUAL:  "Entfetten (manuell)",
  CHEM_PRETREAT:    "Chemische Vorbehandlung",
  MASKING:          "Abkleben / Maskieren",
  MOUNTING:         "Aufhängen / Montieren",
  // Sandstrahlen
  BLAST_SA1:        "Sandstrahlen Sa 1 (leicht)",
  BLAST_SA2:        "Sandstrahlen Sa 2 (gründlich)",
  BLAST_SA25:       "Sandstrahlen Sa 2.5 (sehr gründlich)",
  BLAST_SA3:        "Sandstrahlen Sa 3 (Reinmetall)",
  BLAST_GLASS:      "Glasperlenstrahlen",
  // Nasslackieren
  WP_PRIMER:        "Grundierung auftragen",
  WP_SANDING:       "Zwischenschliff",
  WP_TOP_1K:        "Decklack 1K (Einkomponenten)",
  WP_TOP_2K:        "Decklack 2K (Zweikomponenten)",
  WP_CLEAR:         "Klarlack",
  // Pulverbeschichtung
  PC_APPLICATION:   "Pulver auftragen",
  PC_CURING:        "Pulver einbrennen",
  PC_DOUBLE:        "Zweite Pulverschicht",
  // Nachbereitung
  UNMASKING:        "Maskierung entfernen",
  QUALITY_CHECK:    "Qualitätskontrolle",
  TOUCHUP:          "Nachbesserung",
  PACKAGING:        "Verpackung",
};

/** Kurze Variante für enge Spalten / Etiketten. */
export const PROCESS_LABEL_SHORT: Record<ProcessCode, string> = {
  DISASSEMBLY:      "Demontage",
  DEGREASE_MANUAL:  "Entfetten",
  CHEM_PRETREAT:    "Chem. Vorbeh.",
  MASKING:          "Abkleben",
  MOUNTING:         "Aufhängen",
  BLAST_SA1:        "Sa 1",
  BLAST_SA2:        "Sa 2",
  BLAST_SA25:       "Sa 2.5",
  BLAST_SA3:        "Sa 3",
  BLAST_GLASS:      "Glasperlen",
  WP_PRIMER:        "Grundierung",
  WP_SANDING:       "Zwischenschliff",
  WP_TOP_1K:        "Decklack 1K",
  WP_TOP_2K:        "Decklack 2K",
  WP_CLEAR:         "Klarlack",
  PC_APPLICATION:   "Pulver auftragen",
  PC_CURING:        "Einbrennen",
  PC_DOUBLE:        "Pulver 2. Schicht",
  UNMASKING:        "Maskierung ab",
  QUALITY_CHECK:    "QC",
  TOUCHUP:          "Nachbesserung",
  PACKAGING:        "Verpacken",
};

/** Gruppierung für Gruppen-Dropdowns. */
export const PROCESS_GROUP: Record<ProcessCode, "Vorbereitung" | "Sandstrahlen" | "Nasslackieren" | "Pulverbeschichtung" | "Nachbereitung"> = {
  DISASSEMBLY: "Vorbereitung",
  DEGREASE_MANUAL: "Vorbereitung",
  CHEM_PRETREAT: "Vorbereitung",
  MASKING: "Vorbereitung",
  MOUNTING: "Vorbereitung",
  BLAST_SA1: "Sandstrahlen",
  BLAST_SA2: "Sandstrahlen",
  BLAST_SA25: "Sandstrahlen",
  BLAST_SA3: "Sandstrahlen",
  BLAST_GLASS: "Sandstrahlen",
  WP_PRIMER: "Nasslackieren",
  WP_SANDING: "Nasslackieren",
  WP_TOP_1K: "Nasslackieren",
  WP_TOP_2K: "Nasslackieren",
  WP_CLEAR: "Nasslackieren",
  PC_APPLICATION: "Pulverbeschichtung",
  PC_CURING: "Pulverbeschichtung",
  PC_DOUBLE: "Pulverbeschichtung",
  UNMASKING: "Nachbereitung",
  QUALITY_CHECK: "Nachbereitung",
  TOUCHUP: "Nachbereitung",
  PACKAGING: "Nachbereitung",
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
  BLAST_CABIN:  "Sandstrahlkabine",
  CHEM_BATH:    "Chemiebad",
  PAINT_CABIN:  "Lackierkabine",
  POWDER_CABIN: "Pulverkabine",
  CURING_OVEN:  "Einbrennofen",
  DRYING_OVEN:  "Trockenofen",
};

export function machineLabel(t: MachineType | null | undefined): string {
  if (!t) return "—";
  return MACHINE_LABEL[t] ?? t;
}

// ─────────────────────────────────────────
// SkillCode — Mitarbeiter-Qualifikation
// ─────────────────────────────────────────

export const SKILL_LABEL: Record<SkillCode, string> = {
  PREP:            "Vor- & Nachbereitung",
  BLASTER:         "Sandstrahler:in",
  PAINTER:         "Lackierer:in",
  POWDER_COATER:   "Pulverbeschichter:in",
  QC:              "Qualitätskontrolle",
  TEAM_LEAD_SKILL: "Teamleitung",
};

export function skillLabel(s: SkillCode): string {
  return SKILL_LABEL[s] ?? s;
}

// ─────────────────────────────────────────
// Material
// ─────────────────────────────────────────

export const MATERIAL_LABEL: Record<Material, string> = {
  STEEL_S235:   "Stahl S235",
  STEEL_HIGH_C: "Stahl C-reich",
  STAINLESS:    "Edelstahl",
  ALUMINIUM:    "Aluminium",
  GALVANIZED:   "Verzinkter Stahl",
  CAST_IRON:    "Gusseisen",
  OTHER:        "Anderes Material",
};

export function materialLabel(m: Material): string {
  return MATERIAL_LABEL[m] ?? m;
}

// ─────────────────────────────────────────
// Complexity
// ─────────────────────────────────────────

export const COMPLEXITY_LABEL: Record<Complexity, string> = {
  SIMPLE:       "Einfach",
  NORMAL:       "Normal",
  COMPLEX:      "Komplex",
  VERY_COMPLEX: "Sehr komplex",
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
  CUSTOM:  "Eigen",
};

export const GLOSS_LEVEL_LABEL: Record<GlossLevel, string> = {
  MATT:        "Matt",
  SEMI_GLOSS:  "Seidenmatt",
  GLOSSY:      "Glänzend",
  HIGH_GLOSS:  "Hochglanz",
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
  INDOOR: "Innen",
  OUTDOOR: "Aussen",
  BOTH: "Innen + Aussen",
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
  PENDING:     "Offen",
  SCHEDULED:   "Eingeplant",
  IN_PROGRESS: "In Arbeit",
  DONE:        "Erledigt",
  BLOCKED:     "Blockiert",
  CANCELLED:   "Storniert",
};

export function stepStatusLabel(s: StepStatus): string {
  return STEP_STATUS_LABEL[s] ?? s;
}
