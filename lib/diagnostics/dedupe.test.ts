import { describe, it, expect } from "vitest";
import {
  buildDedupeKey,
  findResolvedKeys,
  shouldSendImmediateEmail,
} from "./dedupe";

describe("buildDedupeKey", () => {
  it("ohne/mit Scope stabil", () => {
    expect(buildDedupeKey("auth", "failed_login_spike")).toBe(
      "auth:failed_login_spike",
    );
    expect(buildDedupeKey("configuration", "missing_qr_iban", "cmp1")).toBe(
      "configuration:missing_qr_iban:cmp1",
    );
  });
});

describe("findResolvedKeys", () => {
  it("liefert vormals offene Keys, die jetzt fehlen", () => {
    expect(findResolvedKeys(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
    expect(findResolvedKeys(["a"], ["a"])).toEqual([]);
    expect(findResolvedKeys([], ["x"])).toEqual([]);
  });
});

describe("shouldSendImmediateEmail", () => {
  const base = { lastNotifiedAt: null as Date | null };

  it("info/low/medium NICHT sofort (non-security)", () => {
    for (const severity of ["info", "low", "medium"] as const) {
      expect(
        shouldSendImmediateEmail({ ...base, severity, isSecurity: false }),
      ).toBe(false);
    }
  });

  it("high/critical sofort (non-security)", () => {
    expect(
      shouldSendImmediateEmail({ ...base, severity: "high", isSecurity: false }),
    ).toBe(true);
    expect(
      shouldSendImmediateEmail({ ...base, severity: "critical", isSecurity: false }),
    ).toBe(true);
  });

  it("Security ab medium sofort", () => {
    expect(
      shouldSendImmediateEmail({ ...base, severity: "medium", isSecurity: true }),
    ).toBe(true);
    expect(
      shouldSendImmediateEmail({ ...base, severity: "low", isSecurity: true }),
    ).toBe(false);
  });

  it("Re-Notify erst nach 6 h", () => {
    const now = new Date("2026-05-19T12:00:00Z");
    expect(
      shouldSendImmediateEmail({
        severity: "critical",
        isSecurity: false,
        lastNotifiedAt: new Date("2026-05-19T08:00:00Z"), // 4 h
        now,
      }),
    ).toBe(false);
    expect(
      shouldSendImmediateEmail({
        severity: "critical",
        isSecurity: false,
        lastNotifiedAt: new Date("2026-05-19T05:30:00Z"), // 6.5 h
        now,
      }),
    ).toBe(true);
  });
});
