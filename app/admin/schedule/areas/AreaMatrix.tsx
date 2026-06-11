"use client";

// Area × Day matrix: rows = areas, columns = days. Cells show the initials
// of every employee planned in that area on that date. Click → modal.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AreaCellModal } from "./AreaCellModal";

export interface AreaMatrixDay {
  date: string;
  dayNumber: number;
  weekday: number;
  isWeekend: boolean;
}

export interface AreaCellEmployee {
  id: string;
  name: string;
  initials: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreakMinutes: number | null;
  note: string | null;
}

export interface AreaCell {
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  employees: AreaCellEmployee[];
}

export interface AreaRow {
  area: {
    id: string;
    name: string;
    colorHex: string;
    minEmployeesPerDay: number | null;
    maxEmployeesPerDay: number | null;
  };
  cells: AreaCell[];
}

const WEEKDAY_SHORT_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Props {
  year: number;
  month: number;
  days: AreaMatrixDay[];
  rows: AreaRow[];
  employeeOptions: { id: string; name: string }[];
}

export function AreaMatrix({ year, month, days, rows, employeeOptions }: Props) {
  const [active, setActive] = useState<{
    areaId: string;
    areaName: string;
    areaColor: string;
    date: string;
    employees: AreaCellEmployee[];
  } | null>(null);

  return (
    <>
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="text-left p-2 border-b min-w-[180px] sticky left-0 bg-card z-20">
              Bereich
            </th>
            {days.map((d) => (
              <th
                key={d.date}
                className={cn(
                  "p-1 text-center border-b min-w-[44px] font-medium",
                  d.isWeekend && "bg-habb-paper"
                )}
              >
                <div className="text-[10px] text-muted-foreground">
                  {WEEKDAY_SHORT_DE[d.weekday]}
                </div>
                <div className="tabular-nums">{d.dayNumber}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.area.id} className="hover:bg-accent/20">
              <td className="p-2 border-b sticky left-0 bg-card z-10 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: row.area.colorHex }}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{row.area.name}</span>
                    {(row.area.minEmployeesPerDay || row.area.maxEmployeesPerDay) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {row.area.minEmployeesPerDay ?? "—"}
                        {" / "}
                        {row.area.maxEmployeesPerDay ?? "∞"}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              {row.cells.map((cell) => {
                const min = row.area.minEmployeesPerDay ?? 0;
                const belowMin =
                  min > 0 &&
                  !cell.isWeekend &&
                  !cell.isHoliday &&
                  cell.employees.length < min;
                return (
                <td
                  key={cell.date}
                  onClick={() =>
                    setActive({
                      areaId: row.area.id,
                      areaName: row.area.name,
                      areaColor: row.area.colorHex,
                      date: cell.date,
                      employees: cell.employees,
                    })
                  }
                  className={cn(
                    "border-b p-1 align-top text-center cursor-pointer hover:bg-accent/40",
                    cell.isWeekend && "bg-habb-paper",
                    cell.isHoliday && "bg-amber-50",
                    belowMin && "bg-red-50 ring-1 ring-inset ring-red-300"
                  )}
                  title={belowMin ? `Mindestbesetzung ${min} nicht erreicht` : undefined}
                >
                  {cell.employees.length === 0 ? (
                    <div className={cn("py-2", belowMin ? "text-red-600 font-semibold" : "text-muted-foreground/40")}>
                      {belowMin ? `0/${min}` : "·"}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-0.5 justify-center">
                      {belowMin && (
                        <span className="text-[10px] text-red-600 font-semibold w-full">
                          {cell.employees.length}/{min}
                        </span>
                      )}
                      {cell.employees.slice(0, 6).map((emp) => (
                        <span
                          key={emp.id}
                          title={emp.name}
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-semibold rounded text-white"
                          style={{ backgroundColor: row.area.colorHex }}
                        >
                          {emp.initials}
                        </span>
                      ))}
                      {cell.employees.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{cell.employees.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {active && (
        <AreaCellModal
          areaId={active.areaId}
          areaName={active.areaName}
          areaColor={active.areaColor}
          date={active.date}
          employees={active.employees}
          allEmployees={employeeOptions}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
