import { describe, it, expect } from "vitest";
import {
  buildDigestMail,
  buildImmediateFindingMail,
  buildSecurityEventMail,
  buildManualTestMail,
} from "./diagnostics";

describe("buildDigestMail", () => {
  it("includes critical and warning counts and sorts by score", () => {
    const m = buildDigestMail({
      generatedAtIso: "2026-05-19T12:00:00.000Z",
      tenants: [
        { tenantName: "Alpha", status: "healthy", score: 95, open: 0, critical: 0, warning: 0, securityEvents: 0 },
        { tenantName: "Beta", status: "critical", score: 40, open: 5, critical: 2, warning: 1, securityEvents: 3 },
        { tenantName: "Gamma", status: "warning", score: 80, open: 2, critical: 0, warning: 2, securityEvents: 0 },
      ],
    });
    expect(m.subject).toContain("1 critical");
    expect(m.subject).toContain("1 warning");
    // Lowest score first.
    expect(m.text.indexOf("Beta")).toBeLessThan(m.text.indexOf("Gamma"));
    expect(m.html).toContain("Open Owner Dashboard");
  });
});

describe("buildImmediateFindingMail", () => {
  it("includes severity and tenant in the subject", () => {
    const m = buildImmediateFindingMail({
      tenantName: "habb global",
      severity: "critical",
      category: "configuration",
      title: "QR-IBAN missing",
      message: "No QR-IBAN configured.",
      recommendation: "Configure a QR-IBAN.",
    });
    expect(m.subject).toContain("CRITICAL");
    expect(m.subject).toContain("habb global");
    expect(m.text).toContain("Configure a QR-IBAN.");
  });
});

describe("buildSecurityEventMail", () => {
  it("uses the platform fallback when there is no tenant", () => {
    const m = buildSecurityEventMail({
      tenantName: null,
      severity: "high",
      eventType: "brute_force_suspected",
      message: "Many failed login attempts.",
      riskScore: 70,
    });
    expect(m.subject).toContain("Platform");
    expect(m.subject).toContain("brute_force_suspected");
  });
});

describe("buildManualTestMail", () => {
  it("has a clear test subject", () => {
    expect(buildManualTestMail().subject).toBe("[Habb One Diagnostics] Test email");
  });
});

describe("diagnostic emails contain no PII", () => {
  it("digest contains no IP or email patterns", () => {
    const m = buildDigestMail({
      generatedAtIso: "2026-05-19T12:00:00.000Z",
      tenants: [
        { tenantName: "Alpha", status: "healthy", score: 95, open: 0, critical: 0, warning: 0, securityEvents: 0 },
      ],
    });
    const blob = m.text + m.html;
    expect(blob).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // IPv4
    expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); // Email
  });
});
