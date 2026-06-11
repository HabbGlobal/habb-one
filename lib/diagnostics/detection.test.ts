import { describe, it, expect } from "vitest";
import { detectSecurityEvents, type DetectionInput } from "./detection";

const ZERO: DetectionInput = {
  windowMinutes: 60,
  failedLogins: 0,
  failedLoginDistinctAccounts: 0,
  passwordResetRequests: 0,
  newSessions: 0,
  forbiddenOrNotFound: 0,
  ownerRouteAccessByNonOwner: 0,
  rlsOrPermissionErrors: 0,
  bulkReadActions: 0,
  exportActions: 0,
  offHoursActions: 0,
  topIpHashRequestCount: 0,
  distinctIpHashes: 0,
  crossTenantAccessAttempts: 0,
};

describe("detectSecurityEvents", () => {
  it("keine Auffälligkeit → keine Events", () => {
    expect(detectSecurityEvents(ZERO)).toEqual([]);
  });

  it("Brute-Force ab Schwellwert, high bei 3x", () => {
    expect(detectSecurityEvents({ ...ZERO, failedLogins: 15 })[0].eventType).toBe(
      "brute_force_suspected",
    );
    const high = detectSecurityEvents({ ...ZERO, failedLogins: 45 })[0];
    expect(high.severity).toBe("high");
  });

  it("Credential-Stuffing bei vielen Konten", () => {
    const ev = detectSecurityEvents({
      ...ZERO,
      failedLoginDistinctAccounts: 8,
    });
    expect(ev.some((e) => e.eventType === "credential_stuffing_suspected")).toBe(
      true,
    );
  });

  it("Owner-Route-Zugriff durch Nicht-Owner = high", () => {
    const ev = detectSecurityEvents({ ...ZERO, ownerRouteAccessByNonOwner: 1 });
    expect(ev[0].eventType).toBe("owner_route_unauthorized");
    expect(ev[0].severity).toBe("high");
  });

  it("Tenant-Isolations-Verdacht = critical", () => {
    const ev = detectSecurityEvents({ ...ZERO, crossTenantAccessAttempts: 1 });
    expect(ev[0].eventType).toBe("tenant_isolation_violation_suspected");
    expect(ev[0].severity).toBe("critical");
    expect(ev[0].riskScore).toBeGreaterThanOrEqual(90);
  });

  it("Exfiltration über Exporte = high", () => {
    const ev = detectSecurityEvents({ ...ZERO, exportActions: 15 });
    expect(ev[0].eventType).toBe("data_exfiltration_suspected");
    expect(ev[0].severity).toBe("high");
  });

  it("deterministisch & evidence ohne PII", () => {
    const ev = detectSecurityEvents({ ...ZERO, failedLogins: 20 });
    expect(JSON.stringify(ev)).not.toMatch(/@|\.\d{1,3}\./); // keine Mail/IP
    expect(ev[0].evidence).toHaveProperty("threshold");
  });
});
