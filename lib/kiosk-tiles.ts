// Shared employee-grid computation for the kiosk employee picker. Used by
// both the server-rendered web page (app/kiosk/page.tsx) and the JSON API
// consumed by the mobile kiosk app (app/api/kiosk/employees/route.ts) so the
// two clients can never drift out of sync on status logic.

import { prisma } from "@/lib/prisma";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { localDateString } from "@/lib/time/zone";

export type KioskStatus = "IN" | "BREAK" | "OUT" | "ABSENT";

export interface EmployeeTile {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  status: KioskStatus;
  sinceIso: string | null;
  absenceLabel: string | null;
  todayWorkedMinutes: number | null;
}

export async function buildEmployeeTiles(
  companyId: string,
  serverNow: Date,
): Promise<{ employees: EmployeeTile[] }> {
  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const todayDateStr = localDateString(serverNow);
  const todayMidnightUtc = new Date(`${todayDateStr}T00:00:00.000Z`);

  const [summaries, todayPunches, activeAbsences] = await Promise.all([
    Promise.all(
      employees.map((employee) =>
        getEmployeeKioskSummary(employee.id, serverNow, {
          expectedCompanyId: companyId,
        }),
      ),
    ),

    prisma.timePunch.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        occurredAt: { gte: todayMidnightUtc },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        employeeId: true,
        type: true,
        occurredAt: true,
      },
    }),

    prisma.absence.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        archivedAt: null,
        deletedAt: null,
        status: "APPROVED",
        startDate: { lte: serverNow },
        endDate: { gte: todayMidnightUtc },
      },
      include: {
        absenceType: true,
      },
    }),
  ]);

  const punchesByEmployee = new Map<string, typeof todayPunches>();

  for (const punch of todayPunches) {
    const list = punchesByEmployee.get(punch.employeeId) ?? [];
    list.push(punch);
    punchesByEmployee.set(punch.employeeId, list);
  }

  const absenceByEmployee = new Map<string, (typeof activeAbsences)[number]>();

  for (const absence of activeAbsences) {
    absenceByEmployee.set(absence.employeeId, absence);
  }

  const tiles = employees.map((employee, index) => {
    const summary = summaries[index];
    const today = summary.today;
    const employeePunches = punchesByEmployee.get(employee.id) ?? [];
    const absence = absenceByEmployee.get(employee.id);

    let status: KioskStatus;

    if (absence) {
      status = "ABSENT";
    } else if (today?.isOnBreak) {
      status = "BREAK";
    } else if (today?.isOpen) {
      status = "IN";
    } else {
      status = "OUT";
    }

    let sinceIso: string | null = null;

    if (status === "IN") {
      let lastClockIn: Date | null = null;

      for (const punch of employeePunches) {
        if (punch.type === "CLOCK_IN") {
          lastClockIn = punch.occurredAt;
        } else if (punch.type === "CLOCK_OUT") {
          lastClockIn = null;
        }
      }

      if (lastClockIn) {
        sinceIso = lastClockIn.toISOString();
      }
    }

    if (status === "BREAK") {
      let lastBreakStart: Date | null = null;

      for (const punch of employeePunches) {
        if (punch.type === "BREAK_START") {
          lastBreakStart = punch.occurredAt;
        } else if (punch.type === "BREAK_END") {
          lastBreakStart = null;
        }
      }

      if (lastBreakStart) {
        sinceIso = lastBreakStart.toISOString();
      }
    }

    let todayWorkedMinutes: number | null = null;

    if (status === "OUT" && today && today.workedMinutes > 0) {
      todayWorkedMinutes = today.workedMinutes;
    }

    return {
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeNumber: employee.employeeNumber,
      status,
      sinceIso,
      absenceLabel: absence?.absenceType.labelEn ?? null,
      todayWorkedMinutes,
    };
  });

  return { employees: tiles };
}
