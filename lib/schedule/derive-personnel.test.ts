import { describe, it, expect } from "vitest";
import {
  derivePersonnelFromWorkshop,
  type WorkshopBooking,
  type MachineLite,
  type AreaSpec,
  type EmployeeSpec,
  type AbsenceWindow,
  type ExistingScheduleEntry,
} from "./derive-personnel";

// ─── Test-Fixtures ──────────────────────────────────────

const MACHINES: MachineLite[] = [
  { id: "m_blast", workAreaId: "a_blast" },
  { id: "m_powder", workAreaId: "a_powder" },
  { id: "m_orphan", workAreaId: null }, // keiner zugeordnet
];

const AREAS: AreaSpec[] = [
  { id: "a_blast", name: "Sandstrahlen", minEmployeesPerDay: null, maxEmployeesPerDay: 2 },
  { id: "a_powder", name: "Pulvern", minEmployeesPerDay: 1, maxEmployeesPerDay: null },
];

const EMPS: EmployeeSpec[] = [
  { id: "e1", name: "Anna", areaIds: ["a_blast"] },
  { id: "e2", name: "Beni", areaIds: ["a_blast", "a_powder"] },
  { id: "e3", name: "Carlo", areaIds: ["a_powder"] },
];

// ─── Tests ──────────────────────────────────────────────

describe("derivePersonnelFromWorkshop — basic happy path", () => {
  it("weist 1 Mitarbeiter pro Bereich pro Tag zu (Bedarf < 8h)", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 240 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].workAreaId).toBe("a_blast");
    expect(result.conflicts).toHaveLength(0);
  });

  it("rundet bei viel Last hoch — 16h → 2 Mitarbeiter", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 16 * 60 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    const blastAssignments = result.assignments.filter((a) => a.workAreaId === "a_blast");
    expect(blastAssignments).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it("respektiert minEmployeesPerDay (Pulvern braucht ≥1, auch bei kleiner Last)", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_powder", minutes: 30 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].workAreaId).toBe("a_powder");
  });

  it("respektiert maxEmployeesPerDay (Sandstrahlen max 2 — auch bei 30h Last)", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 30 * 60 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    const blastAssignments = result.assignments.filter((a) => a.workAreaId === "a_blast");
    expect(blastAssignments).toHaveLength(2);
    // Aber Konflikt vermerkt
    expect(result.conflicts.some((c) => c.type === "OVER_MAX_CAPACITY")).toBe(true);
  });
});

describe("derivePersonnelFromWorkshop — Verfügbarkeit", () => {
  it("schließt abwesende Mitarbeiter aus", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 240 },
    ];
    const absences: AbsenceWindow[] = [
      { employeeId: "e1", startDate: "2026-05-04", endDate: "2026-05-08" },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences,
      existing: [],
    });
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].employeeId).toBe("e2"); // Anna fällt weg, Beni übernimmt
  });

  it("meldet AREA_UNDERSTAFFED wenn alle Mitarbeiter abwesend sind", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 16 * 60 },
    ];
    const absences: AbsenceWindow[] = [
      { employeeId: "e1", startDate: "2026-05-04", endDate: "2026-05-04" },
      { employeeId: "e2", startDate: "2026-05-04", endDate: "2026-05-04" },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences,
      existing: [],
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.conflicts.some((c) => c.type === "AREA_UNDERSTAFFED")).toBe(true);
  });

  it("ein Mitarbeiter darf nicht 2 Bereichen gleichzeitig zugewiesen werden", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 16 * 60 }, // 2 Köpfe
      { date: "2026-05-04", machineId: "m_powder", minutes: 240 }, // 1 Kopf
    ];
    // Nur Beni kann beide Bereiche
    const empsLimited: EmployeeSpec[] = [
      { id: "e1", name: "Anna", areaIds: ["a_blast"] },
      { id: "e2", name: "Beni", areaIds: ["a_blast", "a_powder"] },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: empsLimited,
      absences: [],
      existing: [],
    });
    // Anna + Beni → Sandstrahlen.  Pulvern bleibt unbesetzt.
    expect(result.conflicts.some((c) => c.type === "AREA_UNDERSTAFFED" && c.areaId === "a_powder")).toBe(true);
    // Kein Mitarbeiter zweimal pro Tag
    const empDayKeys = result.assignments.map((a) => `${a.employeeId}|${a.date}`);
    expect(new Set(empDayKeys).size).toBe(empDayKeys.length);
  });
});

