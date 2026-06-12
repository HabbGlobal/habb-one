// Spritzwerk-Prozess-Recommender
//
// Schlägt anhand der Werkstück-Eigenschaften (Material, Komplexität,
// Anwendungsbereich Indoor/Outdoor, Farbsystem, Glanz) eine sinnvolle
// Schritt-Reihenfolge vor. Branchen-Wissen aus dem Schweizer Lackier-/
// Pulver-Handwerk:
//
//   - INDOOR  → 1K-Lacke / Standard-Pulver reichen (UV unkritisch)
//   - OUTDOOR → 2K-Lack PFLICHT (UV/Wetter/Korrosion) ODER
//               Doppelpulver-Aufbau für Außenbereich
//   - HIGH_GLOSS → Klarlack-Schicht + extra Schleif-Schritt
//   - VERY_COMPLEX → mehr Maskieren-Zeit + ggf. Demontage
//   - STAINLESS / GALVANIZED → kein Sandstrahlen (zerstört Schutzschicht)
//   - ALUMINIUM → chemische Vorbehandlung kritisch (Beizen / Eloxieren)
//   - STEEL_S235 outdoor → SA2.5+ + chem. Vorbehandlung empfohlen
//
// Pure Function — keine DB, keine Side-Effects. Caller (Wizard) ruft
// `suggestProcessSteps()` auf, zeigt das Resultat an und der User kann
// es 1:1 übernehmen oder editieren.

import type {
  Material,
  Complexity,
  ApplicationArea,
  ColorSystem,
  GlossLevel,
  ProcessCode,
  MachineType,
  SkillCode,
} from "@prisma/client";

// ─── Inputs ─────────────────────────────────────────────────────────

export interface SuggestionInput {
  material: Material;
  complexity?: Complexity | null;
  applicationArea?: ApplicationArea | null;
  /** Welche Beschichtungsart gewünscht ist. Bestimmt ob WP_* oder PC_*-Schritte
   *  vorgeschlagen werden. Wenn unklar: "WET_PAINT" (häufiger im Handwerk). */
  coatingMode?: "WET_PAINT" | "POWDER" | null;
  glossLevel?: GlossLevel | null;
  /** Reine Doku, beeinflusst die Empfehlung nicht (Farbsystem ist organisatorisch). */
  colorSystem?: ColorSystem | null;
}

// ─── Output ─────────────────────────────────────────────────────────

export interface SuggestedStep {
  /** 10, 20, 30 — wird vom Recommender konsekutiv vergeben. */
  sequence: number;
  processCode: ProcessCode;
  machineTypeRequired: MachineType | null;
  skillRequired: SkillCode;
  /** Standard-Wartezeit zwischen Schritten (Trocknung, Aushärtung). */
  waitMinutesAfter: number;
  /** Klartext-Begründung für die Empfehlung. Wird in der UI als Hilfetext
   *  angezeigt — der User versteht so, WARUM dieser Schritt vorgeschlagen wird. */
  rationale: string;
}

export interface SuggestionResult {
  steps: SuggestedStep[];
  /** Hochgezogene Hinweise für die UI ("Bei Outdoor empfehlen wir 2K-Lack"). */
  warnings: string[];
}

// ─── Helpers (machen Schritte mit den passenden Defaults) ──────────

const PROCESS_RESOURCES: Record<
  ProcessCode,
  { machine: MachineType | null; skill: SkillCode; defaultWait: number }
> = {
  // Vorbereitung
  DISASSEMBLY: { machine: null, skill: "PREP", defaultWait: 0 },
  DEGREASE_MANUAL: { machine: null, skill: "PREP", defaultWait: 0 },
  CHEM_PRETREAT: { machine: "CHEM_BATH", skill: "PREP", defaultWait: 30 },
  MASKING: { machine: null, skill: "PREP", defaultWait: 0 },
  MOUNTING: { machine: null, skill: "PREP", defaultWait: 0 },
  // Sandstrahlen
  BLAST_SA1: { machine: "BLAST_CABIN", skill: "BLASTER", defaultWait: 0 },
  BLAST_SA2: { machine: "BLAST_CABIN", skill: "BLASTER", defaultWait: 0 },
  BLAST_SA25: { machine: "BLAST_CABIN", skill: "BLASTER", defaultWait: 0 },
  BLAST_SA3: { machine: "BLAST_CABIN", skill: "BLASTER", defaultWait: 0 },
  BLAST_GLASS: { machine: "BLAST_CABIN", skill: "BLASTER", defaultWait: 0 },
  // Nasslackieren
  WP_PRIMER: { machine: "PAINT_CABIN", skill: "PAINTER", defaultWait: 60 },
  WP_SANDING: { machine: null, skill: "PAINTER", defaultWait: 0 },
  WP_TOP_1K: { machine: "PAINT_CABIN", skill: "PAINTER", defaultWait: 240 },
  WP_TOP_2K: { machine: "PAINT_CABIN", skill: "PAINTER", defaultWait: 720 },
  WP_CLEAR: { machine: "PAINT_CABIN", skill: "PAINTER", defaultWait: 240 },
  // Pulverbeschichtung
  PC_APPLICATION: { machine: "POWDER_CABIN", skill: "POWDER_COATER", defaultWait: 0 },
  PC_CURING: { machine: "CURING_OVEN", skill: "POWDER_COATER", defaultWait: 30 },
  PC_DOUBLE: { machine: "POWDER_CABIN", skill: "POWDER_COATER", defaultWait: 0 },
  // Nachbereitung
  UNMASKING: { machine: null, skill: "PREP", defaultWait: 0 },
  QUALITY_CHECK: { machine: null, skill: "QC", defaultWait: 0 },
  TOUCHUP: { machine: "PAINT_CABIN", skill: "PAINTER", defaultWait: 60 },
  PACKAGING: { machine: null, skill: "PREP", defaultWait: 0 },
};

