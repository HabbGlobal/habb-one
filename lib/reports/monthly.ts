// Build a monthly report dataset for one or all employees. The output is a
// plain JS object that the API routes serialise to CSV / XLSX / PDF.

import { prisma } from "@/lib/prisma";
import { getDayStatsForRange, monthDates, type DayStats } from "@/lib/time/service";
import { aggregateWeek } from "@/lib/time/calc";

export interface EmployeeMonthly {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  days: DayStats[];
  totals: {
    targetMinutes: number;
    workedMinutes: number;
    breakMinutes: number;
    balanceMinutes: number;
    remainingMinutes: number;
  };
}

export async function buildMonthlyReport(opts: {
  companyId: string;
  year: number;
  month: number; // 1..12
  employeeId?: string;
}): Promise<{
  company: {
    name: string;
    address: string | null;
    city: string | null;
    logoData: Uint8Array | Buffer | null;
    logoMimeType: string | null;
  };
  period: { year: number; month: number; from: string; to: string };
  employees: EmployeeMonthly[];
}> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: opts.companyId } });
  const employees = await prisma.employee.findMany({
    where: {
      companyId: opts.companyId,
      // Single-employee reports include archived but never deleted.
      // All-employees reports include only active (not archived/deleted).
      ...(opts.employeeId
        ? { id: opts.employeeId, deletedAt: null }
        : { isActive: true, archivedAt: null, deletedAt: null }),
    },
    orderBy: [{ lastName: "asc" }],
  });

  const dates = monthDates(opts.year, opts.month);

  const result: EmployeeMonthly[] = [];
  for (const e of employees) {
    const days = await getDayStatsForRange(e.id, dates);
    const totals = aggregateWeek(days);
    const breakTotal = days.reduce((s, d) => s + d.breakMinutes, 0);
    result.push({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      days,
      totals: { ...totals, breakMinutes: breakTotal },
    });
  }

  return {
    company: {
      name: company.name,
      address: company.address,
      city: company.city,
      logoData: company.logoData,
      logoMimeType: company.logoMimeType,
    },
    period: { year: opts.year, month: opts.month, from: dates[0], to: dates[dates.length - 1] },
    employees: result,
  };
}

export function formatMin(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
