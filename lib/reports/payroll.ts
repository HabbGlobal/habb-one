/**
 * Personalabrechnung — Datenbau für genau einen Mitarbeiter über genau
 * einen Monat. Reicher als `buildMonthlyReport`: enthält Personalstammdaten,
 * Anstellungsdetails, Soll/Ist-Stunden, Abwesenheits-Aufstellung nach Typ und
 * Jahres-Ferien-Saldo.
 *
 * Das Ergebnis ist JSON-serialisierbar; die UI rendert es als Dashboard und
 * die Excel-/PDF-Builder konsumieren das gleiche Objekt.
 */

import { prisma } from "@/lib/prisma";
import { getDayStatsForRange, monthDates, type DayStats } from "@/lib/time/service";
import { aggregateWeek } from "@/lib/time/calc";
import { localDateString } from "@/lib/time/zone";
import type { EmploymentType } from "@prisma/client";

export interface PayrollAbsenceEntry {
  absenceTypeId: string;
  label: string;
  isPaid: boolean;
  reducesTarget: boolean;
  days: number;
  hours: number;
}

export interface PayrollAdjustmentEntry {
  id: string;
  /** ISO-Datum (YYYY-MM-DD) der Korrektur. */
  date: string;
  /** Signierte Minuten (+ dazurechnen / − abziehen). */
  minutes: number;
  reason: string;
}

export interface PayrollVacationBalance {
  /** Anspruch laut Employee-Stamm. */
  entitlementDays: number;
  /** Übertrag aus Vorjahr. */
  carriedOverDays: number;
  /** Im laufenden Jahr genommen (APPROVED Status). */
  takenDaysYtd: number;
  /** Geplant (REQUESTED + APPROVED in Zukunft). */
  plannedDays: number;
  /** Anspruch + Übertrag − bezogen. Geplante zählen NICHT hier rein. */
  remainingDays: number;
}

export interface PayrollDataPoint {
  company: {
    name: string;
    address: string | null;
    city: string | null;
    country: string;
    logoData: Uint8Array | Buffer | null;
    logoMimeType: string | null;
  };
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: Date | null;
    address: string | null;
    ahvNumber: string | null;
    employmentType: EmploymentType;
    workloadPercent: number | null;
    weeklyTargetHours: number | null;
    annualVacationDays: number;
    initialOvertimeHours: number;
    initialVacationDays: number;
    startDate: Date;
    endDate: Date | null;
  };
  period: { year: number; month: number; from: string; to: string };
  days: DayStats[];
  /**
   * Laufender Gleitzeit-Saldo (kumulativ) je Tag, gleich indexiert wie
   * `days`. Startwert = `initialOvertimeHours` (Vortrag), danach pro Tag
   * + (Ist − Soll). Der letzte Wert entspricht `cumulativeBalanceMinutes`.
   * Wie der SAP-Arbeitszeitnachweis: man sieht pro Zeile den fortlaufenden Stand.
   */
  dayRunningBalanceMinutes: number[];
  totals: {
    targetMinutes: number;
    workedMinutes: number;
    breakMinutes: number;
    balanceMinutes: number;
    /** Summe der manuellen Korrekturen in dieser Periode (signiert). */
    adjustmentMinutes: number;
    /** Saldo inkl. Vorbalance (`initialOvertimeHours`) UND Korrekturen. */
    cumulativeBalanceMinutes: number;
  };
  absences: PayrollAbsenceEntry[];
  /** Manuelle Zeit-Korrekturen in dieser Periode. */
  adjustments: PayrollAdjustmentEntry[];
  vacation: PayrollVacationBalance;
}

