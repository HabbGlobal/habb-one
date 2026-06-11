import { describe, it, expect } from "vitest";
import { computeHealth } from "./scoring";

describe("computeHealth", () => {
  it("100 → healthy bei keinen Findings", () => {
    expect(
      computeHealth({
        findingSeverities: [],
        securitySeverities: [],
        diagnosticsFailed: false,
        hoursSinceLastCheck: 0,
      }),
    ).toEqual({ score: 100, status: "healthy" });
  });

  it("zieht exakt nach Spec ab", () => {
    const r = computeHealth({
      findingSeverities: ["critical", "high", "medium", "low", "info"],
      securitySeverities: ["critical"],
      diagnosticsFailed: false,
      hoursSinceLastCheck: 1,
    });
    // 100 -30 -20 -10 -3 -1 -35 = 1
    expect(r.score).toBe(1);
    expect(r.status).toBe("critical");
  });

  it("clamped auf 0, nie negativ", () => {
    const r = computeHealth({
      findingSeverities: ["critical", "critical", "critical", "critical", "critical"],
      securitySeverities: [],
      diagnosticsFailed: true,
      hoursSinceLastCheck: 0,
    });
    expect(r.score).toBe(0);
    expect(r.status).toBe("critical");
  });

  it("Status-Grenzen 90/70", () => {
    expect(
      computeHealth({ findingSeverities: ["low"], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: 0 }).status,
    ).toBe("healthy"); // 97
    expect(
      computeHealth({ findingSeverities: ["high"], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: 0 }).status,
    ).toBe("warning"); // 80
    expect(
      computeHealth({ findingSeverities: ["critical", "high"], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: 0 }).status,
    ).toBe("critical"); // 50
  });

  it("nie geprüft / > 24 h → unknown", () => {
    expect(
      computeHealth({ findingSeverities: [], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: null }).status,
    ).toBe("unknown");
    expect(
      computeHealth({ findingSeverities: [], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: 25 }).status,
    ).toBe("unknown");
  });

  it("> 2 h ohne Prüfung → -15", () => {
    expect(
      computeHealth({ findingSeverities: [], securitySeverities: [], diagnosticsFailed: false, hoursSinceLastCheck: 3 }).score,
    ).toBe(85);
  });

  it("Diagnose fehlgeschlagen → -20", () => {
    expect(
      computeHealth({ findingSeverities: [], securitySeverities: [], diagnosticsFailed: true, hoursSinceLastCheck: 0 }).score,
    ).toBe(80);
  });
});
