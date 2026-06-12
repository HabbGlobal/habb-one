// Build a schedule-export dataset (monthly or weekly) from the database.
// Pure data — the PDF / XLSX generators consume the returned shape.

import { prisma } from "@/lib/prisma";

export interface ScheduleReportEmployee {
  id: string;
  fullName: string;
  number: string;
  areaIds: string[];
}

export interface ScheduleReportDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=Mon..6=Sun
  dayLabel: string; // dd.MM
  weekdayLabel: string; // Mo, Di, …
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

export interface ScheduleReportCell {
  type: "WORK" | "FREE" | "VACATION" | "SICKNESS" | "ABSENCE" | "HOLIDAY" | "COMPENSATION" | "OTHER";
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreakMinutes: number | null;
  plannedMinutes: number | null;
  workAreaId: string | null;
  workAreaName: string | null;
  workAreaColor: string | null;
  note: string | null;
}

export interface ScheduleReportData {
  company: {
    name: string;
    address: string | null;
    city: string | null;
    logoData?: Uint8Array | Buffer | null;
    logoMimeType?: string | null;
  };
  range: { from: string; to: string; label: string; mode: "month" | "week" };
  status: string;
  employees: ScheduleReportEmployee[];
  days: ScheduleReportDay[];
  /** Map key: `${employeeId}|${date}` */
  cells: Map<string, ScheduleReportCell>;
  areas: Array<{ id: string; name: string; colorHex: string }>;
}

const WEEKDAY_DE = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES_DE = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface BuildOpts {
  companyId: string;
  /** Inclusive ISO date strings YYYY-MM-DD. */
  from: string;
  to: string;
  /** Optional: only include employees with this area assignment. */
  areaId?: string | null;
  mode: "month" | "week";
}

export async function buildScheduleReport(opts: BuildOpts): Promise<ScheduleReportData> {
  const { companyId, from, to, areaId, mode } = opts;
  const fromUtc = new Date(`${from}T00:00:00.000Z`);
  const toUtc = new Date(`${to}T23:59:59.999Z`);

  // Determine which ScheduleMonth rows we need (range can span 2 months).
  const fromYM = monthOf(from);
  const toYM = monthOf(to);
  const monthKeys: { year: number; month: number }[] = [fromYM];
  if (fromYM.year !== toYM.year || fromYM.month !== toYM.month) {
    monthKeys.push(toYM);
  }

  const [company, scheduleMonths, employees, areas, holidays] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.scheduleMonth.findMany({
      where: {
        companyId,
        OR: monthKeys.map((k) => ({ year: k.year, month: k.month })),
      },
      include: { entries: true },
    }),
    prisma.employee.findMany({
      where: {
        companyId,
        archivedAt: null,
        deletedAt: null,
        ...(areaId
          ? { workAreas: { some: { workAreaId: areaId } } }
          : {}),
      },
      include: { workAreas: { select: { workAreaId: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workArea.findMany({
      where: { companyId, archivedAt: null, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.holiday.findMany({
      where: {
        companyId,
        date: { gte: fromUtc, lte: toUtc },
        archivedAt: null,
        deletedAt: null,
      },
    }),
  ]);

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const holidayMap = new Map(
    holidays.map((h) => [h.date.toISOString().slice(0, 10), h])
  );

  // Build the day list from `from` through `to` inclusive.
  const days: ScheduleReportDay[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const endUtc = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= endUtc) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const wd = (cursor.getUTCDay() + 6) % 7;
    const holiday = holidayMap.get(dateStr);
    days.push({
      date: dateStr,
      weekday: wd,
      dayLabel: `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`,
      weekdayLabel: WEEKDAY_DE[wd],
      isWeekend: wd >= 5,
      isHoliday: !!holiday,
      holidayName: holiday?.nameDe ?? null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Combine all entries from spanned months, restricted to date range.
  const cells = new Map<string, ScheduleReportCell>();
  const fromMs = fromUtc.getTime();
  const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
  for (const sm of scheduleMonths) {
    for (const e of sm.entries) {
      const ms = e.date.getTime();
      if (ms < fromMs || ms > toMs) continue;
      const dateStr = e.date.toISOString().slice(0, 10);
      const area = e.workAreaId ? areaById.get(e.workAreaId) : null;
      cells.set(`${e.employeeId}|${dateStr}`, {
        type: e.type,
        plannedStart: e.plannedStart,
        plannedEnd: e.plannedEnd,
        plannedBreakMinutes: e.plannedBreakMinutes,
        plannedMinutes: e.plannedMinutes,
        workAreaId: e.workAreaId,
        workAreaName: area?.name ?? null,
        workAreaColor: area?.colorHex ?? null,
        note: e.note,
      });
    }
  }

  const status = scheduleMonths.find((m) => m.year === fromYM.year && m.month === fromYM.month)
    ?.status ?? "DRAFT";

  // Range label for header.
  let rangeLabel: string;
  if (mode === "month") {
    rangeLabel = `${MONTH_NAMES_DE[fromYM.month - 1]} ${fromYM.year}`;
  } else {
    rangeLabel = `Week ${weekNumber(from)} (${fmtCh(from)} – ${fmtCh(to)})`;
  }

  return {
    company: {
      name: company.name,
      address: company.address,
      city: company.city,
      logoData: company.logoData,
      logoMimeType: company.logoMimeType,
    },
    range: { from, to, label: rangeLabel, mode },
    status,
    employees: employees.map((e) => ({
      id: e.id,
      fullName: `${e.lastName} ${e.firstName}`,
      number: e.employeeNumber,
      areaIds: e.workAreas.map((w) => w.workAreaId),
    })),
    days,
    cells,
    areas: areas.map((a) => ({ id: a.id, name: a.name, colorHex: a.colorHex })),
  };
}

function monthOf(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m };
}

function fmtCh(dateStr: string): string {
  return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.${dateStr.slice(0, 4)}`;
}

/** ISO 8601 week number for a YYYY-MM-DD date. */
export function weekNumber(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  // Set to nearest Thursday (ISO week algo)
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7) - 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Monday of the ISO week containing `dateStr` as YYYY-MM-DD. */
export function startOfIsoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const wd = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/** Sunday of the ISO week containing `dateStr` as YYYY-MM-DD. */
export function endOfIsoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() + (6 - wd));
  return d.toISOString().slice(0, 10);
}

/** Last day of the given month as YYYY-MM-DD. */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export function cellLabel(cell: ScheduleReportCell): string {
  if (cell.type === "WORK") {
    if (cell.plannedStart && cell.plannedEnd) {
      return `${cell.plannedStart}–${cell.plannedEnd}`;
    }
    return "Work";
  }
  return {
    FREE: "Off",
    VACATION: "Vacation",
    SICKNESS: "Sick",
    ABSENCE: "Absent",
    HOLIDAY: "Holiday",
    COMPENSATION: "Comp.",
    OTHER: "Other",
  }[cell.type] ?? cell.type;
}
