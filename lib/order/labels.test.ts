// Vollständigkeits-Tests für die deutschen Labels. Schlägt fehl, sobald
// jemand einen neuen Enum-Wert in `prisma/schema.prisma` einführt ohne
// das Label-Modul zu erweitern.

import { describe, expect, it } from "vitest";
import {
  PROCESS_LABEL,
  PROCESS_LABEL_SHORT,
  PROCESS_GROUP,
  MACHINE_LABEL,
  SKILL_LABEL,
  MATERIAL_LABEL,
  COMPLEXITY_LABEL,
  COLOR_SYSTEM_LABEL,
  GLOSS_LEVEL_LABEL,
  STEP_STATUS_LABEL,
} from "./labels";
import {
  COMPLEXITIES,
  MACHINE_TYPES,
  MATERIALS,
  PROCESS_CODES,
  SKILL_CODES,
} from "@/lib/validation/order";

describe("PROCESS_LABEL Vollständigkeit", () => {
  it("hat einen Lang-Label-Eintrag für jeden ProcessCode", () => {
    for (const c of PROCESS_CODES) {
      expect(PROCESS_LABEL[c], `lang fehlt: ${c}`).toBeTruthy();
      expect(PROCESS_LABEL_SHORT[c], `kurz fehlt: ${c}`).toBeTruthy();
      expect(PROCESS_GROUP[c], `gruppe fehlt: ${c}`).toBeTruthy();
    }
  });

  it("Lang-Labels sind keine Roh-Codes", () => {
    for (const c of PROCESS_CODES) {
      expect(PROCESS_LABEL[c]).not.toBe(c);
    }
  });

  it("Sandstrahl-Codes sind alle in der Sandstrahl-Gruppe", () => {
    expect(PROCESS_GROUP.BLAST_SA1).toBe("Sandstrahlen");
    expect(PROCESS_GROUP.BLAST_SA25).toBe("Sandstrahlen");
    expect(PROCESS_GROUP.BLAST_GLASS).toBe("Sandstrahlen");
  });
});

describe("MACHINE_LABEL Vollständigkeit", () => {
  it("hat einen Eintrag für jeden MachineType", () => {
    for (const m of MACHINE_TYPES) {
      expect(MACHINE_LABEL[m], `fehlt: ${m}`).toBeTruthy();
    }
  });
});

describe("SKILL_LABEL Vollständigkeit", () => {
  it("hat einen Eintrag für jeden SkillCode", () => {
    for (const s of SKILL_CODES) {
      expect(SKILL_LABEL[s], `fehlt: ${s}`).toBeTruthy();
    }
  });
});

describe("MATERIAL / COMPLEXITY / COLOR / GLOSS / STATUS Vollständigkeit", () => {
  it("Material", () => {
    for (const m of MATERIALS) {
      expect(MATERIAL_LABEL[m], `fehlt: ${m}`).toBeTruthy();
    }
  });

  it("Complexity", () => {
    for (const c of COMPLEXITIES) {
      expect(COMPLEXITY_LABEL[c], `fehlt: ${c}`).toBeTruthy();
    }
  });

  it("ColorSystem", () => {
    expect(COLOR_SYSTEM_LABEL.RAL).toBe("RAL");
    expect(COLOR_SYSTEM_LABEL.CUSTOM).toBe("Eigen");
  });

  it("GlossLevel", () => {
    expect(GLOSS_LEVEL_LABEL.MATT).toBe("Matt");
    expect(GLOSS_LEVEL_LABEL.HIGH_GLOSS).toBe("Hochglanz");
  });

  it("StepStatus", () => {
    expect(STEP_STATUS_LABEL.PENDING).toBe("Offen");
    expect(STEP_STATUS_LABEL.DONE).toBe("Erledigt");
    expect(STEP_STATUS_LABEL.IN_PROGRESS).toBe("In Arbeit");
  });
});
