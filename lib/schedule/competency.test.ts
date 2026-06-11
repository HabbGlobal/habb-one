import { describe, expect, it } from "vitest";
import {
  autoPlan,
  hasCompetency,
  isAbsentOn,
  validateAssignment,
  type AreaSpec,
  type EmployeeSpec,
  type ExistingEntry,
} from "./competency";

const sandstrahlen: AreaSpec = { id: "a-sand", name: "Sandstrahlen", maxEmployeesPerDay: 1 };
const pulvern: AreaSpec = { id: "a-pul", name: "Pulvern", maxEmployeesPerDay: 1 };
const lieferung: AreaSpec = { id: "a-lief", name: "Lieferung", maxEmployeesPerDay: null };
const vorNach: AreaSpec = {
  id: "a-vor",
  name: "Vor- & Nachbereitung",
  minEmployeesPerDay: 2,
  maxEmployeesPerDay: null,
};

const hans: EmployeeSpec = {
  id: "e-hans",
  name: "Müller, Hans",
  competencyAreaIds: ["a-sand", "a-pul"],
  weekdayTargets: [8.4, 8.4, 8.4, 8.4, 8.4, 0, 0],
};
const anna: EmployeeSpec = {
  id: "e-anna",
  name: "Keller, Anna",
  competencyAreaIds: ["a-sand"],
  weekdayTargets: [8.4, 8.4, 8.4, 8.4, 0, 0, 0],
};
const stefan: EmployeeSpec = {
  id: "e-stef",
  name: "Bachmann, Stefan",
  competencyAreaIds: ["a-pul", "a-lief"],
  weekdayTargets: [0, 6.3, 6.3, 6.3, 6.3, 0, 0],
};

describe("hasCompetency", () => {
  it("matches by id", () => {
    expect(hasCompetency(hans, "a-sand")).toBe(true);
    expect(hasCompetency(hans, "a-lief")).toBe(false);
  });
});

describe("isAbsentOn", () => {
  it("treats reducesTarget=true absences as blocking", () => {
    const absences = [
      { employeeId: "e-hans", startDate: "2026-05-04", endDate: "2026-05-08", reducesTarget: true },
    ];
    expect(isAbsentOn("e-hans", "2026-05-05", absences)).toBe(true);
    expect(isAbsentOn("e-hans", "2026-05-09", absences)).toBe(false);
    expect(isAbsentOn("e-anna", "2026-05-05", absences)).toBe(false);
  });
  it("ignores non-target-reducing absences", () => {
    expect(
      isAbsentOn("e-hans", "2026-05-05", [
        { employeeId: "e-hans", startDate: "2026-05-04", endDate: "2026-05-06", reducesTarget: false },
      ])
    ).toBe(false);
  });
});

describe("validateAssignment", () => {
  it("blocks employees without competency", () => {
    expect(
      validateAssignment({
        area: lieferung,
        employee: hans,
        date: "2026-05-04",
        existingEntries: [],
      })
    ).toEqual({ kind: "MISSING_COMPETENCY", employeeId: "e-hans", areaId: "a-lief" });
  });
  it("permits competent employees when capacity has room", () => {
    expect(
      validateAssignment({
        area: sandstrahlen,
        employee: hans,
        date: "2026-05-04",
        existingEntries: [],
      })
    ).toBeNull();
  });
  it("blocks when capacity already used by someone else", () => {
    const existing: ExistingEntry[] = [
      { employeeId: "e-anna", date: "2026-05-04", type: "WORK", workAreaId: "a-sand" },
    ];
    expect(
      validateAssignment({
        area: sandstrahlen,
        employee: hans,
        date: "2026-05-04",
        existingEntries: existing,
      })
    ).toEqual({
      kind: "CAPACITY_EXCEEDED",
      areaId: "a-sand",
      date: "2026-05-04",
      capacity: 1,
      current: 1,
    });
  });
  it("does not block when re-saving the same employee's existing assignment", () => {
    const existing: ExistingEntry[] = [
      { employeeId: "e-hans", date: "2026-05-04", type: "WORK", workAreaId: "a-sand" },
    ];
    expect(
      validateAssignment({
        area: sandstrahlen,
        employee: hans,
        date: "2026-05-04",
        existingEntries: existing,
        excludeEmployeeId: "e-hans",
      })
    ).toBeNull();
  });
  it("treats unlimited capacity as never blocked", () => {
    const existing: ExistingEntry[] = Array.from({ length: 50 }, (_, i) => ({
      employeeId: `other-${i}`,
      date: "2026-05-04",
      type: "WORK" as const,
      workAreaId: "a-lief",
    }));
    expect(
      validateAssignment({
        area: lieferung,
        employee: stefan,
        date: "2026-05-04",
        existingEntries: existing,
      })
    ).toBeNull();
  });
});

