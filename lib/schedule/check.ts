// Server-side wrapper that turns a competency.ts violation into a German
// error message thrown from a server action.

import { prisma } from "@/lib/prisma";
import {
  validateAssignment,
  type AreaSpec,
  type EmployeeSpec,
  type ExistingEntry,
} from "./competency";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export class ScheduleRuleError extends Error {
  constructor(public code: "MISSING_COMPETENCY" | "CAPACITY_EXCEEDED", message: string) {
    super(message);
  }
}

interface CheckArgs {
  companyId: string;
  monthId: string;
  employeeId: string;
  areaId: string;
  date: string; // YYYY-MM-DD
}

/**
 * Throws ScheduleRuleError if the proposed assignment would violate
 * capacity or competency rules. Doesn't write anything; pure validation.
 */
export async function checkAssignment(args: CheckArgs): Promise<void> {
  const [area, employee, sameDayEntries] = await Promise.all([
    prisma.workArea.findUnique({
      where: { id: args.areaId },
      select: { id: true, name: true, maxEmployeesPerDay: true, companyId: true, deletedAt: true },
    }),
    prisma.employee.findUnique({
      where: { id: args.employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        workAreas: { select: { workAreaId: true } },
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        scheduleMonthId: args.monthId,
        // Defense-in-Depth: stelle sicher dass der monthId zur gleichen
        // Company gehört. Capacity-Checks dürfen nie gegen fremde Daten
        // laufen, auch wenn das Resultat nicht direkt geleakt wird.
        scheduleMonth: { companyId: args.companyId },
        date: new Date(`${args.date}T00:00:00.000Z`),
      },
      select: { employeeId: true, type: true, workAreaId: true },
    }),
  ]);

  if (!area || area.companyId !== args.companyId || area.deletedAt) {
    throw new ScheduleRuleError("MISSING_COMPETENCY", "Bereich nicht gefunden.");
  }
  if (!employee || employee.companyId !== args.companyId) {
    throw new ScheduleRuleError("MISSING_COMPETENCY", "Mitarbeiter nicht gefunden.");
  }

  const areaSpec: AreaSpec = {
    id: area.id,
    name: area.name,
    maxEmployeesPerDay: area.maxEmployeesPerDay,
  };
  const employeeSpec: EmployeeSpec = {
    id: employee.id,
    name: `${employee.lastName}, ${employee.firstName}`,
    competencyAreaIds: employee.workAreas.map((w) => w.workAreaId),
    weekdayTargets: [],
  };
  const existing: ExistingEntry[] = sameDayEntries.map((e) => ({
    employeeId: e.employeeId,
    date: args.date,
    type: e.type,
    workAreaId: e.workAreaId,
  }));

  const violation = validateAssignment({
    area: areaSpec,
    employee: employeeSpec,
    date: args.date,
    existingEntries: existing,
    excludeEmployeeId: args.employeeId,
  });
  if (!violation) return;

  if (violation.kind === "MISSING_COMPETENCY") {
    throw new ScheduleRuleError(
      "MISSING_COMPETENCY",
      `${employee.firstName} ${employee.lastName} ist nicht für „${area.name}" qualifiziert. ` +
        `Kompetenz unter Planung → Team-Zuteilung anlegen.`
    );
  }
  // CAPACITY_EXCEEDED
  const cap = area.maxEmployeesPerDay ?? 0;
  throw new ScheduleRuleError(
    "CAPACITY_EXCEEDED",
    `„${area.name}" ist am ${formatDate(args.date)} bereits voll (max. ${cap} ` +
      `Mitarbeiter${cap === 1 ? "" : "innen"} pro Tag). ` +
      `Aktuell: ${violation.current}.`
  );
}

function formatDate(s: string): string {
  const [y, m, d] = s.split("-");
  const wd = new Date(`${s}T00:00:00.000Z`).getUTCDay();
  return `${WEEKDAY_LABELS[(wd + 6) % 7]} ${d}.${m}.${y}`;
}
