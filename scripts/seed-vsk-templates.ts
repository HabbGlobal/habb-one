/**
 * One-Shot-Seed der Process-Vorlagen für VSK Motors. Idempotent —
 * UPSERT pro Template via composite unique [companyId, key]; Steps
 * werden bei jedem Lauf neu geschrieben, damit Änderungen sauber
 * übernommen werden.
 *
 * Run:  tsx scripts/seed-vsk-templates.ts
 *
 * Templates sind so designed, dass sie habb globals beide Preislisten
 * abdecken (Industrie/Stahlbau + Fahrzeug/Motors) und auf VSKs vier
 * Stationen aufbauen: Sandstrahlen, Pulverkabine, Nasslack-Kabine,
 * Einbrennofen.
 */

import { PrismaClient, type ProcessCode } from "@prisma/client";
import { PROCESS_RESOURCES } from "../lib/order/process-templates";

const prisma = new PrismaClient();

interface VskTemplate {
  key: string;
  label: string;
  description: string;
  steps: ProcessCode[];
}

// ─────────────────────────────────────────────────────────────
// 13 Vorlagen — Industrie/Stahlbau (1–6) und Motors/Fahrzeug (7–13)
// ─────────────────────────────────────────────────────────────
const TEMPLATES: VskTemplate[] = [
  // ── Industrie / Stahlbau (aus habb global Liste 1) ──
  {
    key: "industrie-pulver-aussen",
    label: "Industrie Pulver — Aussenbereich (2-Schicht)",
    description:
      "EP-Grundierung + Decklack-Pulver für witterungsexponierte Stahlteile. " +
      "Sa 2.5-Strahlung, anschliessend Pulver-Grundierung, Aushärten, " +
      "Decklack, Aushärten. Standard für Geländer, Fassaden, Aussen-Stahlbau.",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "MASKING",
      "MOUNTING",
      "PC_APPLICATION", // Pulver-Grundierung
      "PC_CURING",
      "PC_DOUBLE", // Decklack
      "PC_CURING",
      "UNMASKING",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
  {
    key: "industrie-pulver-innen",
    label: "Industrie Pulver — Innenbereich (1-Schicht)",
    description:
      "Einschichtiges Pulvern ohne separate Grundierung — für trockene " +
      "Innenanwendung. Sa 2.5-Strahlung, dann Decklack-Pulver mit " +
      "Aushärtung. Typisch für Innen-Geländer, Treppen-Profile, Gitter.",
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
    key: "industrie-stahlbau-schwer",
    label: "Stahlbau schwer (Treppenwangen / Deckenstirnen)",
    description:
      "Höchste Strahlreinheit Sa 3 (Reinmetall) für massive Stahlträger > 250mm. " +
      "Doppelte Pulver-Schicht für Korrosionsschutz unter Last. Demontage " +
      "auf Anfrage. Geeignet für tragende Konstruktion.",
    steps: [
      "DISASSEMBLY",
      "DEGREASE_MANUAL",
      "BLAST_SA3",
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
    key: "industrie-nasslack-1k",
    label: "Industrie Nasslack 1K",
    description:
      "Nasslackierung mit 1-Komponenten-Decklack. Standard-Sa 2.5, " +
      "Primer, Zwischenschliff, Decklack. Für Innenbereich oder " +
      "Werkstücke mit niedrigen Beanspruchungs-Anforderungen.",
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
    key: "industrie-nasslack-2k-klar",
    label: "Premium Nasslack 2K + Klarlack",
    description:
      "Hochwertige 2K-Lackierung mit zusätzlichem Klarlack — für Geländer, " +
      "Sichtflächen und Auto-Karosserie-Teile. Topfzeit 6h beachten; " +
      "Trocknung 2K-Decklack 12h, Klarlack 6h. Geländer-Tarif ×1.25.",
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
      "TOUCHUP",
      "PACKAGING",
    ],
  },
  {
    key: "heizkoerper-radiatoren",
    label: "Heizkörper / Radiatoren (mit Phosphatierung)",
    description:
      "Chemische Vorbehandlung statt Strahlen — Phosphatierung schützt die " +
      "dünnen Bleche. Sorgfältige Maskierung aller Anschluss-Gewinde. " +
      "Pulver-Decklack hitzebeständig. Stk-Tarif aus Preisliste 1.",
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

  // ── Motors / Fahrzeug (aus habb global Liste 2 — VSK-Kernsortiment) ──
  {
    key: "velo-rahmen-komplett",
    label: "Velo Rahmen (inkl. Gabel/Lenker)",
    description:
      "Velorahmen mit Gabel und Lenker im Set. Demontage vorab " +
      "(Innenlager-Hülse, Steuersatz). Pulver-Grundierung + RAL-Decklack. " +
      "Innengewinde Tretlager und Sattelrohr werden sauber maskiert.",
    steps: [
      "DISASSEMBLY",
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
    key: "toeffli-rahmen-vollpulver",
    label: "Töffli Rahmen — Strahlen + Grundieren + Pulvern",
    description:
      "Standard-Vollservice Töffli-Rahmen: Demontage von Anbauteilen, " +
      "Strahlen, Pulver-Grundierung, Decklack-Pulver. Maskierung Achs- " +
      "und Gewindebohrungen.",
    steps: [
      "DISASSEMBLY",
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
    key: "toeffli-rahmen-nur-grundieren",
    label: "Töffli Rahmen — nur Grundieren (Kunde lackiert selbst)",
    description:
      "Strahlen + 1× Pulver-Grundierung als Basis. Kunde übernimmt den " +
      "Decklack selbst. Günstigere Variante für Selbstlackierer (CHF 160 " +
      "vs 220 in der Preisliste).",
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
    key: "felgen-auto-alu",
    label: "Auto Alufelgen (Phosphatierung + Pulver)",
    description:
      "Alu-spezifischer Workflow: Chemische Vorbehandlung statt Sandstrahlen " +
      "(Strahlen würde Alu beschädigen). Maskierung Naben- und Ventilbohrung, " +
      "anschliessend Pulver-Decklack. CHF 150/Stk laut Preisliste.",
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
  {
    key: "felgen-stahl",
    label: "Felgen Stahl (Auto / Traktor / LKW)",
    description:
      "Standard-Workflow für Stahlfelgen aller Grössen — Sa 2.5, Grundierung, " +
      "Decklack-Pulver. Für Auto, Traktor (Ø ca. 90cm) und Lastwagen gleich. " +
      "Bei Traktor/LKW empfiehlt sich die schwere Doppelschicht-Variante.",
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
    key: "toeffli-seitenteil-nasslack",
    label: "Töffli Seitenteil (Nasslack 2K)",
    description:
      "Seitenteile / Tank-Verkleidung in 2K-Nasslack für sichtbare Stellen " +
      "mit Klarlack-Finish. Sa 2.5-Strahlung, Primer, Zwischenschliff, 2K, " +
      "Klar. CHF 50/Seitenteil laut Preisliste.",
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
    key: "kleinteile-pulver",
    label: "Kleinteile Pulver (Ständer, Schwinge, Kurbel, Schutzbleche)",
    description:
      "Vereinfachter Standard-Flow für kleine Töffli/Velo-Komponenten: " +
      "Strahlen, 1× Pulver, Aushärten. Tarif laut Preisliste 2 zwischen " +
      "CHF 10–75 je nach Teil.",
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
    key: "nur-sandstrahlen",
    label: "Nur Sandstrahlen (Vorbereitung ohne Beschichtung)",
    description:
      "Reine Strahlbehandlung — Kunde holt das Werkstück gestrahlt ab oder " +
      "wir liefern weiter an einen Folge-Betrieb. Tarif nach Stundenwerten " +
      "der Preisliste 2 (¼–1 Std).",
    steps: [
      "DEGREASE_MANUAL",
      "BLAST_SA25",
      "QUALITY_CHECK",
      "PACKAGING",
    ],
  },
];

async function main() {
  // VSK-Mandant per Namen-Match auflösen — Schreibfehler-tolerant.
  const company = await prisma.company.findFirst({
    where: { name: { contains: "VSK", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error("✗ Kein Mandant mit 'VSK' im Namen gefunden.");
    process.exit(1);
  }
  console.log(`→ Seeding ${TEMPLATES.length} Vorlagen für ${company.name}`);

  for (let i = 0; i < TEMPLATES.length; i++) {
    const tpl = TEMPLATES[i];
    const dbTpl = await prisma.processTemplate.upsert({
      where: { companyId_key: { companyId: company.id, key: tpl.key } },
      create: {
        companyId: company.id,
        key: tpl.key,
        label: tpl.label,
        description: tpl.description,
        sortOrder: i,
      },
      update: {
        label: tpl.label,
        description: tpl.description,
        sortOrder: i,
      },
    });
    // Steps bei jedem Lauf frisch — damit Edits in der Steps-Liste
    // sauber übernommen werden ohne stale Reihenfolge.
    await prisma.processTemplateStep.deleteMany({
      where: { templateId: dbTpl.id },
    });
    for (let s = 0; s < tpl.steps.length; s++) {
      const code = tpl.steps[s];
      const r = PROCESS_RESOURCES[code];
      await prisma.processTemplateStep.create({
        data: {
          templateId: dbTpl.id,
          sequence: (s + 1) * 10,
          processCode: code,
          machineTypeRequired: r.machine,
          skillRequired: r.skill,
          defaultWaitMinutes: r.defaultWaitMinutes,
        },
      });
    }
    console.log(`  ✓ ${tpl.label} — ${tpl.steps.length} Schritte`);
  }

  console.log(`\n✓ ${TEMPLATES.length} Vorlagen für ${company.name} synchronisiert.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
