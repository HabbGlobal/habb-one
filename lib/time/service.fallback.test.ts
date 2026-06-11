/**
 * Verifiziert den Fallback-Pfad in `loadEmployeeWithSchedule`:
 *   - Wenn ein Employee `weeklyTargetHours > 0` hat, aber keine
 *     expliziten `WorkScheduleDay`-Rows, wird die Wochenverteilung
 *     Mo-Fr at runtime synthetisiert — sodass der Kiosk korrekt
 *     "Soll" anzeigt, statt 0:00.
 *
 *   - Wenn EXPLIZITE scheduleDays existieren (Σ > 0), bleibt das
 *     unangetastet und der Fallback greift NICHT.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: damit die Mock-Refs zur Hoisting-Zeit von vi.mock existieren.
const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: { findUniqueOrThrow: mocks.findUniqueOrThrow },
    holiday: { findMany: vi.fn().mockResolvedValue([]) },
    absence: { findMany: vi.fn().mockResolvedValue([]) },
    timeEntry: { findMany: vi.fn().mockResolvedValue([]) },
    break: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { getEmployeeKioskSummary } from "./service";

const mockFindUniqueOrThrow = mocks.findUniqueOrThrow;

beforeEach(() => {
  mockFindUniqueOrThrow.mockReset();
});

describe("loadEmployeeWithSchedule — Fallback bei fehlenden scheduleDays", () => {
  it("synthetisiert Mo-Fr aus weeklyTargetHours, wenn scheduleDays leer", async () => {
    // Erster Call (loadEmployeeWithSchedule): liefert die scheduleDays-Lücke
    // Zweiter Call (loadDayContext): liefert nur die companyId
    mockFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) {
        // → loadEmployeeWithSchedule
        return {
          id: "e1",
          weeklyTargetHours: 42.5,
          scheduleDays: [], // ← Lücke
        };
      }
      // → loadDayContext
      return { companyId: "c1" };
    });

    // Eine Woche Mitte Mai 2025 (Mo-So), ohne Holidays/Absences/Punches
    const summary = await getEmployeeKioskSummary(
      "e1",
      new Date("2025-05-14T10:00:00Z"), // ein Mittwoch
    );

    // 42.5h / 5 Tage = 8.5h pro Mo-Fr = 510 min × 5 = 2550 min Woche.
    // Wir akzeptieren Rundungs-Toleranz auf ±5 Minuten.
    expect(summary.weekTotals.targetMinutes).toBeGreaterThan(2540);
    expect(summary.weekTotals.targetMinutes).toBeLessThan(2560);
  });

  it("respektiert explizite scheduleDays — kein Fallback wenn Σ > 0", async () => {
    mockFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) {
        return {
          id: "e2",
          weeklyTargetHours: 42.5, // wäre vorhanden, soll aber IGNORIERT werden
          scheduleDays: [
            // Explizit nur 3 Tage à 4h = 12h Soll
            { weekday: "MON", targetHours: 4 },
            { weekday: "WED", targetHours: 4 },
            { weekday: "FRI", targetHours: 4 },
          ],
        };
      }
      return { companyId: "c1" };
    });

    const summary = await getEmployeeKioskSummary(
      "e2",
      new Date("2025-05-14T10:00:00Z"),
    );

    // Erwartung: 12h × 60 = 720 min — explizite scheduleDays gewinnen,
    // weeklyTargetHours wird ignoriert.
    expect(summary.weekTotals.targetMinutes).toBe(720);
  });

  it("Soll = 0 bleibt, wenn weder scheduleDays noch weeklyTargetHours gesetzt sind", async () => {
    mockFindUniqueOrThrow.mockImplementation(async (args: unknown) => {
      const a = args as { select?: { weeklyTargetHours?: boolean } };
      if (a.select?.weeklyTargetHours) {
        return { id: "e3", weeklyTargetHours: null, scheduleDays: [] };
      }
      return { companyId: "c1" };
    });

    const summary = await getEmployeeKioskSummary(
      "e3",
      new Date("2025-05-14T10:00:00Z"),
    );

    expect(summary.weekTotals.targetMinutes).toBe(0);
  });
});
