import { describe, it, expect } from "vitest";
import {
  buildDigestMail,
  buildImmediateFindingMail,
  buildSecurityEventMail,
  buildManualTestMail,
} from "./diagnostics";

describe("buildDigestMail", () => {
  it("Betreff mit kritisch/Warnung-Zählung, nach Score sortiert", () => {
    const m = buildDigestMail({
      generatedAtIso: "2026-05-19T12:00:00.000Z",
      tenants: [
        { tenantName: "Alpha", status: "healthy", score: 95, open: 0, critical: 0, warning: 0, securityEvents: 0 },
        { tenantName: "Beta", status: "critical", score: 40, open: 5, critical: 2, warning: 1, securityEvents: 3 },
        { tenantName: "Gamma", status: "warning", score: 80, open: 2, critical: 0, warning: 2, securityEvents: 0 },
      ],
    });
    expect(m.subject).toContain("1 kritisch");
    expect(m.subject).toContain("1 Warnung");
    // schlechtester Score zuerst
    expect(m.text.indexOf("Beta")).toBeLessThan(m.text.indexOf("Gamma"));
    expect(m.html).toContain("Owner-Dashboard");
  });
});

describe("buildImmediateFindingMail", () => {
  it("Betreff enthält Severity + Mandant", () => {
    const m = buildImmediateFindingMail({
      tenantName: "habb global",
      severity: "critical",
      category: "configuration",
      title: "QR-IBAN fehlt",
      message: "Keine QR-IBAN hinterlegt.",
      recommendation: "QR-IBAN setzen.",
    });
    expect(m.subject).toContain("CRITICAL");
    expect(m.subject).toContain("habb global");
    expect(m.text).toContain("QR-IBAN setzen.");
  });
});

describe("buildSecurityEventMail", () => {
  it("Plattform-Fallback wenn kein Mandant", () => {
    const m = buildSecurityEventMail({
      tenantName: null,
      severity: "high",
      eventType: "brute_force_suspected",
      message: "Viele Fehl-Logins.",
      riskScore: 70,
    });
    expect(m.subject).toContain("Plattform");
    expect(m.subject).toContain("brute_force_suspected");
  });
});

describe("buildManualTestMail", () => {
  it("hat klaren Test-Betreff", () => {
    expect(buildManualTestMail().subject).toBe("[Habb One Diagnose] Test-E-Mail");
  });
});

describe("keine PII in Diagnose-Mails", () => {
  it("Digest enthält keine IP/Mail-Muster", () => {
    const m = buildDigestMail({
      generatedAtIso: "2026-05-19T12:00:00.000Z",
      tenants: [
        { tenantName: "Alpha", status: "healthy", score: 95, open: 0, critical: 0, warning: 0, securityEvents: 0 },
      ],
    });
    const blob = m.text + m.html;
    expect(blob).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // IPv4
    expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); // E-Mail
  });
});
