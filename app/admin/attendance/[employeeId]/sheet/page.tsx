// SAP-style timesheet for CEO + Secretariat. Loads one month
// at a time, shows a calendar on the left + day list on the right.
// Day-level editing is controlled in the Sheet Client.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { getDayStatsForRange } from "@/lib/time/service";
import { getCurrentKioskState } from "@/lib/time/punch";
import {
  localDateString,
  localMidnightUtc,
  formatTimeLocal,
} from "@/lib/time/zone";
import { SheetClient } from "./SheetClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}

function monthDates(year: number, month: number): string[] {
  const out: string[] = [];
  const days = new Date(year, month, 0).getDate(); // last day of the month
  for (let d = 1; d <= days; d++) {
    out.push(
      `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`,
    );
  }
  return out;
}

export default async function SheetPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!hasPermission(session.user.role, "timeEntries.read")) {
    redirect("/admin");
  }
  const canCorrect = hasPermission(session.user.role, "timeEntries.correct");

  const { employeeId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = sp.y ? parseInt(sp.y, 10) : now.getFullYear();
  const month = sp.m ? parseInt(sp.m, 10) : now.getMonth() + 1;

  // Employee
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      employmentType: true,
      workloadPercent: true,
      weeklyTargetHours: true,
      companyId: true,
      deletedAt: true,
    },
  });
  if (!employee || employee.companyId !== session.user.companyId) notFound();

  // Monthly statistics (with target/actual per day)
  const dates = monthDates(year, month);
  const dayStats = await getDayStatsForRange(employee.id, dates, now, {
    expectedCompanyId: session.user.companyId,
  });

  // Active absence types for the company — DYNAMIC. New types created in
  // /admin/absences/types will automatically appear in the Day Editor
  // dropdown here (no hardcoding).
  const absenceTypes = await prisma.absenceType.findMany({
    where: {
      companyId: session.user.companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: { labelDe: "asc" },
    select: { id: true, labelDe: true, colorHex: true, requiresApproval: true },
  });

  // Live status (for the Live Lock Banner)
  const liveState = await getCurrentKioskState(employee.id, {
    expectedCompanyId: session.user.companyId,
  });

  // Day details: TimePunches + BreakEntries for the day list
  const start = localMidnightUtc(dates[0]);
  const end = localMidnightUtc(dates[dates.length - 1]);
  const entries = await prisma.timeEntry.findMany({
    where: { employeeId: employee.id, workDate: { gte: start, lte: end } },
    include: {
      punches: { orderBy: { occurredAt: "asc" } },
      breaks: { orderBy: { startedAt: "asc" } },
    },
  });
  const entryMap = new Map(entries.map((e) => [localDateString(e.workDate), e]));

  // Per-day payload for the client
  const days = dayStats.map((d) => {
    const e = entryMap.get(d.date);
    return {
      date: d.date,
      weekday: d.weekday,
      targetMinutes: d.targetMinutes,
      workedMinutes: d.workedMinutes,
      breakMinutes: d.breakMinutes,
      balanceMinutes: d.balanceMinutes,
      isOpen: d.isOpen,
      isOnBreak: d.isOnBreak,
      isHoliday: d.isHoliday,
      holidayName: d.holidayName ?? null,
      absenceLabel: d.absence?.labelDe ?? null,
      absence: d.absence
        ? {
            id: d.absence.id,
            typeId: d.absence.typeId,
            labelDe: d.absence.labelDe,
            colorHex: d.absence.colorHex,
            halfDay: d.absence.halfDay,
            isMultiDay: d.absence.isMultiDay,
          }
        : null,
      // Blocks for the editor (work + break, sorted)
      punches:
        e?.punches.map((p) => ({
          id: p.id,
          type: p.type,
          occurredAtIso: p.occurredAt.toISOString(),
          occurredAtLocal: formatTimeLocal(p.occurredAt),
          source: p.source,
          isHomeOffice: p.isHomeOffice,
        })) ?? [],
      breaks:
        e?.breaks.map((b) => ({
          id: b.id,
          startedAtIso: b.startedAt.toISOString(),
          startedAtLocal: formatTimeLocal(b.startedAt),
          endedAtIso: b.endedAt?.toISOString() ?? null,
          endedAtLocal: b.endedAt ? formatTimeLocal(b.endedAt) : null,
        })) ?? [],
    };
  });

  // Weekly aggregates — the current week (Mon–Sun) for the progress bar.
  const todayStr = localDateString(now);
  const todayIdx = dates.indexOf(todayStr);
  let weekStartIdx = todayIdx >= 0 ? todayIdx : 0;
  // Go back to Monday of the current week
  while (
    weekStartIdx > 0 &&
    dayStats[weekStartIdx].weekday !== "MON"
  ) {
    weekStartIdx--;
  }
  const weekDays = dayStats.slice(weekStartIdx, weekStartIdx + 7);
  const weekTarget = weekDays.reduce((s, d) => s + d.targetMinutes, 0);
  const weekWorked = weekDays.reduce((s, d) => s + d.workedMinutes, 0);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/attendance"
          className="inline-flex items-center gap-1 text-xs text-habb-muted hover:text-habb-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          Attendance
        </Link>
      </div>

      <SheetClient
        employee={{
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
          employmentType: employee.employmentType,
          workloadPercent: employee.workloadPercent,
          weeklyTargetHours: employee.weeklyTargetHours,
        }}
        year={year}
        month={month}
        days={days}
        liveStatus={liveState.status}
        liveSinceIso={
          liveState.status !== "OUT" && liveState.status !== "EMPTY" && liveState.status !== "CLOSED"
            ? liveState.lastIn?.toISOString() ?? null
            : null
        }
        weekTotals={{ target: weekTarget, worked: weekWorked }}
        canCorrect={canCorrect}
        absenceTypes={absenceTypes}
      />
    </div>
  );
}