function step(code: ProcessCode, rationale: string): Omit<SuggestedStep, "sequence"> {
  const r = PROCESS_RESOURCES[code];
  return {
    processCode: code,
    machineTypeRequired: r.machine,
    skillRequired: r.skill,
    waitMinutesAfter: r.defaultWait,
    rationale,
  };
}

// ─── Hauptfunktion ─────────────────────────────────────────────────

export function suggestProcessSteps(input: SuggestionInput): SuggestionResult {
  const isOutdoor = input.applicationArea === "OUTDOOR" || input.applicationArea === "BOTH";
  const isComplex = input.complexity === "COMPLEX" || input.complexity === "VERY_COMPLEX";
  const isVeryComplex = input.complexity === "VERY_COMPLEX";
  const isHighGloss = input.glossLevel === "HIGH_GLOSS";
  const coatingMode = input.coatingMode ?? "WET_PAINT";
  const warnings: string[] = [];

  const recipe: Array<Omit<SuggestedStep, "sequence">> = [];

  // ─── 1. DEMONTAGE (nur bei VERY_COMPLEX) ─────────────────────
  if (isVeryComplex) {
    recipe.push(
      step(
        "DISASSEMBLY",
        "Bauteil ist sehr komplex — Demontage in lackierbare Einzelteile.",
      ),
    );
  }

  // ─── 2. ENTFETTEN (immer Pflicht) ────────────────────────────
  recipe.push(
    step(
      "DEGREASE_MANUAL",
      "Manuelles Entfetten ist Pflicht — sonst hält keine Beschichtung.",
    ),
  );

  // ─── 3. VORBEHANDLUNG (Material- + Anwendungs-abhängig) ─────
  switch (input.material) {
    case "STEEL_S235":
    case "STEEL_HIGH_C":
    case "CAST_IRON":
      // Stahl: Strahlen + bei Outdoor zusätzlich chem. Vorbehandlung
      if (isOutdoor) {
        recipe.push(
          step(
            "BLAST_SA25",
            "Outdoor-Stahl: SA 2½ ist DIN-empfohlener Strahlgrad für witterungsbeständige Beschichtung.",
          ),
        );
        recipe.push(
          step(
            "CHEM_PRETREAT",
            "Outdoor-Stahl: chemische Vorbehandlung verbessert Korrosionsschutz erheblich.",
          ),
        );
      } else {
        recipe.push(
          step(
            "BLAST_SA2",
            "Indoor-Stahl: SA 2 (Sweep-Blasting) reicht für gute Haftung.",
          ),
        );
      }
      break;

    case "STAINLESS":
      // Edelstahl: KEIN Sandstrahlen — nur leichtes Anschleifen.
      recipe.push(
        step(
          "BLAST_GLASS",
          "Edelstahl: Glasperlstrahlen statt Sand — reine Sand-Korn-Strahlung würde die Passivschicht zerstören.",
        ),
      );
      warnings.push(
        "Edelstahl: kein metallisches Strahlmittel verwenden — sonst Rost-Anfälligkeit.",
      );
      break;

    case "ALUMINIUM":
      // Alu: chemische Vorbehandlung essentiell.
      recipe.push(
        step(
          "CHEM_PRETREAT",
          "Aluminium: chemische Vorbehandlung (Chromatieren / Anodisieren) ist Pflicht für dauerhafte Haftung.",
        ),
      );
      if (isOutdoor) {
        warnings.push(
          "Aluminium-Outdoor: Eloxalschicht (Anodisierung) ist häufig die nachhaltigere Lösung als Lack.",
        );
      }
      break;

    case "GALVANIZED":
      // Verzinkt: KEIN Strahlen — Zinkschicht würde weg.
      recipe.push(
        step(
          "DEGREASE_MANUAL",
          "Verzinkt: nur entfetten + ggf. anschleifen — KEIN Strahlen, sonst geht die Zinkschicht weg.",
        ),
      );
      warnings.push(
        "Verzinkter Stahl: spezial-haftvermittelnden Primer verwenden (sonst Abplatzungen).",
      );
      break;

    case "OTHER":
      warnings.push(
        "Material 'Sonstiges' — bitte Vorbehandlung manuell prüfen / fachlich abklären.",
      );
      break;
  }

  // ─── 4. MASKIEREN ────────────────────────────────────────────
  recipe.push(
    step(
      "MASKING",
      isComplex
        ? "Komplexe Geometrie — gründlich maskieren (Gewinde, Bohrungen, Funktionsflächen)."
        : "Funktionsflächen abkleben (Gewinde, Bohrungen).",
    ),
  );

  // ─── 5. MONTAGE auf Hänger ───────────────────────────────────
  recipe.push(step("MOUNTING", "Aufhängen / Verkettung für Lackier- bzw. Pulverkabine."));

  // ─── 6. BESCHICHTUNG (Pulver vs. Lack, Indoor vs. Outdoor) ──
  if (coatingMode === "POWDER") {
    if (isOutdoor) {
      // Outdoor-Pulver: Doppelschicht für UV/Korrosion
      recipe.push(
        step(
          "PC_APPLICATION",
          "Pulver Schicht 1 — Grundschicht (Outdoor).",
        ),
      );
      recipe.push(
        step(
          "PC_CURING",
          "Erstes Aushärten der Grundschicht (~30 Min bei 180°C).",
        ),
      );
      recipe.push(
        step(
          "PC_DOUBLE",
          "Pulver Schicht 2 — Decklack (Outdoor-Doppelaufbau für UV-/Korrosionsschutz).",
        ),
      );
      recipe.push(
        step(
          "PC_CURING",
          "Finales Aushärten (~30 Min bei 180°C).",
        ),
      );
    } else {
      // Indoor-Pulver: Single-Schicht reicht
      recipe.push(
        step(
          "PC_APPLICATION",
          "Powder coating — Indoor: one layer is sufficient.",
        ),
      );
      recipe.push(
        step("PC_CURING", "Aushärten im Ofen (~30 Min bei 180°C)."),
      );
    }
  } else {
    // WET_PAINT (Nasslack)
    recipe.push(
      step(
        "WP_PRIMER",
        isOutdoor
          ? "Outdoor-tauglicher Korrosionsschutz-Primer (Zink-/Epoxy-basiert)."
          : "Standard-Primer.",
      ),
    );

    if (isHighGloss || isComplex) {
      recipe.push(
        step(
          "WP_SANDING",
          isHighGloss
            ? "Zwischenschliff — Pflicht für Hochglanz-Oberfläche (sonst sieht man Pinselstriche / Orangenhaut)."
            : "Zwischenschliff für sauberen Oberflächenaufbau bei komplexen Geometrien.",
        ),
      );
    }

    if (isOutdoor) {
      recipe.push(
        step(
          "WP_TOP_2K",
          "2K-Decklack — UV-stabil und chemikalien-resistent (Pflicht für Outdoor).",
        ),
      );
      warnings.push(
        "Outdoor-Anwendung: 1K-Lack ist NICHT zulässig — UV-Vergilbung und Schichtversagen innerhalb 12 Monaten.",
      );
    } else {
      recipe.push(
        step(
          "WP_TOP_1K",
          "1K-Decklack — Standard für Indoor-Anwendungen.",
        ),
      );
    }

    if (isHighGloss) {
      recipe.push(
        step(
          "WP_CLEAR",
          "Klarlack-Schicht — entscheidend für Hochglanz-Tiefe und Kratzfestigkeit.",
        ),
      );
    }
  }

  // ─── 7. NACHBEREITUNG ────────────────────────────────────────
  recipe.push(step("UNMASKING", "Abkleberei entfernen."));
  recipe.push(
    step(
      "QUALITY_CHECK",
      isComplex
        ? "Sicht- + Schichtdickenmessung. Bei komplexen Teilen besonders gründlich."
        : "Sichtprüfung + Schichtdickenmessung.",
    ),
  );

  if (isOutdoor && coatingMode === "WET_PAINT") {
    recipe.push(
      step(
        "TOUCHUP",
        "Nachbesserung kleinerer Stellen — bei Outdoor-Lackierungen meist Pflicht.",
      ),
    );
  }

  recipe.push(step("PACKAGING", "Verpackung — Schutz vor Transportschäden."));

  // ─── Sequence-Nummern (10, 20, 30…) vergeben ────────────────
  const steps: SuggestedStep[] = recipe.map((s, i) => ({
    ...s,
    sequence: (i + 1) * 10,
  }));

  return { steps, warnings };
}
