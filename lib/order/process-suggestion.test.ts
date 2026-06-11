import { describe, it, expect } from "vitest";
import { suggestProcessSteps } from "./process-suggestion";

describe("suggestProcessSteps — Indoor vs. Outdoor", () => {
  it("Indoor Stahl: SA2 + 1K-Lack reicht", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("BLAST_SA2");
    expect(codes).toContain("WP_TOP_1K");
    expect(codes).not.toContain("WP_TOP_2K");
    expect(codes).not.toContain("CHEM_PRETREAT");
  });

  it("Outdoor Stahl: SA2.5 + 2K-Lack + chem. Vorbehandlung", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "OUTDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("BLAST_SA25");
    expect(codes).toContain("CHEM_PRETREAT");
    expect(codes).toContain("WP_TOP_2K");
    expect(codes).not.toContain("WP_TOP_1K");
    // Touch-up bei Outdoor-Lack-Aufbau
    expect(codes).toContain("TOUCHUP");
  });

  it("Outdoor warnt vor 1K-Lack", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "OUTDOOR",
      coatingMode: "WET_PAINT",
    });
    const w = r.warnings.join(" ");
    expect(w).toMatch(/Outdoor.*1K/i);
  });

  it("BOTH = OUTDOOR (robustere Variante gewinnt)", () => {
    const both = suggestProcessSteps({ material: "STEEL_S235", applicationArea: "BOTH", coatingMode: "WET_PAINT" });
    const out = suggestProcessSteps({ material: "STEEL_S235", applicationArea: "OUTDOOR", coatingMode: "WET_PAINT" });
    expect(both.steps.map((s) => s.processCode)).toEqual(out.steps.map((s) => s.processCode));
  });
});

describe("suggestProcessSteps — Material-spezifisch", () => {
  it("Edelstahl: KEIN Sandstrahlen (Glasperlen statt Korn)", () => {
    const r = suggestProcessSteps({
      material: "STAINLESS",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("BLAST_GLASS");
    expect(codes).not.toContain("BLAST_SA1");
    expect(codes).not.toContain("BLAST_SA2");
    expect(codes).not.toContain("BLAST_SA25");
    expect(codes).not.toContain("BLAST_SA3");
    expect(r.warnings.some((w) => w.includes("Edelstahl"))).toBe(true);
  });

  it("Aluminium: chemische Vorbehandlung Pflicht", () => {
    const r = suggestProcessSteps({
      material: "ALUMINIUM",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("CHEM_PRETREAT");
    expect(codes).not.toContain("BLAST_SA1");
  });

  it("Verzinkt: KEIN Strahlen (Zinkschicht würde weg)", () => {
    const r = suggestProcessSteps({
      material: "GALVANIZED",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).not.toContain("BLAST_SA2");
    expect(codes).not.toContain("BLAST_SA25");
    expect(r.warnings.some((w) => /zink/i.test(w))).toBe(true);
  });
});

describe("suggestProcessSteps — Pulver vs. Nasslack", () => {
  it("Pulver Indoor: Single-Schicht", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      coatingMode: "POWDER",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes.filter((c) => c === "PC_CURING")).toHaveLength(1);
    expect(codes).not.toContain("PC_DOUBLE");
    expect(codes).not.toContain("WP_PRIMER");
  });

  it("Pulver Outdoor: Doppelschicht mit zwei Aushärtungen", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "OUTDOOR",
      coatingMode: "POWDER",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("PC_APPLICATION");
    expect(codes).toContain("PC_DOUBLE");
    // Zwei PC_CURING-Schritte
    expect(codes.filter((c) => c === "PC_CURING")).toHaveLength(2);
  });
});

describe("suggestProcessSteps — Glanz + Komplexität", () => {
  it("Hochglanz: Klar-Lack + Schleif-Schritt", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
      glossLevel: "HIGH_GLOSS",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes).toContain("WP_SANDING");
    expect(codes).toContain("WP_CLEAR");
  });

  it("Sehr komplex: Demontage als erster Schritt", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      complexity: "VERY_COMPLEX",
      coatingMode: "WET_PAINT",
    });
    expect(r.steps[0].processCode).toBe("DISASSEMBLY");
  });

  it("Normal: keine Demontage", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      complexity: "NORMAL",
      coatingMode: "WET_PAINT",
    });
    expect(r.steps.map((s) => s.processCode)).not.toContain("DISASSEMBLY");
  });
});

describe("suggestProcessSteps — Sequenzen + Form", () => {
  it("vergibt Sequenzen 10, 20, 30, …", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    expect(r.steps[0].sequence).toBe(10);
    expect(r.steps[1].sequence).toBe(20);
    expect(r.steps[r.steps.length - 1].sequence).toBe(r.steps.length * 10);
  });

  it("hat IMMER QC + Verpackung am Ende", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "INDOOR",
      coatingMode: "WET_PAINT",
    });
    const codes = r.steps.map((s) => s.processCode);
    expect(codes[codes.length - 1]).toBe("PACKAGING");
    expect(codes).toContain("QUALITY_CHECK");
  });

  it("jeder Schritt hat eine Begründung (rationale)", () => {
    const r = suggestProcessSteps({
      material: "STEEL_S235",
      applicationArea: "OUTDOOR",
      coatingMode: "WET_PAINT",
    });
    for (const s of r.steps) {
      expect(s.rationale.length).toBeGreaterThan(10);
    }
  });
});
