// Excel export for schedule plans, formatted with ExcelJS.
// Two sheets:
//   - "Plan"   → employees × days matrix with shift labels, area-coloured
//   - "Areas"  → area × days view (employee initials per cell)
// Both sheets use frozen panes, bold headers, weekend / holiday tints, and
// thin borders so the file looks polished on first open.

import ExcelJS from "exceljs";
import { cellLabel, type ScheduleReportData } from "./schedule";

const HEADER_FILL = "FF1F2937"; // slate-800
const HEADER_FG = "FFFFFFFF";
const WEEKEND_FILL = "FFF1F5F9"; // slate-100
const HOLIDAY_FILL = "FFFEF3C7"; // amber-100
const TINT_AMOUNT = 0.85; // 85% white mix → soft pastel area tint

export async function scheduleXlsx(
  report: ScheduleReportData,
  exportedBy: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = exportedBy;
  wb.created = new Date();
  wb.title = `Plan ${report.range.label}`;
  wb.company = report.company.name;

  buildPlanSheet(wb, report, exportedBy);
  if (report.areas.length > 0) {
    buildAreaSheet(wb, report);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ─────────────────────────────────────────
// Sheet 1 — "Plan" (employees × days)
// ─────────────────────────────────────────
function buildPlanSheet(
  wb: ExcelJS.Workbook,
  report: ScheduleReportData,
  exportedBy: string
) {
  const ws = wb.addWorksheet("Plan", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    properties: { defaultColWidth: 10 },
  });

  const totalCols = 1 + report.days.length;

  // Title rows (merged, bold, larger)
  mergeRow(ws, 1, totalCols, [report.company.name], { bold: true, size: 14 });
  mergeRow(ws, 2, totalCols, [`Plan ${report.range.label}`], { size: 11 });
  mergeRow(
    ws,
    3,
    totalCols,
    [
      `Status: ${report.status}    Created: ${formatNow()}    Exported by: ${exportedBy}`,
    ],
    { italic: true, size: 9, color: "FF6B7280" }
  );

  // Empty spacer row
  ws.addRow([]);

  // Day-header row (row 5)
  const headerRowIdx = 5;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.values = [
    "Employee",
    ...report.days.map((d) => `${d.weekdayLabel} ${d.dayLabel}`),
  ];
  headerRow.font = { bold: true, color: { argb: HEADER_FG } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 26;
  headerRow.eachCell((cell, col) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = thinBorder();
    if (col === 1) cell.alignment = { ...cell.alignment, horizontal: "left" };
  });

  // Data rows
  for (const emp of report.employees) {
    const row = ws.addRow([
      `${emp.fullName}\n#${emp.number}`,
      ...report.days.map((d) => {
        const cell = report.cells.get(`${emp.id}|${d.date}`);
        if (!cell) return d.isHoliday ? "Holiday" : "";
        const label = cellLabel(cell);
        return cell.workAreaName ? `${label}\n${cell.workAreaName}` : label;
      }),
    ]);
    row.height = 30;
    row.alignment = { vertical: "middle", wrapText: true };

    // Style the name cell
    const nameCell = row.getCell(1);
    nameCell.font = { bold: true, size: 10 };
    nameCell.alignment = { vertical: "middle", wrapText: true };
    nameCell.border = thinBorder();

    // Style each day cell
    for (let i = 0; i < report.days.length; i++) {
      const d = report.days[i];
      const cell = row.getCell(i + 2);
      const data = report.cells.get(`${emp.id}|${d.date}`);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.font = { size: 9 };
      cell.border = thinBorder();

      let fill: string | null = null;
      if (data?.workAreaColor && data.type === "WORK") {
        fill = lightenHexToARGB(data.workAreaColor, TINT_AMOUNT);
      } else if (d.isHoliday) {
        fill = HOLIDAY_FILL;
      } else if (d.isWeekend) {
        fill = WEEKEND_FILL;
      }
      if (fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }

      // Color text by type for non-WORK (light hint)
      if (data && data.type !== "WORK") {
        cell.font = { ...cell.font, color: { argb: typeColorArgb(data.type) }, italic: true };
      }
    }
  }

  // Column widths
  ws.getColumn(1).width = 22;
  for (let i = 2; i <= totalCols; i++) {
    ws.getColumn(i).width = 12;
  }

  // Frozen pane: keep title rows + name column visible while scrolling
  ws.views = [
    {
      state: "frozen",
      xSplit: 1,
      ySplit: headerRowIdx,
    },
  ];
}

// ─────────────────────────────────────────
// Sheet 2 — "Areas" (area × days)
// ─────────────────────────────────────────
function buildAreaSheet(wb: ExcelJS.Workbook, report: ScheduleReportData) {
  const ws = wb.addWorksheet("Areas", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const totalCols = 1 + report.days.length;
  mergeRow(ws, 1, totalCols, [`Area Overview ${report.range.label}`], {
    bold: true,
    size: 13,
  });
  ws.addRow([]);

  const headerRow = ws.getRow(3);
  headerRow.values = [
    "Area",
    ...report.days.map((d) => `${d.weekdayLabel} ${d.dayLabel}`),
  ];
  headerRow.font = { bold: true, color: { argb: HEADER_FG } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = thinBorder();
    if (col === 1) cell.alignment = { ...cell.alignment, horizontal: "left" };
  });

  for (const area of report.areas) {
    const row = ws.addRow([
      area.name,
      ...report.days.map((d) => {
        const initials: string[] = [];
        for (const emp of report.employees) {
          const cell = report.cells.get(`${emp.id}|${d.date}`);
          if (cell?.workAreaId === area.id && cell.type === "WORK") {
            initials.push(empInitials(emp.fullName));
          }
        }
        return initials.join(" ");
      }),
    ]);
    row.height = 22;
    row.alignment = { vertical: "middle", horizontal: "center" };

    // Name cell with area color tint
    const nameCell = row.getCell(1);
    nameCell.font = { bold: true };
    nameCell.alignment = { vertical: "middle", horizontal: "left" };
    nameCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: lightenHexToARGB(area.colorHex, 0.7) },
    };
    nameCell.border = thinBorder();

    // Day cells: weekend / holiday tint
    for (let i = 0; i < report.days.length; i++) {
      const d = report.days[i];
      const cell = row.getCell(i + 2);
      cell.border = thinBorder();
      cell.font = { size: 9 };
      let fill: string | null = null;
      if (d.isHoliday) fill = HOLIDAY_FILL;
      else if (d.isWeekend) fill = WEEKEND_FILL;
      if (fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }
    }
  }

  ws.getColumn(1).width = 22;
  for (let i = 2; i <= totalCols; i++) {
    ws.getColumn(i).width = 9;
  }
  ws.views = [
    {
      state: "frozen",
      xSplit: 1,
      ySplit: 3,
    },
  ];
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────
function mergeRow(
  ws: ExcelJS.Worksheet,
  row: number,
  totalCols: number,
  values: (string | number)[],
  opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {}
) {
  const r = ws.getRow(row);
  r.values = [values[0] ?? ""];
  ws.mergeCells(row, 1, row, totalCols);
  const cell = r.getCell(1);
  cell.font = {
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    size: opts.size ?? 11,
    color: opts.color ? { argb: opts.color } : undefined,
  };
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const c = { style: "thin" as const, color: { argb: "FFE5E7EB" } };
  return { top: c, bottom: c, left: c, right: c };
}

function empInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function lightenHexToARGB(hex: string, mix: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "FFE5E7EB";
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const blend = (c: number) => Math.round(c * (1 - mix) + 255 * mix);
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `FF${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}

function typeColorArgb(type: string): string {
  return (
    {
      FREE: "FF6B7280",
      VACATION: "FF1D4ED8",
      SICKNESS: "FF7E22CE",
      ABSENCE: "FFC2410C",
      HOLIDAY: "FFB45309",
      COMPENSATION: "FF0E7490",
      OTHER: "FF6B7280",
    }[type] ?? "FF374151"
  );
}

function formatNow(): string {
  return new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
