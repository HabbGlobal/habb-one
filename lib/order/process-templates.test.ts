// Tests für die statischen Prozess-Vorlagen + Ressourcen-Mapping. Verhindert
// dass jemand versehentlich einen ProcessCode hinzufügt ohne Skill/Maschine,
// oder eine Vorlage referenziert die nicht existiert.

import { describe, expect, it } from "vitest";
import {
  PROCESS_RESOURCES,
  PROCESS_TEMPLATES,
  expandTemplate,
} from "./process-templates";
import { PROCESS_CODES } from "@/lib/validation/order";

describe("PROCESS_RESOURCES", () => {
  it("hat einen Eintrag für jeden ProcessCode aus dem Schema", () => {
    for (const code of PROCESS_CODES) {
      expect(PROCESS_RESOURCES[code], `fehlt: ${code}`).toBeDefined();
    }
  });

  it("definiert für jeden Eintrag mindestens einen Skill", () => {
    for (const [code, r] of Object.entries(PROCESS_RESOURCES)) {
      expect(r.skill, `${code} ohne Skill`).toBeTruthy();
      expect(r.defaultWaitMinutes).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("PROCESS_TEMPLATES", () => {
  it("verwendet ausschliesslich gültige ProcessCodes", () => {
    for (const tpl of PROCESS_TEMPLATES) {
      for (const code of tpl.steps) {
        expect(PROCESS_CODES, `${tpl.id}: ${code}`).toContain(code);
      }
    }
  });

  it("Standard-Pulvervorlage enthält Aushärtung am Schluss der Schicht", () => {
    const tpl = PROCESS_TEMPLATES.find((t) => t.id === "powder-standard");
    expect(tpl).toBeDefined();
    expect(tpl!.steps).toContain("PC_APPLICATION");
    expect(tpl!.steps).toContain("PC_CURING");
    expect(tpl!.steps.indexOf("PC_CURING")).toBeGreaterThan(
      tpl!.steps.indexOf("PC_APPLICATION"),
    );
  });
});

describe("expandTemplate", () => {
  it("vergibt sequenzielle Schritte in 10er-Schritten", () => {
    const steps = expandTemplate("blast-only");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.sequence)).toEqual([10, 20, 30]);
  });

  it("setzt Skill + Maschine entsprechend der Ressourcen-Map", () => {
    const steps = expandTemplate("blast-only");
    const blast = steps.find((s) => s.processCode === "BLAST_SA25");
    expect(blast?.skillRequired).toBe("BLASTER");
    expect(blast?.machineTypeRequired).toBe("BLAST_CABIN");
  });

  it("wirft auf unbekannte Vorlagen-IDs", () => {
    expect(() => expandTemplate("nicht-existent")).toThrow();
  });
});
