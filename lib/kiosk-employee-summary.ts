// Shared actions-page computation (status + live stats + vacation balance)
// for the kiosk. Used by both the server-rendered web page
// (app/kiosk/[employeeId]/actions/page.tsx) and the JSON API consumed by the
// mobile kiosk app (app/api/kiosk/employees/[employeeId]/summary/route.ts) so
// the two clients can never drift out of sync on status/vacation logic.

import { prisma } from "@/lib/prisma";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { calculateVacationBalance } from "@/lib/time/calc";

export type EmployeeActionStatus = "IN" | "BREAK" | "OUT";

export interface EmployeeActionSummary {
  status: EmployeeActionStatus;
  today: {
    targetMinutes: number;
    workedMinutes: number;
    breakMinutes: number;
    isOpen: boolean;
    isOnBreak: boolean;
  };
  week: {
    targetMinutes: number;
    workedMinutes: number;
  };
  vacation: {
    remainingDays: number;
    totalDays: number;
  };
}

export class EmployeeNotFoundError extends Error {}

export async function buildEmployeeActionSummary(
  employeeId: string,
  companyId: string,
  serverNow: Date,
): Promise<EmployeeActionSummary> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: {
      absences: { include: { absenceType: true } },
    },
  });
  if (!employee) throw new EmployeeNotFoundError(employeeId);

  const summary = await getEmployeeKioskSummary(employeeId, serverNow, {
    expectedCompanyId: companyId,
  });
  const today = summary.today;
  const status: EmployeeActionStatus = today?.isOnBreak
    ? "BREAK"
    : today?.isOpen
    ? "IN"
    : "OUT";

  // Vacation balance for the current year.
  const year = serverNow.getFullYear();
  const vacationDaysUsed = employee.absences
    .filter((a) => a.status === "APPROVED" && a.absenceType.category === "VACATION")
    .filter((a) => a.startDate.getFullYear() === year)
    .reduce((sum, a) => sum + countAbsenceDays(a), 0);
  const vacationDaysPlanned = employee.absences
    .filter((a) => a.status === "REQUESTED" && a.absenceType.category === "VACATION")
    .filter((a) => a.startDate.getFullYear() === year)
    .reduce((sum, a) => sum + countAbsenceDays(a), 0);
  const vacation = calculateVacationBalance({
    annualDays: employee.annualVacationDays,
    carryOverDays: employee.initialVacationDays,
    usedDays: vacationDaysUsed,
    plannedDays: vacationDaysPlanned,
  });

  return {
    status,
    today: {
      targetMinutes: today?.targetMinutes ?? 0,
      workedMinutes: today?.workedMinutes ?? 0,
      breakMinutes: today?.breakMinutes ?? 0,
      isOpen: today?.isOpen ?? false,
      isOnBreak: today?.isOnBreak ?? false,
    },
    week: {
      targetMinutes: summary.weekTotals.targetMinutes,
      workedMinutes: summary.weekTotals.workedMinutes,
    },
    vacation: {
      remainingDays: vacation.remainingDays,
      totalDays: vacation.totalDays,
    },
  };
}

function countAbsenceDays(a: {
  startDate: Date;
  endDate: Date;
  startHalfDay: boolean;
  endHalfDay: boolean;
}): number {
  const ms = a.endDate.getTime() - a.startDate.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  let result = days;
  if (a.startHalfDay) result -= 0.5;
  if (a.endHalfDay && days > 0) result -= 0.5;
  return Math.max(0, result);
}