export async function buildPayrollReport(opts: {
  companyId: string;
  employeeId: string;
  year: number;
  month: number;
}): Promise<PayrollDataPoint> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: opts.companyId },
    select: {
      name: true,
      address: true,
      city: true,
      country: true,
      logoData: true,
      logoMimeType: true,
    },
  });

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: opts.employeeId },
    select: {
      id: true,
      companyId: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      address: true,
      ahvNumber: true,
      employmentType: true,
      workloadPercent: true,
      weeklyTargetHours: true,
      annualVacationDays: true,
      initialOvertimeHours: true,
      initialVacationDays: true,
      startDate: true,
      endDate: true,
    },
  });
  if (employee.companyId !== opts.companyId) {
    throw new Error("Cross-tenant access blocked");
  }

  const dates = monthDates(opts.year, opts.month);
  const days = await getDayStatsForRange(opts.employeeId, dates);
  const totals = aggregateWeek(days);
  const breakTotal = days.reduce((s, d) => s + d.breakMinutes, 0);
  const openingBalance = Math.round(employee.initialOvertimeHours * 60);

  // Manuelle Zeit-Korrekturen dieser Periode laden.
  const periodFrom = new Date(`${dates[0]}T00:00:00.000Z`);
  const periodTo = new Date(`${dates[dates.length - 1]}T23:59:59.999Z`);
  const adjustmentRows = await prisma.timeAdjustment.findMany({
    where: {
      employeeId: opts.employeeId,
      effectiveDate: { gte: periodFrom, lte: periodTo },
    },
    orderBy: { effectiveDate: "asc" },
  });
  const adjustments: PayrollAdjustmentEntry[] = adjustmentRows.map((a) => ({
    id: a.id,
    date: localDateString(a.effectiveDate),
    minutes: a.minutes,
    reason: a.reason,
  }));
  const adjustmentMinutes = adjustments.reduce((s, a) => s + a.minutes, 0);

  // Korrekturen je Tag (für den laufenden Saldo).
  const adjustmentByDate = new Map<string, number>();
  for (const a of adjustments) {
    adjustmentByDate.set(a.date, (adjustmentByDate.get(a.date) ?? 0) + a.minutes);
  }

  // Kumulierter Saldo = Anfangsbestand + Zeit-Saldo + Korrekturen.
  const cumulativeBalanceMinutes =
    totals.balanceMinutes + openingBalance + adjustmentMinutes;

  // Laufender Saldo je Tag: Vortrag + fortlaufend (Ist − Soll) + Korrekturen
  // am jeweiligen Wirksamkeitsdatum. Letzter Wert == cumulativeBalanceMinutes.
  let acc = openingBalance;
  const dayRunningBalanceMinutes = days.map((d) => {
    acc += d.workedMinutes - d.targetMinutes + (adjustmentByDate.get(d.date) ?? 0);
    return acc;
  });

  const absences = await buildAbsenceBreakdown({
    employeeId: opts.employeeId,
    from: dates[0],
    to: dates[dates.length - 1],
  });

  const vacation = await buildVacationBalance({
    employee,
    year: opts.year,
  });

  return {
    company,
    employee,
    period: {
      year: opts.year,
      month: opts.month,
      from: dates[0],
      to: dates[dates.length - 1],
    },
    days,
    dayRunningBalanceMinutes,
    totals: {
      targetMinutes: totals.targetMinutes,
      workedMinutes: totals.workedMinutes,
      breakMinutes: breakTotal,
      balanceMinutes: totals.balanceMinutes,
      adjustmentMinutes,
      cumulativeBalanceMinutes,
    },
    absences,
    adjustments,
    vacation,
  };
}