describe("autoPlan with minimums", () => {
  // 5 employees, all qualified for everything (so we test purely the
  // ordering / minimum-satisfaction logic).
  const universal = (id: string, name: string): EmployeeSpec => ({
    id,
    name,
    competencyAreaIds: ["a-sand", "a-pul", "a-vor", "a-lief"],
    weekdayTargets: [],
  });

  it("satisfies area minimums before filling max-1 capacity areas", () => {
    // 3 employees only; minimums require 2 for Vor + 1 for Sand + 1 for Pul = 4.
    // Vor min=2 must still be met; pulvern may end up empty.
    const result = autoPlan({
      workDates: ["2026-05-04"],
      holidayDates: [],
      areas: [sandstrahlen, pulvern, vorNach, lieferung],
      employees: [
        universal("e-1", "A"),
        universal("e-2", "B"),
        universal("e-3", "C"),
      ],
      absences: [],
      existingEntries: [],
    });
    const vorAssignments = result.assignments.filter(
      (a) => a.areaId === "a-vor"
    );
    expect(vorAssignments).toHaveLength(2);
  });

  it("flags unfilled-min when too few competent people present", () => {
    const result = autoPlan({
      workDates: ["2026-05-04"],
      holidayDates: [],
      areas: [vorNach],
      employees: [universal("e-1", "Solo")],
      absences: [],
      existingEntries: [],
    });
    expect(result.assignments).toHaveLength(1);
    const minViolation = result.unfilledSlots.find((u) =>
      u.reason.includes("Mindestbesetzung")
    );
    expect(minViolation).toBeDefined();
    expect(minViolation?.areaId).toBe("a-vor");
  });

  it("fills the rest greedily after minimums are met", () => {
    // 5 employees: Vor min=2 → 2 go there, then unlimited Vor pulls more.
    const result = autoPlan({
      workDates: ["2026-05-04"],
      holidayDates: [],
      areas: [sandstrahlen, pulvern, vorNach, lieferung],
      employees: [
        universal("e-1", "A"),
        universal("e-2", "B"),
        universal("e-3", "C"),
        universal("e-4", "D"),
        universal("e-5", "E"),
      ],
      absences: [],
      existingEntries: [],
    });
    // 5 employees → exactly 5 assignments (1 each)
    expect(result.assignments).toHaveLength(5);
    expect(
      result.assignments.filter((a) => a.areaId === "a-sand").length
    ).toBe(1);
    expect(
      result.assignments.filter((a) => a.areaId === "a-pul").length
    ).toBe(1);
    expect(
      result.assignments.filter((a) => a.areaId === "a-vor").length
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("autoPlan", () => {
  it("respects capacity, competency, and absences", () => {
    const result = autoPlan({
      workDates: ["2026-05-04", "2026-05-05"],
      holidayDates: [],
      areas: [sandstrahlen, pulvern, lieferung],
      employees: [hans, anna, stefan],
      absences: [
        // Hans on vacation Mon
        { employeeId: "e-hans", startDate: "2026-05-04", endDate: "2026-05-04", reducesTarget: true },
      ],
      existingEntries: [],
    });

    // Mon: Hans absent → Sandstrahlen goes to Anna. Pulvern goes to Stefan. Lieferung also Stefan? But Stefan locked after Pulvern.
    // So Mon: Anna→Sandstrahlen, Stefan→Pulvern. Lieferung empty (no other competent).
    const monAssignments = result.assignments.filter((a) => a.date === "2026-05-04");
    expect(monAssignments).toContainEqual({
      employeeId: "e-anna",
      areaId: "a-sand",
      date: "2026-05-04",
    });
    expect(monAssignments).toContainEqual({
      employeeId: "e-stef",
      areaId: "a-pul",
      date: "2026-05-04",
    });
    // Tue: Hans available → because of load balancing, Hans gets Sandstrahlen
    // (Anna already had it). Stefan keeps Pulvern.
    const tueAssignments = result.assignments.filter((a) => a.date === "2026-05-05");
    expect(tueAssignments).toContainEqual({
      employeeId: "e-hans",
      areaId: "a-sand",
      date: "2026-05-05",
    });
  });

  it("does not double-book: an employee planned in a 1-cap area is not added to another", () => {
    const result = autoPlan({
      workDates: ["2026-05-04"],
      holidayDates: [],
      areas: [sandstrahlen, pulvern, lieferung],
      employees: [hans],
      absences: [],
      existingEntries: [],
    });
    // Hans is competent for Sandstrahlen + Pulvern but should only be
    // assigned once on Monday (Sandstrahlen, since it's first).
    const hansAssignments = result.assignments.filter((a) => a.employeeId === "e-hans");
    expect(hansAssignments).toHaveLength(1);
    expect(hansAssignments[0].areaId).toBe("a-sand");
  });

  it("skips holidays entirely", () => {
    const result = autoPlan({
      workDates: ["2026-05-01", "2026-05-04"],
      holidayDates: ["2026-05-01"],
      areas: [sandstrahlen],
      employees: [anna],
      absences: [],
      existingEntries: [],
    });
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].date).toBe("2026-05-04");
  });

  it("skips employees with FREE/VACATION existing entries", () => {
    const result = autoPlan({
      workDates: ["2026-05-04"],
      holidayDates: [],
      areas: [sandstrahlen],
      employees: [anna],
      absences: [],
      existingEntries: [
        { employeeId: "e-anna", date: "2026-05-04", type: "FREE", workAreaId: null },
      ],
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.unfilledSlots).toHaveLength(1);
  });

  it("balances load across days", () => {
    const result = autoPlan({
      workDates: ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"],
      holidayDates: [],
      areas: [sandstrahlen],
      employees: [hans, anna], // both qualified for Sandstrahlen
      absences: [],
      existingEntries: [],
    });
    const hansCount = result.assignments.filter((a) => a.employeeId === "e-hans").length;
    const annaCount = result.assignments.filter((a) => a.employeeId === "e-anna").length;
    // 4 days, 2 candidates → 2 each.
    expect(hansCount).toBe(2);
    expect(annaCount).toBe(2);
  });
});
