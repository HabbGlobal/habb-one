/**
 * Verifiziert die Status-Ableitung in `getCompanyAttendanceSnapshot`:
 *   - APPROVED-Abwesenheit heute → ABSENT
 *   - Offene BreakEntry        → BREAK
 *   - today.isOpen             → IN (statusSince = letzter CLOCK_IN heute)
 *   - sonst                    → OUT (statusSince = letzter Punch heute, falls vorhanden)
 *
 * Plus: KPI-Aggregation summiert korrekt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  employeeFindMany: vi.fn(),
  timePunchFindMany: vi.fn(),
  breakEntryFindMany: vi.fn(),
  absenceFindMany: vi.fn(),
  // Für `getEmployeeKioskSummary` brauchen wir das interne findUniqueOrThrow.
  employeeFindUniqueOrThrow: vi.fn(),
  holidayFindMany: vi.fn().mockResolvedValue([]),
  absenceFindManyForService: vi.fn().mockResolvedValue([]),
  // service.ts (getDayStatsForRange) lädt heutige TimeEntries — das ist die
  // Single Source of Truth für `today.isOnBreak`/`today.isOpen`. Muss zu
  // `timePunchFindMany`/`breakEntryFindMany` konsistent gesetzt werden,
  // sonst testet man nicht den echten Code-Pfad (siehe Issue #12).
  timeEntryFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: {
      findMany: mocks.employeeFindMany,
      findUniqueOrThrow: mocks.employeeFindUniqueOrThrow,
      // service.ts (loadDayContext) ruft auch findUnique auf
      findUnique: vi.fn().mockResolvedValue({ companyId: "c1" }),
    },
    timePunch: { findMany: mocks.timePunchFindMany },
    breakEntry: { findMany: mocks.breakEntryFindMany },
    absence: {
      // attendance.ts ruft `absence.findMany` direkt auf,
      // service.ts ebenfalls (via loadDayContext). Beide nutzen denselben Mock.
      findMany: mocks.absenceFindMany,
    },
    holiday: { findMany: mocks.holidayFindMany },
    timeEntry: { findMany: mocks.timeEntryFindMany },
  },
}));

// Default Service-Calls returnen leere Arrays/Default-Werte
import { getCompanyAttendanceSnapshot } from "./attendance";

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === "function" && "mockReset" in m) m.mockReset();
  }
  mocks.holidayFindMany.mockResolvedValue([]);
  mocks.timeEntryFindMany.mockResolvedValue([]);
});

function defaultEmployeeRecord(id: string) {
  return {
    id,
    weeklyTargetHours: 42.5,
    scheduleDays: [
      { weekday: "MON", targetHours: 8.5 },
      { weekday: "TUE", targetHours: 8.5 },
      { weekday: "WED", targetHours: 8.5 },
      { weekday: "THU", targetHours: 8.5 },
      { weekday: "FRI", targetHours: 8.5 },
    ],
    companyId: "c1",
  };
}

describe("getCompanyAttendanceSnapshot — Status-Logik", () => {
  it("leerer Mandant → leerer Snapshot mit 0-KPIs", async () => {
    mocks.employeeFindMany.mockResolvedValue([]);

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T10:00:00Z"),
    );

    expect(snap.employees).toEqual([]);
    expect(snap.kpis.total).toBe(0);
    expect(snap.kpis.countIn).toBe(0);
  });

  it("ABSENT gewinnt über alles andere — wenn approved-Absence heute aktiv", async () => {
    mocks.employeeFindMany.mockResolvedValue([
      {
        id: "e1",
        firstName: "Max",
        lastName: "Muster",
        employeeNumber: "1",
      },
    ]);
    mocks.timePunchFindMany.mockResolvedValue([]);
    mocks.breakEntryFindMany.mockResolvedValue([]);
    mocks.absenceFindMany.mockResolvedValue([
      {
        employeeId: "e1",
        startDate: new Date("2025-05-12T00:00:00Z"),
        endDate: new Date("2025-05-16T00:00:00Z"),
        absenceType: {
          labelDe: "Ferien",
          category: "VACATION",
          reducesTarget: true,
        },
      },
    ]);
    mocks.employeeFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) return defaultEmployeeRecord("e1");
      return { companyId: "c1" };
    });

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T10:00:00Z"),
    );

    expect(snap.employees[0].status).toBe("ABSENT");
    expect(snap.employees[0].absenceLabel).toBe("Ferien");
    expect(snap.kpis.countAbsent).toBe(1);
  });

  it("BREAK greift bei offener BreakEntry (und keiner Abwesenheit)", async () => {
    mocks.employeeFindMany.mockResolvedValue([
      {
        id: "e2",
        firstName: "Anna",
        lastName: "Beispiel",
        employeeNumber: "2",
      },
    ]);
    mocks.timePunchFindMany.mockResolvedValue([
      {
        employeeId: "e2",
        type: "CLOCK_IN",
        occurredAt: new Date("2025-05-14T07:00:00Z"),
      },
      {
        employeeId: "e2",
        type: "BREAK_START",
        occurredAt: new Date("2025-05-14T12:00:00Z"),
      },
    ]);
    mocks.breakEntryFindMany.mockResolvedValue([
      {
        startedAt: new Date("2025-05-14T12:00:00Z"),
        timeEntry: { employeeId: "e2" },
      },
    ]);
    mocks.absenceFindMany.mockResolvedValue([]);
    // Muss zu `timePunchFindMany` oben passen: heute eingestempelt und in
    // Pause, damit `today.isOnBreak` (die Single Source of Truth) ebenfalls
    // BREAK ergibt — nicht nur die rohe BreakEntry-Query.
    mocks.timeEntryFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { where: { employeeId: string } };
      if (a.where.employeeId !== "e2") return [];
      return [
        {
          workDate: new Date("2025-05-14T00:00:00.000Z"),
          punches: [
            { type: "CLOCK_IN", occurredAt: new Date("2025-05-14T07:00:00Z") },
            { type: "BREAK_START", occurredAt: new Date("2025-05-14T12:00:00Z") },
          ],
          breaks: [
            { startedAt: new Date("2025-05-14T12:00:00Z"), endedAt: null },
          ],
        },
      ];
    });
    mocks.employeeFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) return defaultEmployeeRecord("e2");
      return { companyId: "c1" };
    });

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T12:30:00Z"),
    );

    expect(snap.employees[0].status).toBe("BREAK");
    expect(snap.employees[0].statusSinceIso).toBe(
      new Date("2025-05-14T12:00:00Z").toISOString(),
    );
    expect(snap.kpis.countBreak).toBe(1);
  });

  it("Regression #12: veraltete offene BreakEntry aus einem früheren Tag überschreibt nicht den heutigen Status", async () => {
    mocks.employeeFindMany.mockResolvedValue([
      {
        id: "e4",
        firstName: "Vijay",
        lastName: "Ajith",
        employeeNumber: "4",
      },
    ]);
    // Heute sauber ausgestempelt — keine Pause mehr offen.
    mocks.timePunchFindMany.mockResolvedValue([
      {
        employeeId: "e4",
        type: "CLOCK_OUT",
        occurredAt: new Date("2025-05-14T17:00:00Z"),
      },
      {
        employeeId: "e4",
        type: "CLOCK_IN",
        occurredAt: new Date("2025-05-14T07:00:00Z"),
      },
    ]);
    // Simuliert eine nie sauber geschlossene BreakEntry aus einem früheren
    // Tag (z. B. Alt-Daten oder eine Korrektur, die nur TimePunch statt
    // auch BreakEntry angepasst hat). Darf den heutigen Status nicht
    // überschreiben — das war genau der gemeldete Bug (Issue #12: Admin
    // Attendance zeigt stale "On Break", obwohl heute sauber ausgestempelt
    // wurde).
    mocks.breakEntryFindMany.mockResolvedValue([
      {
        startedAt: new Date("2025-05-10T12:00:00Z"),
        timeEntry: { employeeId: "e4" },
      },
    ]);
    mocks.absenceFindMany.mockResolvedValue([]);
    mocks.timeEntryFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { where: { employeeId: string } };
      if (a.where.employeeId !== "e4") return [];
      return [
        {
          workDate: new Date("2025-05-14T00:00:00.000Z"),
          punches: [
            { type: "CLOCK_IN", occurredAt: new Date("2025-05-14T07:00:00Z") },
            { type: "CLOCK_OUT", occurredAt: new Date("2025-05-14T17:00:00Z") },
          ],
          breaks: [],
        },
      ];
    });
    mocks.employeeFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) return defaultEmployeeRecord("e4");
      return { companyId: "c1" };
    });

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T18:00:00Z"),
    );

    expect(snap.employees[0].status).toBe("OUT");
  });

  it("OUT wenn keiner der oberen Fälle zutrifft; statusSince = letzter Punch heute", async () => {
    mocks.employeeFindMany.mockResolvedValue([
      {
        id: "e3",
        firstName: "Carl",
        lastName: "Citizen",
        employeeNumber: "3",
      },
    ]);
    mocks.timePunchFindMany.mockResolvedValue([
      {
        employeeId: "e3",
        type: "CLOCK_OUT",
        occurredAt: new Date("2025-05-14T15:30:00Z"),
      },
      {
        employeeId: "e3",
        type: "CLOCK_IN",
        occurredAt: new Date("2025-05-14T07:00:00Z"),
      },
    ]);
    mocks.breakEntryFindMany.mockResolvedValue([]);
    mocks.absenceFindMany.mockResolvedValue([]);
    mocks.employeeFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) return defaultEmployeeRecord("e3");
      return { companyId: "c1" };
    });

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T16:00:00Z"),
    );

    expect(snap.employees[0].status).toBe("OUT");
    expect(snap.employees[0].statusSinceIso).toBe(
      new Date("2025-05-14T15:30:00Z").toISOString(),
    );
    expect(snap.kpis.countOut).toBe(1);
  });

  it("Mehrere Mitarbeiter — KPIs summieren korrekt", async () => {
    mocks.employeeFindMany.mockResolvedValue([
      { id: "a", firstName: "A", lastName: "A", employeeNumber: "1" },
      { id: "b", firstName: "B", lastName: "B", employeeNumber: "2" },
      { id: "c", firstName: "C", lastName: "C", employeeNumber: "3" },
    ]);
    // A: in Pause, B: ausgestempelt, C: in Ferien
    mocks.timePunchFindMany.mockResolvedValue([]);
    mocks.breakEntryFindMany.mockResolvedValue([
      {
        startedAt: new Date("2025-05-14T12:00:00Z"),
        timeEntry: { employeeId: "a" },
      },
    ]);
    mocks.absenceFindMany.mockResolvedValue([
      {
        employeeId: "c",
        startDate: new Date("2025-05-12T00:00:00Z"),
        endDate: new Date("2025-05-16T00:00:00Z"),
        absenceType: {
          labelDe: "Ferien",
          category: "VACATION",
          reducesTarget: true,
        },
      },
    ]);
    // "a" konsistent als heute-in-Pause modellieren (siehe Kommentar oben).
    mocks.timeEntryFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { where: { employeeId: string } };
      if (a.where.employeeId !== "a") return [];
      return [
        {
          workDate: new Date("2025-05-14T00:00:00.000Z"),
          punches: [
            { type: "CLOCK_IN", occurredAt: new Date("2025-05-14T07:00:00Z") },
            { type: "BREAK_START", occurredAt: new Date("2025-05-14T12:00:00Z") },
          ],
          breaks: [
            { startedAt: new Date("2025-05-14T12:00:00Z"), endedAt: null },
          ],
        },
      ];
    });
    mocks.employeeFindUniqueOrThrow.mockImplementation(async () => ({
      id: "x",
      weeklyTargetHours: 0,
      scheduleDays: [],
      companyId: "c1",
    }));

    const snap = await getCompanyAttendanceSnapshot(
      "c1",
      new Date("2025-05-14T13:00:00Z"),
    );

    expect(snap.kpis.total).toBe(3);
    expect(snap.kpis.countBreak).toBe(1);
    expect(snap.kpis.countAbsent).toBe(1);
    expect(snap.kpis.countOut).toBe(1);
    expect(snap.kpis.countIn).toBe(0);
  });
});