describe("derivePersonnelFromWorkshop — Bestand schützen", () => {
  it("überspringt Tage, an denen ein MANUAL-Eintrag liegt", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 240 },
    ];
    const existing: ExistingScheduleEntry[] = [
      {
        employeeId: "e1",
        date: "2026-05-04",
        type: "VACATION",
        source: "MANUAL",
        workAreaId: null,
      },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing,
    });
    // Anna ist auf Ferien (manual) — Beni übernimmt
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].employeeId).toBe("e2");
  });

  it("zählt manuelle WORK-Einträge als bereits zugewiesen", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 16 * 60 }, // brauche 2
    ];
    const existing: ExistingScheduleEntry[] = [
      {
        employeeId: "e1",
        date: "2026-05-04",
        type: "WORK",
        source: "MANUAL",
        workAreaId: "a_blast",
      },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing,
    });
    // Anna ist schon manuell drin → wir brauchen nur noch 1 (Beni)
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].employeeId).toBe("e2");
    expect(result.conflicts).toHaveLength(0);
  });

  it("überschreibt AUTO-Einträge wenn overwriteAuto=true", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 240 },
    ];
    // Anna war vorher AUTO im Pulvern-Bereich zugewiesen
    const existing: ExistingScheduleEntry[] = [
      {
        employeeId: "e1",
        date: "2026-05-04",
        type: "WORK",
        source: "AUTO",
        workAreaId: "a_powder",
      },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing,
      options: { overwriteAuto: true },
    });
    // Anna wird in Sandstrahlen verschoben
    const annaAssignment = result.assignments.find((a) => a.employeeId === "e1");
    expect(annaAssignment?.workAreaId).toBe("a_blast");
  });
});

describe("derivePersonnelFromWorkshop — Konflikte", () => {
  it("Maschine ohne Bereich → Konflikt MACHINE_NO_AREA", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_orphan", minutes: 240 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    expect(result.conflicts.some((c) => c.type === "MACHINE_NO_AREA")).toBe(true);
    expect(result.assignments).toHaveLength(0);
  });

  it("Bereich ohne Mitarbeiter → Konflikt AREA_NO_MEMBERS", () => {
    const empsNoArea: EmployeeSpec[] = [
      { id: "e1", name: "Anna", areaIds: ["a_blast"] }, // niemand für Pulvern
    ];
    const result = derivePersonnelFromWorkshop({
      bookings: [],
      machines: MACHINES,
      areas: AREAS,
      employees: empsNoArea,
      absences: [],
      existing: [],
    });
    expect(result.conflicts.some((c) => c.type === "AREA_NO_MEMBERS" && c.areaId === "a_powder")).toBe(true);
  });
});

describe("derivePersonnelFromWorkshop — Round-Robin Last-Balance", () => {
  it("verteilt Zuweisungen über Mitarbeiter über Tage", () => {
    // 3 Tage à 4h Sandstrahlen — sollte gleichmässig auf Anna+Beni verteilen
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 240 },
      { date: "2026-05-05", machineId: "m_blast", minutes: 240 },
      { date: "2026-05-06", machineId: "m_blast", minutes: 240 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    expect(result.assignments).toHaveLength(3);
    const annaCount = result.assignments.filter((a) => a.employeeId === "e1").length;
    const beniCount = result.assignments.filter((a) => a.employeeId === "e2").length;
    // Differenz max 1 (3 Tage / 2 Mitarbeiter ≈ 1.5)
    expect(Math.abs(annaCount - beniCount)).toBeLessThanOrEqual(1);
  });
});

describe("derivePersonnelFromWorkshop — Summary", () => {
  it("liefert pro Tag Aufschlüsselung Bedarf vs zugewiesen", () => {
    const bookings: WorkshopBooking[] = [
      { date: "2026-05-04", machineId: "m_blast", minutes: 16 * 60 },
      { date: "2026-05-04", machineId: "m_powder", minutes: 4 * 60 },
    ];
    const result = derivePersonnelFromWorkshop({
      bookings,
      machines: MACHINES,
      areas: AREAS,
      employees: EMPS,
      absences: [],
      existing: [],
    });
    expect(result.summaryByDate).toHaveLength(1);
    const day = result.summaryByDate[0];
    expect(day.date).toBe("2026-05-04");
    const blast = day.byArea.find((a) => a.areaId === "a_blast");
    const powder = day.byArea.find((a) => a.areaId === "a_powder");
    expect(blast?.demand).toBe(2);
    expect(blast?.assigned).toBe(2);
    expect(powder?.demand).toBe(1);
    expect(powder?.assigned).toBe(1);
  });
});
