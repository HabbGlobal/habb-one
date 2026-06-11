import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  buildMachineUtilization,
  calcAvailableMinutes,
  calcBookedMinutes,
} from "./machine-utilization";
import { DEFAULT_WORKING_HOURS } from "@/lib/scheduler/calendar";

const ch = (iso: string) => fromZonedTime(iso, "Europe/Zurich");

describe("calcAvailableMinutes", () => {
  it("eine Standard-Werktagswoche → 5 × 8.5h = 42.5h = 2550 Min", () => {
    const m = {
      workingHours: DEFAULT_WORKING_HOURS,
      maintenanceWindows: [],
    };
    const min = calcAvailableMinutes(
      m,
      new Set(),
      ch("2026-05-04T00:00:00"), // Mo
      ch("2026-05-09T00:00:00"), // Sa 00:00 = nach Fr-Schluss
    );
    // 5 Tage × 510 Min (8h30) = 2550
    expect(min).toBe(2550);
  });

  it("ein Feiertag mitten in der Woche → 4 Tage × 510 = 2040", () => {
    const m = {
      workingHours: DEFAULT_WORKING_HOURS,
      maintenanceWindows: [],
    };
    const holidays = new Set(["2026-05-06"]);
    const min = calcAvailableMinutes(
      m,
      holidays,
      ch("2026-05-04T00:00:00"),
      ch("2026-05-09T00:00:00"),
    );
    expect(min).toBe(4 * 510);
  });

  it("Wartung blockiert ihre Stunden", () => {
    const m = {
      workingHours: DEFAULT_WORKING_HOURS,
      maintenanceWindows: [
        // Mo 09:00-11:00 = 2h Wartung
        {
          startsAt: ch("2026-05-04T09:00:00"),
          endsAt: ch("2026-05-04T11:00:00"),
        },
      ],
    };
    const min = calcAvailableMinutes(
      m,
      new Set(),
      ch("2026-05-04T00:00:00"),
      ch("2026-05-09T00:00:00"),
    );
    expect(min).toBe(2550 - 120);
  });
});

describe("calcBookedMinutes", () => {
  it("simple 2h Buchung", () => {
    const min = calcBookedMinutes(
      [
        {
          plannedStart: ch("2026-05-04T08:00:00"),
          plannedEnd: ch("2026-05-04T10:00:00"),
        },
      ],
      ch("2026-05-04T00:00:00"),
      ch("2026-05-09T00:00:00"),
    );
    expect(min).toBe(120);
  });

  it("Buchung clamped wenn sie über das Ende der Periode hinaus geht", () => {
    const min = calcBookedMinutes(
      [
        {
          plannedStart: ch("2026-05-04T16:00:00"),
          plannedEnd: ch("2026-05-05T11:00:00"), // 19h später
        },
      ],
      ch("2026-05-04T00:00:00"),
      ch("2026-05-04T17:00:00"),
    );
    // Periode endet 17:00 → nur 16:00-17:00 = 60 Min
    expect(min).toBe(60);
  });

  it("Buchung komplett außerhalb → 0", () => {
    const min = calcBookedMinutes(
      [
        {
          plannedStart: ch("2026-05-10T08:00:00"),
          plannedEnd: ch("2026-05-10T10:00:00"),
        },
      ],
      ch("2026-05-04T00:00:00"),
      ch("2026-05-09T00:00:00"),
    );
    expect(min).toBe(0);
  });
});

describe("buildMachineUtilization", () => {
  it("eine Maschine mit 2h Buchung in einer Woche → 120 / 2550 ≈ 4.71%", () => {
    const r = buildMachineUtilization({
      company: { name: "Test" },
      period: {
        from: ch("2026-05-04T00:00:00"),
        to: ch("2026-05-09T00:00:00"),
      },
      machines: [
        {
          id: "m1",
          companyId: "c",
          workAreaId: null,
          name: "Sandstrahl 1",
          type: "BLAST_CABIN",
          maxLengthMm: null,
          maxWidthMm: null,
          maxHeightMm: null,
          maxWeightKg: null,
          chargeCapacityM2: null,
          isActive: true,
          workingHours: DEFAULT_WORKING_HOURS as unknown as never,
          archivedAt: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          maintenanceWindows: [],
          scheduleEntries: [
            {
              id: "e1",
              processStepId: "s",
              orderId: "o",
              assignedUserId: null,
              machineId: "m1",
              plannedStart: ch("2026-05-05T08:00:00"),
              plannedEnd: ch("2026-05-05T10:00:00"),
              actualStart: null,
              actualEnd: null,
              isLocked: false,
              isAutoPlanned: true,
            },
          ],
        },
      ],
      holidays: new Set(),
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].availableMinutes).toBe(2550);
    expect(r.rows[0].bookedMinutes).toBe(120);
    expect(r.rows[0].utilizationPct).toBeCloseTo(4.71, 2);
  });
});
