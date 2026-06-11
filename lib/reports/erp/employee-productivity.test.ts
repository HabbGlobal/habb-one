import { describe, expect, it } from "vitest";
import { buildEmployeeProductivity } from "./employee-productivity";

const company = { name: "Test" };
const period = {
  from: new Date("2026-05-01T00:00:00.000Z"),
  to: new Date("2026-05-31T23:59:59.999Z"),
};

const t = (mins: number) => new Date(Date.UTC(2026, 4, 4, 8, 0) + mins * 60_000);

const emp = (id: string, num: string, last: string) => ({
  id,
  employeeNumber: num,
  firstName: "F",
  lastName: last,
});

const ev = (
  emp: string,
  type: "START" | "PAUSE" | "RESUME" | "END",
  mins: number,
  source: "ACTUAL" | "ESTIMATED" | "MANUAL" = "ACTUAL",
  orderStatus: "DELIVERED" | "CANCELLED" | "IN_PROGRESS" = "DELIVERED",
) => ({
  eventType: type,
  occurredAt: t(mins),
  employeeId: emp,
  step: { billingTimeSource: source, orderStatus },
});

describe("buildEmployeeProductivity", () => {
  it("Mitarbeiter ohne Events → 0 Min, 0 Schritte", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "Müller")],
      events: [],
    });
    expect(r.rows[0].totalMinutes).toBe(0);
    expect(r.rows[0].stepCount).toBe(0);
  });

  it("Ein Schritt 60 Min, Source=ACTUAL → billable = total = 60", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "Müller")],
      events: [ev("e1", "START", 0), ev("e1", "END", 60)],
    });
    expect(r.rows[0].totalMinutes).toBe(60);
    expect(r.rows[0].billableMinutes).toBe(60);
    expect(r.rows[0].stepCount).toBe(1);
    expect(r.rows[0].billableQuotaPct).toBe(100);
  });

  it("Mit Pause: 60 - 20 Pause = 40 Min Arbeit", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "Müller")],
      events: [
        ev("e1", "START", 0),
        ev("e1", "PAUSE", 30),
        ev("e1", "RESUME", 50),
        ev("e1", "END", 60),
      ],
    });
    // 0-30 (30 Min) + 50-60 (10 Min) = 40
    expect(r.rows[0].totalMinutes).toBe(40);
  });

  it("ESTIMATED source → nicht billable", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "Müller")],
      events: [
        ev("e1", "START", 0, "ESTIMATED"),
        ev("e1", "END", 60, "ESTIMATED"),
      ],
    });
    expect(r.rows[0].totalMinutes).toBe(60);
    expect(r.rows[0].billableMinutes).toBe(0);
  });

  it("CANCELLED Order → nicht billable", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "Müller")],
      events: [
        ev("e1", "START", 0, "ACTUAL", "CANCELLED"),
        ev("e1", "END", 60, "ACTUAL", "CANCELLED"),
      ],
    });
    expect(r.rows[0].totalMinutes).toBe(60);
    expect(r.rows[0].billableMinutes).toBe(0);
  });

  it("Zwei Mitarbeiter mit verschiedenen Steps werden separat berechnet", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [
        emp("e1", "001", "A"),
        emp("e2", "002", "B"),
      ],
      events: [
        ev("e1", "START", 0),
        ev("e1", "END", 60),
        ev("e2", "START", 30),
        ev("e2", "END", 90),
      ],
    });
    const eA = r.rows.find((x) => x.employeeId === "e1")!;
    const eB = r.rows.find((x) => x.employeeId === "e2")!;
    expect(eA.totalMinutes).toBe(60);
    expect(eB.totalMinutes).toBe(60);
  });

  it("Sortierung: produktivster oben", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "A"), emp("e2", "002", "B")],
      events: [
        ev("e2", "START", 0),
        ev("e2", "END", 100),
        ev("e1", "START", 0),
        ev("e1", "END", 30),
      ],
    });
    expect(r.rows[0].employeeId).toBe("e2");
    expect(r.rows[1].employeeId).toBe("e1");
  });

  it("Totals: aggregiert über alle Mitarbeiter", () => {
    const r = buildEmployeeProductivity({
      company,
      period,
      employees: [emp("e1", "001", "A"), emp("e2", "002", "B")],
      events: [
        ev("e1", "START", 0),
        ev("e1", "END", 60),
        ev("e2", "START", 0, "ESTIMATED"),
        ev("e2", "END", 30, "ESTIMATED"),
      ],
    });
    expect(r.totals.totalMinutes).toBe(90);
    expect(r.totals.billableMinutes).toBe(60);
    expect(r.totals.billableQuotaPct).toBeCloseTo(66.67, 1);
    expect(r.totals.employeeCount).toBe(2); // beide haben > 0 Min
  });
});
