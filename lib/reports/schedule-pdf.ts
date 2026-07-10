// PDF schedule export. Goal: every day of the period fits on one landscape
// A4 page. Compact two-line cells (start time on top, end time below) and
// the area encoded as a coloured strip whose meaning is given by a legend
// at the top of the page.

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { ScheduleReportData } from "./schedule";
import {
  embedCompanyLogo,
  drawCompanyLogoTopRight,
  type EmbeddedLogo,
} from "@/lib/pdf/logo";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 16;
const HEADER_HEIGHT = 70;
const NAME_COL_WIDTH = 110;
const ROW_HEIGHT = 26;

export async function schedulePdf(
  report: ScheduleReportData,
  exportedBy: string,
  timezone?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const usableWidth = A4_LANDSCAPE[0] - 2 * MARGIN - NAME_COL_WIDTH;
  // Compute exact column width so all days fit edge-to-edge.
  const dayColWidth =
    report.days.length > 0 ? usableWidth / report.days.length : 22;

  const logo = await embedCompanyLogo(doc, {
    logoData: report.company.logoData ?? null,
    logoMimeType: report.company.logoMimeType ?? null,
  });

  drawPage(doc, report, font, fontBold, exportedBy, dayColWidth, logo);

  return doc.save();
}

function drawPage(
  doc: PDFDocument,
  report: ScheduleReportData,
  font: PDFFont,
  fontBold: PDFFont,
  exportedBy: string,
  dayColWidth: number,
  logo: EmbeddedLogo | null,
) {
  const page = doc.addPage(A4_LANDSCAPE);
  if (logo) drawCompanyLogoTopRight(page, logo, { maxWidthMm: 30, maxHeightMm: 14, marginMm: 8 });
  const { height } = page.getSize();

  // ── Header ─────────────────────────────────────────
  page.drawText(report.company.name, {
    x: MARGIN,
    y: height - MARGIN - 12,
    size: 12,
    font: fontBold,
  });
  page.drawText(`Plan ${report.range.label}`, {
    x: MARGIN,
    y: height - MARGIN - 26,
    size: 10,
    font,
  });
  page.drawText(
    `Status: ${report.status}  ·  Created: ${formatNow(timezone)}  ·  By: ${exportedBy}`,
    {
      x: MARGIN,
      y: height - MARGIN - 38,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );

  // ── Legend ────────────────────────────────────────
  if (report.areas.length > 0) {
    let lx = MARGIN;
    const ly = height - MARGIN - 52;
    page.drawText("Areas:", { x: lx, y: ly, size: 7, font });
    lx += 38;
    for (const area of report.areas) {
      const c = hexToRgb(area.colorHex);
      page.drawRectangle({
        x: lx,
        y: ly - 1,
        width: 8,
        height: 8,
        color: rgb(c.r, c.g, c.b),
      });
      page.drawText(area.name, { x: lx + 11, y: ly, size: 7, font });
      lx += 12 + area.name.length * 3.5 + 8;
    }
  }

  // ── Day-header row ─────────────────────────────────
  const topY = height - MARGIN - HEADER_HEIGHT;

  // Background tints first
  let x = MARGIN + NAME_COL_WIDTH;
  for (const d of report.days) {
    const tint = headerTint(d);
    if (tint) {
      page.drawRectangle({
        x,
        y: topY - ROW_HEIGHT,
        width: dayColWidth,
        height: ROW_HEIGHT,
        color: tint,
      });
    }
    x += dayColWidth;
  }

  // Then the header text
  x = MARGIN + NAME_COL_WIDTH;
  for (const d of report.days) {
    page.drawText(d.weekdayLabel, {
      x: x + dayColWidth / 2 - 5,
      y: topY - 11,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(d.dayLabel.slice(0, 5), {
      x: x + 1,
      y: topY - 22,
      size: 7,
      font: fontBold,
    });
    x += dayColWidth;
  }
  page.drawLine({
    start: { x: MARGIN, y: topY - ROW_HEIGHT - 1 },
    end: { x, y: topY - ROW_HEIGHT - 1 },
    thickness: 0.6,
    color: rgb(0.6, 0.6, 0.6),
  });

  // ── Employee rows ──────────────────────────────────
  let rowY = topY - ROW_HEIGHT - 2;
  for (const emp of report.employees) {
    if (rowY - ROW_HEIGHT < MARGIN) break;
    page.drawText(truncate(emp.fullName, 22), {
      x: MARGIN + 4,
      y: rowY - 11,
      size: 7,
      font: fontBold,
    });
    page.drawText(`#${emp.number}`, {
      x: MARGIN + 4,
      y: rowY - 21,
      size: 6,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    let cx = MARGIN + NAME_COL_WIDTH;
    for (const d of report.days) {
      const headerBg = headerTint(d);
      if (headerBg) {
        page.drawRectangle({
          x: cx,
          y: rowY - ROW_HEIGHT,
          width: dayColWidth,
          height: ROW_HEIGHT,
          color: headerBg,
        });
      }

      const cell = report.cells.get(`${emp.id}|${d.date}`);
      if (cell) {
        // Soft area tint (only WORK + assigned area)
        if (cell.workAreaColor && cell.type === "WORK") {
          const t = lightenHex(cell.workAreaColor, 0.85);
          page.drawRectangle({
            x: cx + 0.5,
            y: rowY - ROW_HEIGHT + 1,
            width: dayColWidth - 1,
            height: ROW_HEIGHT - 3,
            color: rgb(t.r, t.g, t.b),
          });
        }

        if (cell.type === "WORK" && cell.plannedStart && cell.plannedEnd) {
          page.drawText(cell.plannedStart, {
            x: cx + 2,
            y: rowY - 9,
            size: 6.5,
            font: fontBold,
          });
          page.drawText(cell.plannedEnd, {
            x: cx + 2,
            y: rowY - 18,
            size: 6.5,
            font,
          });
        } else {
          const abbr = abbrevType(cell.type);
          page.drawText(abbr, {
            x: cx + 2,
            y: rowY - 13,
            size: 7,
            font: fontBold,
            color: typeColor(cell.type),
          });
        }

        // Bottom strip in area colour for WORK
        if (cell.workAreaColor && cell.type === "WORK") {
          const c = hexToRgb(cell.workAreaColor);
          page.drawRectangle({
            x: cx + 0.5,
            y: rowY - ROW_HEIGHT + 0.5,
            width: dayColWidth - 1,
            height: 2,
            color: rgb(c.r, c.g, c.b),
          });
        }
      }

      cx += dayColWidth;
    }

    page.drawLine({
      start: { x: MARGIN, y: rowY - ROW_HEIGHT },
      end: { x: cx, y: rowY - ROW_HEIGHT },
      thickness: 0.3,
      color: rgb(0.85, 0.85, 0.85),
    });

    rowY -= ROW_HEIGHT;
  }

  page.drawLine({
    start: { x: MARGIN + NAME_COL_WIDTH, y: topY },
    end: { x: MARGIN + NAME_COL_WIDTH, y: rowY },
    thickness: 0.4,
    color: rgb(0.7, 0.7, 0.7),
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function abbrevType(type: string): string {
  return {
    FREE: "Off",
    VACATION: "Vac.",
    SICKNESS: "Sick",
    ABSENCE: "Abs.",
    HOLIDAY: "Holiday",
    COMPENSATION: "Comp.",
    OTHER: "—",
    WORK: "Work",
  }[type] ?? type;
}

function typeColor(type: string) {
  return {
    FREE: rgb(0.45, 0.45, 0.45),
    VACATION: rgb(0.16, 0.4, 0.78),
    SICKNESS: rgb(0.55, 0.2, 0.6),
    ABSENCE: rgb(0.85, 0.45, 0.1),
    HOLIDAY: rgb(0.6, 0.45, 0.1),
    COMPENSATION: rgb(0.05, 0.45, 0.55),
    OTHER: rgb(0.4, 0.4, 0.4),
    WORK: rgb(0.05, 0.45, 0.25),
  }[type] ?? rgb(0.2, 0.2, 0.2);
}

function headerTint(d: { isWeekend: boolean; isHoliday: boolean }) {
  if (d.isHoliday) return rgb(1.0, 0.97, 0.86);
  if (d.isWeekend) return rgb(0.96, 0.96, 0.97);
  return null;
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 0.7, g: 0.7, b: 0.7 };
  const v = m[1];
  return {
    r: parseInt(v.slice(0, 2), 16) / 255,
    g: parseInt(v.slice(2, 4), 16) / 255,
    b: parseInt(v.slice(4, 6), 16) / 255,
  };
}

function lightenHex(hex: string, mix: number) {
  const c = hexToRgb(hex);
  return {
    r: c.r * (1 - mix) + mix,
    g: c.g * (1 - mix) + mix,
    b: c.b * (1 - mix) + mix,
  };
}

function formatNow(timezone?: string): string {
  return new Date().toLocaleString("en-GB", {
    timeZone: timezone ?? "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
