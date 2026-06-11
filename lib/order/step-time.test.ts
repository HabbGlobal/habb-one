// Tests für die State-Machine und Zeit-Berechnung des QR-Scan-Streams.

import { describe, expect, it } from "vitest";
import {
  calcActualMinutes,
  calcStableActualMinutes,
  deriveStateFromEvents,
  effectiveBilledMinutes,
  isActionAllowed,
} from "./step-time";

const t = (mins: number) => new Date(Date.UTC(2026, 4, 4, 8, 0) + mins * 60_000);

describe("deriveStateFromEvents", () => {
  it("leerer Stream → NOT_STARTED", () => {
    expect(deriveStateFromEvents([])).toBe("NOT_STARTED");
  });

  it("START → RUNNING", () => {
    expect(deriveStateFromEvents([{ eventType: "START", occurredAt: t(0) }])).toBe("RUNNING");
  });

  it("START + END → DONE", () => {
    expect(
      deriveStateFromEvents([
        { eventType: "START", occurredAt: t(0) },
        { eventType: "END", occurredAt: t(60) },
      ]),
    ).toBe("DONE");
  });

  it("START + PAUSE → PAUSED, RESUME → RUNNING, END → DONE", () => {
    const events = [
      { eventType: "START", occurredAt: t(0) } as const,
      { eventType: "PAUSE", occurredAt: t(30) } as const,
      { eventType: "RESUME", occurredAt: t(40) } as const,
      { eventType: "END", occurredAt: t(70) } as const,
    ];
    expect(deriveStateFromEvents(events)).toBe("DONE");
  });

  it("ungültige Events werden ignoriert (z. B. PAUSE im NOT_STARTED)", () => {
    expect(deriveStateFromEvents([{ eventType: "PAUSE", occurredAt: t(0) }])).toBe(
      "NOT_STARTED",
    );
  });

  it("doppelter START ändert State nicht", () => {
    expect(
      deriveStateFromEvents([
        { eventType: "START", occurredAt: t(0) },
        { eventType: "START", occurredAt: t(5) },
      ]),
    ).toBe("RUNNING");
  });
});

describe("isActionAllowed", () => {
  it("NOT_STARTED erlaubt nur START", () => {
    expect(isActionAllowed("NOT_STARTED", "START")).toBe(true);
    expect(isActionAllowed("NOT_STARTED", "PAUSE")).toBe(false);
    expect(isActionAllowed("NOT_STARTED", "END")).toBe(false);
  });

  it("RUNNING erlaubt PAUSE und END", () => {
    expect(isActionAllowed("RUNNING", "PAUSE")).toBe(true);
    expect(isActionAllowed("RUNNING", "END")).toBe(true);
    expect(isActionAllowed("RUNNING", "START")).toBe(false);
    expect(isActionAllowed("RUNNING", "RESUME")).toBe(false);
  });

  it("PAUSED erlaubt RESUME und END", () => {
    expect(isActionAllowed("PAUSED", "RESUME")).toBe(true);
    expect(isActionAllowed("PAUSED", "END")).toBe(true);
  });

  it("DONE erlaubt nichts mehr", () => {
    expect(isActionAllowed("DONE", "START")).toBe(false);
    expect(isActionAllowed("DONE", "END")).toBe(false);
  });
});

describe("calcStableActualMinutes (final)", () => {
  it("kein END → null", () => {
    expect(
      calcStableActualMinutes([{ eventType: "START", occurredAt: t(0) }]),
    ).toBeNull();
  });

  it("60 min linear", () => {
    expect(
      calcStableActualMinutes([
        { eventType: "START", occurredAt: t(0) },
        { eventType: "END", occurredAt: t(60) },
      ]),
    ).toBe(60);
  });

  it("mit Pause: Pausenzeit wird abgezogen", () => {
    // Lauf 0–30, Pause 30–45, Lauf 45–75 = 60 min Arbeit
    expect(
      calcStableActualMinutes([
        { eventType: "START", occurredAt: t(0) },
        { eventType: "PAUSE", occurredAt: t(30) },
        { eventType: "RESUME", occurredAt: t(45) },
        { eventType: "END", occurredAt: t(75) },
      ]),
    ).toBe(60);
  });

  it("zwei Pausen — alles korrekt summiert", () => {
    // Lauf 0–10 (10) + Lauf 30–50 (20) + Lauf 60–80 (20) = 50 min
    expect(
      calcStableActualMinutes([
        { eventType: "START", occurredAt: t(0) },
        { eventType: "PAUSE", occurredAt: t(10) },
        { eventType: "RESUME", occurredAt: t(30) },
        { eventType: "PAUSE", occurredAt: t(50) },
        { eventType: "RESUME", occurredAt: t(60) },
        { eventType: "END", occurredAt: t(80) },
      ]),
    ).toBe(50);
  });
});

describe("calcActualMinutes (live)", () => {
  it("DONE → identisch zu stable", () => {
    const events = [
      { eventType: "START", occurredAt: t(0) } as const,
      { eventType: "END", occurredAt: t(45) } as const,
    ];
    expect(calcActualMinutes(events)).toBe(45);
  });

  it("noch laufend → extrapoliert bis jetzt", () => {
    // Wir setzen einen Start "vor 5 Minuten" — Live sollte ~5 sein.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    const live = calcActualMinutes([{ eventType: "START", occurredAt: fiveMinAgo }]);
    expect(live).toBeGreaterThanOrEqual(4);
    expect(live).toBeLessThanOrEqual(6);
  });
});

describe("effectiveBilledMinutes", () => {
  it("ACTUAL nutzt actualMinutes wenn vorhanden", () => {
    expect(
      effectiveBilledMinutes({
        estimatedMinutes: 60,
        actualMinutes: 75,
        billedMinutes: null,
        billingTimeSource: "ACTUAL",
      }),
    ).toBe(75);
  });

  it("ACTUAL fällt auf estimated zurück wenn actual null", () => {
    expect(
      effectiveBilledMinutes({
        estimatedMinutes: 60,
        actualMinutes: null,
        billedMinutes: null,
        billingTimeSource: "ACTUAL",
      }),
    ).toBe(60);
  });

  it("ESTIMATED ignoriert actual und manual", () => {
    expect(
      effectiveBilledMinutes({
        estimatedMinutes: 60,
        actualMinutes: 90,
        billedMinutes: 120,
        billingTimeSource: "ESTIMATED",
      }),
    ).toBe(60);
  });

  it("MANUAL nutzt billedMinutes", () => {
    expect(
      effectiveBilledMinutes({
        estimatedMinutes: 60,
        actualMinutes: 90,
        billedMinutes: 80,
        billingTimeSource: "MANUAL",
      }),
    ).toBe(80);
  });

  it("MANUAL fällt auf estimated zurück wenn billedMinutes null", () => {
    expect(
      effectiveBilledMinutes({
        estimatedMinutes: 60,
        actualMinutes: 90,
        billedMinutes: null,
        billingTimeSource: "MANUAL",
      }),
    ).toBe(60);
  });
});
