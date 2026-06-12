"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { CellEditor } from "./CellEditor";
import { BulkRangeEditor } from "./BulkRangeEditor";

const WEEKDAY_SHORT_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export interface MatrixDay {
  date: string;
  weekday: number;
  isWeekend: boolean;
}

export interface MatrixCellEntry {
  id: string;
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

export interface AreaOption {
  id: string;
  name: string;
  colorHex: string;
}

export interface MatrixCellAbsence {
  typeKey: string;
  label: string;
  colorHex: string;
}

export interface MatrixCell {
  date: string;
  weekday: number;
  isWeekend: boolean;
  holidayName: string | null;
  /** Absence record covering this date for this employee (independent of the
   *  ScheduleEntry — used to mark "abwesend" cells in red even when no
   *  schedule entry has been written for that day yet). */
  absence: MatrixCellAbsence | null;
  entry: MatrixCellEntry | null;
}

export interface MatrixRow {
  employee: {
    id: string;
    name: string;
    number: string;
    areas?: { id: string; name: string; colorHex: string }[];
  };
  cells: MatrixCell[];
}

interface Props {
  year: number;
  month: number;
  monthId: string | null;
  days: MatrixDay[];
  employees: MatrixRow[];
  holidayMap: Record<string, string>;
  allAreas: AreaOption[];
}

export function ScheduleMatrix({
  year,
  month,
  monthId,
  days,
  employees,
  holidayMap,
  allAreas,
}: Props) {
  const [editing, setEditing] = useState<{
    employeeId: string;
    employeeName: string;
    date: string;
    entry: MatrixCellEntry | null;
  } | null>(null);
  const [bulkEditing, setBulkEditing] = useState<{
    employeeId: string;
    employeeName: string;
  } | null>(null);

  const monthFirst = days[0]?.date ?? "";
  const monthLast = days[days.length - 1]?.date ?? "";

  return (
    <>
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="text-left p-2 border-b min-w-[180px] sticky left-0 bg-card">Employee</th>
            {days.map((d) => {
              const day = Number(d.date.slice(8, 10));
              const holidayName = holidayMap[d.date];
              return (
                <th
                  key={d.date}
                  className={cn(
                    "px-1 py-2 border-b text-center min-w-[68px]",
                    d.isWeekend && "bg-habb-paper",
                    holidayName && "bg-amber-50"
                  )}
                  title={holidayName ?? undefined}
                >
                  <div className="font-medium tabular-nums">{day}</div>
                  <div className="text-muted-foreground">
                    {WEEKDAY_SHORT_DE[d.weekday]}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr>
              <td
                colSpan={days.length + 1}
                className="text-center text-muted-foreground py-8"
              >
                Keine aktiven Mitarbeitenden.
              </td>
            </tr>
          )}
          {employees.map((row) => (
            <tr key={row.employee.id} className="hover:bg-accent/30">
              <td className="text-sm p-2 border-b sticky left-0 bg-card whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBulkEditing({
                        employeeId: row.employee.id,
                        employeeName: row.employee.name,
                      })
                    }
                    title="Bereich planen — mehrere Tage gleichzeitig setzen"
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <CalendarRange className="h-4 w-4" />
                  </button>
                  <div className="flex flex-col">
                    <span>
                      {row.employee.name}
                      <span className="text-muted-foreground ml-1 text-xs">
                        #{row.employee.number}
                      </span>
                    </span>
                    {row.employee.areas && row.employee.areas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {row.employee.areas.map((a) => (
                          <span
                            key={a.id}
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: a.colorHex }}
                            title={a.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              {row.cells.map((cell) => {
                const isHoliday = cell.holidayName != null;
                return (
                  <td
                    key={cell.date}
                    className={cn(
                      "border-b p-0 text-center cursor-pointer",
                      cell.isWeekend && "bg-habb-paper",
                      isHoliday && "bg-amber-50"
                    )}
                    onClick={() =>
                      setEditing({
                        employeeId: row.employee.id,
                        employeeName: row.employee.name,
                        date: cell.date,
                        entry: cell.entry,
                      })
                    }
                  >
                    <CellLabel cell={cell} isHoliday={isHoliday} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <CellEditor
          year={year}
          month={month}
          monthId={monthId}
          employeeId={editing.employeeId}
          employeeName={editing.employeeName}
          date={editing.date}
          entry={editing.entry}
          areas={allAreas}
          onClose={() => setEditing(null)}
        />
      )}

      {bulkEditing && (
        <BulkRangeEditor
          year={year}
          month={month}
          monthId={monthId}
          employeeId={bulkEditing.employeeId}
          employeeName={bulkEditing.employeeName}
          defaultFrom={monthFirst}
          defaultTo={monthLast}
          areas={allAreas}
          onClose={() => setBulkEditing(null)}
        />
      )}
    </>
  );
}

function CellLabel({
  cell,
  isHoliday,
}: {
  cell: MatrixCell;
  isHoliday: boolean;
}) {
  if (isHoliday && !cell.entry) {
    return (
      <div className="text-[10px] text-amber-700 px-1 py-2 truncate" title={cell.holidayName ?? ""}>
        {cell.holidayName?.slice(0, 8) ?? "Feiertag"}
      </div>
    );
  }
  // Absence record (vacation / sickness / …) without a planned shift —
  // show the absence in red so the secretary sees at a glance that the
  // employee can't be planned that day.
  if (!cell.entry && cell.absence) {
    return (
      <div
        className="text-[10px] text-red-700 bg-red-100 ring-1 ring-inset ring-red-200 px-1 py-2 truncate rounded m-0.5"
        title={cell.absence.label}
      >
        {cell.absence.label.slice(0, 8)}
      </div>
    );
  }
  if (!cell.entry) {
    return <div className="text-muted-foreground/40 px-1 py-2">·</div>;
  }
  const { type, plannedStart, plannedEnd } = cell.entry;
  // Absence-type entries are always rendered in red regardless of the
  // earlier per-type colour mapping, so absent days stand out across the
  // matrix.
  const isAbsentType =
    type === "VACATION" || type === "SICKNESS" || type === "ABSENCE";
  const colors: Record<string, string> = {
    WORK: "bg-emerald-100 text-emerald-800",
    FREE: "bg-habb-paper text-habb-ink",
    VACATION: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
    SICKNESS: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
    ABSENCE: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
    COMPENSATION: "bg-cyan-100 text-cyan-800",
    OTHER: "bg-habb-paper text-habb-ink",
  };
  const color = colors[type] ?? "bg-habb-paper text-habb-ink";

  if (type === "WORK" && plannedStart && plannedEnd) {
    return (
      <div
        className={cn("px-1 py-1.5 rounded m-0.5 relative", color)}
        title={cell.entry.workAreaName ?? undefined}
      >
        <div className="font-medium tabular-nums">
          {plannedStart}–{plannedEnd}
        </div>
        {cell.entry.workAreaColor && (
          <span
            className="absolute bottom-0 left-0 right-0 h-1 rounded-b"
            style={{ backgroundColor: cell.entry.workAreaColor }}
          />
        )}
      </div>
    );
  }
  const labelMap: Record<string, string> = {
    WORK: "Arbeit",
    FREE: "Frei",
    VACATION: "Ferien",
    SICKNESS: "Krank",
    ABSENCE: "Abw.",
    COMPENSATION: "Komp.",
    OTHER: "Sonst.",
  };
  return (
    <div className={cn("px-1 py-1.5 rounded m-0.5", color)}>
      <div className="font-medium">{labelMap[type] ?? type}</div>
    </div>
  );
}