async function buildAbsenceBreakdown(opts: {
  employeeId: string;
  from: string;
  to: string;
}): Promise<PayrollAbsenceEntry[]> {
  const periodFrom = new Date(`${opts.from}T00:00:00.000Z`);
  const periodTo = new Date(`${opts.to}T23:59:59.999Z`);

  // Alle APPROVED Absenzen, die den Zeitraum überlappen.
  const absences = await prisma.absence.findMany({
    where: {
      employeeId: opts.employeeId,
      status: "APPROVED",
      archivedAt: null,
      deletedAt: null,
      startDate: { lte: periodTo },
      endDate: { gte: periodFrom },
    },
    include: { absenceType: true },
  });

  const byType = new Map<
    string,
    { label: string; isPaid: boolean; reducesTarget: boolean; days: number; hours: number }
  >();
  for (const a of absences) {
    const overlapStart = a.startDate > periodFrom ? a.startDate : periodFrom;
    const overlapEnd = a.endDate < periodTo ? a.endDate : periodTo;
    const days = countWorkingDaysBetween(overlapStart, overlapEnd, a.startHalfDay, a.endHalfDay);
    const hours = days * 8; // Default-Annahme: 8h Arbeitstag. Tenant-Admin kann später konfigurieren.

    const existing = byType.get(a.absenceTypeId);
    if (existing) {
      existing.days += days;
      existing.hours += hours;
    } else {
      byType.set(a.absenceTypeId, {
        label: a.absenceType.labelDe,
        isPaid: a.absenceType.isPaid,
        reducesTarget: a.absenceType.reducesTarget,
        days,
        hours,
      });
    }
  }

  return Array.from(byType.entries()).map(([absenceTypeId, v]) => ({
    absenceTypeId,
    label: v.label,
    isPaid: v.isPaid,
    reducesTarget: v.reducesTarget,
    days: Math.round(v.days * 10) / 10,
    hours: Math.round(v.hours * 10) / 10,
  }));
}

/**
 * Inklusiver Bereich, gerundet auf 0.5-Tag-Schritte. Halbe Tage am Start/Ende
 * werden berücksichtigt. Wochenenden zählen mit — das ist konservativ für
 * Ferien (Tenant zählt Werktage typischerweise selbst weiter aus).
 */
function countWorkingDaysBetween(
  start: Date,
  end: Date,
  halfDayStart: boolean,
  halfDayEnd: boolean,
): number {
  if (end < start) return 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startDay = Math.floor(start.getTime() / MS_PER_DAY);
  const endDay = Math.floor(end.getTime() / MS_PER_DAY);
  let days = endDay - startDay + 1;
  if (halfDayStart) days -= 0.5;
  if (halfDayEnd && endDay !== startDay) days -= 0.5;
  return Math.max(0, days);
}

async function buildVacationBalance(opts: {
  employee: {
    id: string;
    annualVacationDays: number;
    initialVacationDays: number;
  };
  year: number;
}): Promise<PayrollVacationBalance> {
  const yearStart = new Date(Date.UTC(opts.year, 0, 1));
  const yearEnd = new Date(Date.UTC(opts.year, 11, 31, 23, 59, 59));
  const now = new Date();

  // Ferien-Absenztyp identifizieren — kategorie VACATION.
  const vacationAbsences = await prisma.absence.findMany({
    where: {
      employeeId: opts.employee.id,
      archivedAt: null,
      deletedAt: null,
      absenceType: { category: "VACATION" },
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
    include: { absenceType: true },
  });

  let takenDaysYtd = 0;
  let plannedDays = 0;
  for (const a of vacationAbsences) {
    const overlapStart = a.startDate > yearStart ? a.startDate : yearStart;
    const overlapEnd = a.endDate < yearEnd ? a.endDate : yearEnd;
    const days = countWorkingDaysBetween(overlapStart, overlapEnd, a.startHalfDay, a.endHalfDay);
    if (a.status === "APPROVED" && a.endDate < now) {
      takenDaysYtd += days;
    } else if (a.status === "APPROVED" || a.status === "REQUESTED") {
      plannedDays += days;
    }
  }

  const entitlement = opts.employee.annualVacationDays;
  const carriedOver = opts.employee.initialVacationDays;
  const remaining = Math.max(0, entitlement + carriedOver - takenDaysYtd);

  return {
    entitlementDays: entitlement,
    carriedOverDays: carriedOver,
    takenDaysYtd: Math.round(takenDaysYtd * 10) / 10,
    plannedDays: Math.round(plannedDays * 10) / 10,
    remainingDays: Math.round(remaining * 10) / 10,
  };
}

export function formatHM(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
}

export function formatHours(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  return `${sign}${(abs / 60).toFixed(2)}`;
}
