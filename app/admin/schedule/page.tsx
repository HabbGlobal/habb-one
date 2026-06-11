import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScheduleMatrix } from "./ScheduleMatrix";
import { ScheduleToolbar } from "./ScheduleToolbar";
import { ScheduleSubNav } from "./ScheduleSubNav";
import { localDateString } from "@/lib/time/zone";
import {
  endOfIsoWeek,
  lastDayOfMonth,
  startOfIsoWeek,
  weekNumber,
} from "@/lib/reports/schedule";

export const dynamic = "force-dynamic";

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function clampMonth(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) return fallback;
  return n;
}

function clampYear(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return fallback;
  return n;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    area?: string;
    view?: string;
    weekStart?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "schedule.read")) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const now = new Date();
  const view: "month" | "week" = sp.view === "week" ? "week" : "month";
  const year = clampYear(sp.year, now.getFullYear());
  const month = clampMonth(sp.month, now.getMonth() + 1);
  const areaFilter = sp.area && sp.area !== "all" ? sp.area : null;

  // Determine the date range we display.
  let fromStr: string;
  let toStr: string;
  let weekStartIso: string;
  if (view === "week") {
    const anchor =
      sp.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(sp.weekStart)
        ? sp.weekStart
        : now.toISOString().slice(0, 10);
    fromStr = startOfIsoWeek(anchor);
    toStr = endOfIsoWeek(anchor);
    weekStartIso = fromStr;
  } else {
    fromStr = `${year}-${String(month).padStart(2, "0")}-01`;
    toStr = lastDayOfMonth(year, month);
    weekStartIso = startOfIsoWeek(fromStr);
  }

  // Build day list across the chosen range.
  const days: { date: string; weekday: number; isWeekend: boolean }[] = [];
  {
    const cursor = new Date(`${fromStr}T00:00:00.000Z`);
    const end = new Date(`${toStr}T00:00:00.000Z`);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const wd = (cursor.getUTCDay() + 6) % 7;
      days.push({ date: dateStr, weekday: wd, isWeekend: wd >= 5 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const monthStart = new Date(`${fromStr}T00:00:00.000Z`);
  const monthEnd = new Date(`${toStr}T23:59:59.999Z`);

  // ScheduleMonth rows we may need (the visible range may span up to 2 months).
  const monthYearKeys = uniqueMonths(fromStr, toStr);

  // Load everything for this view in parallel.
  const [scheduleMonths, employees, holidays, areas, absences] = await Promise.all([
    prisma.scheduleMonth.findMany({
      where: {
        companyId: session.user.companyId,
        OR: monthYearKeys.map((k) => ({ year: k.year, month: k.month })),
      },
      include: { entries: true },
    }),
    prisma.employee.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
        ...(areaFilter
          ? { workAreas: { some: { workAreaId: areaFilter } } }
          : {}),
      },
      include: { workAreas: { include: { workArea: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.holiday.findMany({
      where: {
        companyId: session.user.companyId,
        date: { gte: monthStart, lte: monthEnd },
        archivedAt: null,
        deletedAt: null,
      },
    }),
    prisma.workArea.findMany({
      where: { companyId: session.user.companyId, archivedAt: null, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, colorHex: true },
    }),
    // Approved or pending absences whose period overlaps the visible range.
    // Used to mark "Mitarbeiter abwesend" cells red even when no schedule
    // entry has been created for those days yet.
    prisma.absence.findMany({
      where: {
        employee: { companyId: session.user.companyId },
        archivedAt: null,
        deletedAt: null,
        status: { in: ["APPROVED", "REQUESTED"] },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: { absenceType: true },
    }),
  ]);

  // Pick the ScheduleMonth that owns the displayed `year/month` for header
  // (status badge, monthId for actions). When in week view, default to the
  // month containing the Monday.
  const headerMonth =
    view === "week"
      ? monthYearKeys[0]
      : { year, month };
  const scheduleMonth =
    scheduleMonths.find(
      (m) => m.year === headerMonth.year && m.month === headerMonth.month
    ) ?? null;

  const holidayMap = new Map(holidays.map((h) => [localDateString(h.date), h]));
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  type EntryWithArea = (typeof scheduleMonths)[number]["entries"][number];
  const entryMap = new Map<string, EntryWithArea>();
  for (const sm of scheduleMonths) {
    for (const e of sm.entries) {
      const key = `${e.employeeId}|${localDateString(e.date)}`;
      entryMap.set(key, e);
    }
  }

  // Build a (employee, date) → absence map. An absence covers every date
  // from startDate through endDate inclusive.
  const absenceMap = new Map<string, { typeKey: string; label: string; colorHex: string }>();
  for (const a of absences) {
    const start = a.startDate.toISOString().slice(0, 10);
    const end = a.endDate.toISOString().slice(0, 10);
    const cursor = new Date(`${start}T00:00:00.000Z`);
    const stop = new Date(`${end}T00:00:00.000Z`);
    while (cursor <= stop) {
      absenceMap.set(`${a.employeeId}|${cursor.toISOString().slice(0, 10)}`, {
        typeKey: a.absenceType.key,
        label: a.absenceType.labelDe,
        colorHex: a.absenceType.colorHex,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const matrix = employees.map((emp) => ({
    employee: {
      id: emp.id,
      name: `${emp.lastName}, ${emp.firstName}`,
      number: emp.employeeNumber,
      areas: emp.workAreas.map((wa) => ({
        id: wa.workArea.id,
        name: wa.workArea.name,
        colorHex: wa.workArea.colorHex,
      })),
    },
    cells: days.map((d) => {
      const e = entryMap.get(`${emp.id}|${d.date}`);
      const absence = absenceMap.get(`${emp.id}|${d.date}`) ?? null;
      return {
        date: d.date,
        weekday: d.weekday,
        isWeekend: d.isWeekend,
        holidayName: holidayMap.get(d.date)?.nameDe ?? null,
        absence,
        entry: e
          ? {
              id: e.id,
              type: e.type,
              plannedStart: e.plannedStart,
              plannedEnd: e.plannedEnd,
              plannedBreakMinutes: e.plannedBreakMinutes,
              plannedMinutes: e.plannedMinutes,
              workAreaId: e.workAreaId,
              workAreaName: e.workAreaId ? areaMap.get(e.workAreaId)?.name ?? null : null,
              workAreaColor: e.workAreaId ? areaMap.get(e.workAreaId)?.colorHex ?? null : null,
              note: e.note,
            }
          : null,
      };
    }),
  }));

  const status = scheduleMonth?.status ?? "DRAFT";
  const monthId = scheduleMonth?.id ?? null;

  // Header label depends on view.
  const heading =
    view === "month"
      ? `Planung — ${MONTH_NAMES_DE[month - 1]} ${year}`
      : `Planung — KW ${weekNumber(weekStartIso)} (${fmtCh(fromStr)} – ${fmtCh(toStr)})`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          {scheduleMonth?.publishedAt && (
            <p className="text-xs text-muted-foreground">
              Veröffentlicht am {scheduleMonth.publishedAt.toLocaleString("de-CH")}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      <ScheduleSubNav active="plan" />

      <ScheduleToolbar
        year={year}
        month={month}
        monthId={monthId}
        status={status}
        canPublish={hasPermission(session.user.role, "schedule.publish")}
        areas={areas}
        currentArea={areaFilter}
        view={view}
        weekStart={weekStartIso}
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <ScheduleMatrix
            year={year}
            month={month}
            monthId={monthId}
            days={days}
            employees={matrix}
            holidayMap={Object.fromEntries(holidays.map((h) => [localDateString(h.date), h.nameDe]))}
            allAreas={areas}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "secondary" | "success" | "warning" | "info" }> = {
    DRAFT: { label: "Entwurf", variant: "secondary" },
    PUBLISHED: { label: "Veröffentlicht", variant: "success" },
    CHANGED_AFTER_PUBLISHING: { label: "Geändert nach Veröffentlichung", variant: "warning" },
    ARCHIVED: { label: "Archiviert", variant: "secondary" },
  };
  const cfg = map[status] ?? map.DRAFT;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/** Returns the unique (year, month) pairs covered by [from..to]. */
function uniqueMonths(from: string, to: string): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const seen = new Set<string>();
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    const key = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function fmtCh(dateStr: string): string {
  return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.${dateStr.slice(0, 4)}`;
}
