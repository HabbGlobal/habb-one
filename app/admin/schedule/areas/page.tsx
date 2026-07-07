import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { ScheduleSubNav } from "../ScheduleSubNav";
import { AreaMatrix, type AreaCellEmployee, type AreaMatrixDay, type AreaRow } from "./AreaMatrix";

export const dynamic = "force-dynamic";

const MONTH_NAMES_DE = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function clampYear(s: string | undefined, fallback: number) {
  const n = Number(s);
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : fallback;
}
function clampMonth(s: string | undefined, fallback: number) {
  const n = Number(s);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : fallback;
}

function initials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0] ?? "";
  const l = lastName.trim()[0] ?? "";
  return (f + l).toUpperCase();
}

export default async function AreaSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "schedule.read")) redirect("/admin");

  const sp = await searchParams;
  const now = new Date();
  const year = clampYear(sp.year, now.getFullYear());
  const month = clampMonth(sp.month, now.getMonth() + 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: AreaMatrixDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const utc = new Date(`${dateStr}T00:00:00.000Z`);
    const wd = (utc.getUTCDay() + 6) % 7; // Mon=0
    days.push({ date: dateStr, dayNumber: d, weekday: wd, isWeekend: wd >= 5 });
  }

  const monthStart = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`);
  const monthEnd = new Date(`${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}T23:59:59.999Z`);

  const [scheduleMonth, areas, employees, holidays] = await Promise.all([
    prisma.scheduleMonth.findUnique({
      where: { companyId_year_month: { companyId: session.user.companyId, year, month } },
      include: { entries: true },
    }),
    prisma.workArea.findMany({
      where: { companyId: session.user.companyId, archivedAt: null, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
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
  ]);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().slice(0, 10))
  );

  // Group entries by (areaId, date) → list of employees
  const grouped = new Map<string, AreaCellEmployee[]>();
  if (scheduleMonth) {
    for (const e of scheduleMonth.entries) {
      if (!e.workAreaId || e.type !== "WORK") continue;
      const dateStr = e.date.toISOString().slice(0, 10);
      const key = `${e.workAreaId}|${dateStr}`;
      const emp = employeeById.get(e.employeeId);
      if (!emp) continue;
      const list = grouped.get(key) ?? [];
      list.push({
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        initials: initials(emp.firstName, emp.lastName),
        plannedStart: e.plannedStart,
        plannedEnd: e.plannedEnd,
        plannedBreakMinutes: e.plannedBreakMinutes,
        note: e.note,
      });
      grouped.set(key, list);
    }
  }

  const rows: AreaRow[] = areas.map((a) => ({
    area: {
      id: a.id,
      name: a.name,
      colorHex: a.colorHex,
      minEmployeesPerDay: a.minEmployeesPerDay,
      maxEmployeesPerDay: a.maxEmployeesPerDay,
    },
    cells: days.map((d) => ({
      date: d.date,
      isWeekend: d.isWeekend,
      isHoliday: holidaySet.has(d.date),
      employees: (grouped.get(`${a.id}|${d.date}`) ?? []).sort((x, y) =>
        x.name.localeCompare(y.name)
      ),
    })),
  }));

  // Quick prev/next month nav
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Area Overview — {MONTH_NAMES_DE[month - 1]} {year}
        </h1>
        <p className="text-sm text-muted-foreground">
          Per area and day you can see who is scheduled. Click on a
          cell to open the detail view and add or remove employees.
        </p>
      </div>

      <ScheduleSubNav active="areas" />

      <div className="flex items-center gap-2 text-sm">
        <a
          className="px-3 py-1 rounded border hover:bg-accent"
          href={`/admin/schedule/areas?year=${prevYear}&month=${prevMonth}`}
        >
          ←
        </a>
        <a
          className="px-3 py-1 rounded border hover:bg-accent"
          href="/admin/schedule/areas"
        >
          Current month
        </a>
        <a
          className="px-3 py-1 rounded border hover:bg-accent"
          href={`/admin/schedule/areas?year=${nextYear}&month=${nextMonth}`}
        >
          →
        </a>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6">
              No areas defined yet.{" "}
              <Link className="underline" href="/admin/areas">
                Manage areas
              </Link>
            </p>
          ) : (
            <AreaMatrix
              year={year}
              month={month}
              days={days}
              rows={rows}
              employeeOptions={employees.map((e) => ({
                id: e.id,
                name: `${e.lastName}, ${e.firstName}`,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
