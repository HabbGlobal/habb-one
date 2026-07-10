/**
 * Payroll PDF — one A4 page per employee with all relevant data
 * (master data, employment, hours summary, absences, vacation balance,
 * daily list).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatHM, formatHours, type PayrollDataPoint } from "./payroll";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const HEADING = rgb(0.04, 0.04, 0.04);
const TEXT = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.9, 0.89, 0.89);
const ACCENT = rgb(0.855, 0.055, 0.082);

export async function payrollPdf(
  report: PayrollDataPoint,
  exportedBy: string,
  timezone?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedCompanyLogo(doc, {
    logoData: report.company.logoData ?? null,
    logoMimeType: report.company.logoMimeType ?? null,
  });

  const fullName = `${report.employee.lastName} ${report.employee.firstName}`;
  const monthLabel = `${MONTHS[report.period.month - 1]} ${report.period.year}`;

  let page = doc.addPage(A4);
  if (logo) drawCompanyLogoTopRight(page, logo);
  let y = A4[1] - MARGIN;

  // ── Header ────────────────────────────────────────────────────────────
  page.drawText(report.company.name, { x: MARGIN, y, size: 11, font: bold, color: HEADING });
  y -= 18;
  page.drawText("Payroll Report", { x: MARGIN, y, size: 18, font: bold, color: HEADING });
  y -= 22;
  page.drawText(`${fullName}  ·  Employee No. ${report.employee.employeeNumber}`, {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: TEXT,
  });
  y -= 14;
  page.drawText(`Period: ${monthLabel}`, { x: MARGIN, y, size: 10, font, color: MUTED });
  y -= 18;
  drawHRule(page, y);
  y -= 18;

  // ── Master data + Employment as two columns ─────────────────────────
  const colWidth = (A4[0] - 2 * MARGIN) / 2 - 12;
  const col1X = MARGIN;
  const col2X = MARGIN + colWidth + 24;
  let yLeft = y;
  let yRight = y;

  yLeft = drawSection(page, col1X, yLeft, "Master Data", bold);
  yLeft = drawKV(page, col1X, colWidth, yLeft, "Date of Birth", fmt(report.employee.dateOfBirth), font, bold);
  yLeft = drawKV(page, col1X, colWidth, yLeft, "NIC", report.employee.ahvNumber ?? "—", font, bold);
  yLeft = drawKV(page, col1X, colWidth, yLeft, "Address", report.employee.address ?? "—", font, bold);
  yLeft = drawKV(page, col1X, colWidth, yLeft, "Email", report.employee.email ?? "—", font, bold);
  yLeft = drawKV(page, col1X, colWidth, yLeft, "Phone", report.employee.phone ?? "—", font, bold);

  yRight = drawSection(page, col2X, yRight, "Employment", bold);
  yRight = drawKV(
    page,
    col2X,
    colWidth,
    yRight,
    "Type",
    report.employee.employmentType === "MONTHLY_SALARY" ? "Monthly Salary" : "Hourly Wage",
    font,
    bold,
  );
  yRight = drawKV(
    page,
    col2X,
    colWidth,
    yRight,
    "Workload",
    report.employee.workloadPercent != null ? `${report.employee.workloadPercent}%` : "—",
    font,
    bold,
  );
  yRight = drawKV(
    page,
    col2X,
    colWidth,
    yRight,
    "Weekly Hours",
    report.employee.weeklyTargetHours != null ? `${report.employee.weeklyTargetHours.toFixed(2)} h` : "—",
    font,
    bold,
  );
  yRight = drawKV(
    page,
    col2X,
    colWidth,
    yRight,
    "Vacation Entitlement",
    `${report.employee.annualVacationDays} days`,
    font,
    bold,
  );
  yRight = drawKV(page, col2X, colWidth, yRight, "Contract Start", fmt(report.employee.startDate), font, bold);
  yRight = drawKV(page, col2X, colWidth, yRight, "Contract End", fmt(report.employee.endDate), font, bold);

  y = Math.min(yLeft, yRight) - 8;
  drawHRule(page, y);
  y -= 18;

  // ── Hours Summary ──────────────────────────────────────────────────
  y = drawSection(page, MARGIN, y, `Hours ${monthLabel}`, bold);
  const stats: [string, string][] = [
    ["Target", `${formatHours(report.totals.targetMinutes)} h`],
    ["Worked", `${formatHours(report.totals.workedMinutes)} h`],
    ["Break", `${formatHours(report.totals.breakMinutes)} h`],
    [
      "Monthly Balance",
      `${report.totals.balanceMinutes >= 0 ? "+" : ""}${formatHours(report.totals.balanceMinutes)} h`,
    ],
  ];
  const cellW = (A4[0] - 2 * MARGIN) / 4;
  for (let i = 0; i < stats.length; i++) {
    const [label, value] = stats[i];
    const x = MARGIN + i * cellW;
    page.drawText(label.toUpperCase(), { x, y, size: 8, font, color: MUTED });
    page.drawText(value, { x, y: y - 16, size: 14, font: bold, color: HEADING });
  }
  y -= 30;
  const adjLabel =
    report.totals.adjustmentMinutes !== 0
      ? `  ·  Corrections: ${report.totals.adjustmentMinutes >= 0 ? "+" : ""}${formatHours(report.totals.adjustmentMinutes)} h`
      : "";
  page.drawText(
    `Cumulative balance: ${report.totals.cumulativeBalanceMinutes >= 0 ? "+" : ""}${formatHours(report.totals.cumulativeBalanceMinutes)} h  ·  Opening balance: ${report.employee.initialOvertimeHours >= 0 ? "+" : ""}${report.employee.initialOvertimeHours.toFixed(2)} h${adjLabel}`,
    { x: MARGIN, y, size: 9, font, color: MUTED },
  );
  y -= 16;
  drawHRule(page, y);
  y -= 18;

  // ── Manual Corrections (only if present) ────────────────────────
  if (report.adjustments.length > 0) {
    y = drawSection(page, MARGIN, y, "Manual Corrections", bold);
    for (const a of report.adjustments) {
      const label = `${a.date} — ${a.reason}`.slice(0, 80);
      const value = `${a.minutes >= 0 ? "+" : ""}${formatHours(a.minutes)} h`;
      y = drawKV(page, MARGIN, A4[0] - 2 * MARGIN, y, label, value, font, bold);
    }
    y -= 4;
    drawHRule(page, y);
    y -= 18;
  }

  // ── Absences + Vacation Balance as two columns ────────────────────
  let yL = y;
  let yR = y;

  yL = drawSection(page, col1X, yL, "Absences", bold);
  if (report.absences.length === 0) {
    page.drawText("No absences in this month.", { x: col1X, y: yL, size: 9, font, color: MUTED });
    yL -= 14;
  } else {
    for (const a of report.absences) {
      const label = `${a.label} ${a.isPaid ? "" : "(unpaid)"}`.trim();
      const value = `${a.days.toFixed(1)} d / ${a.hours.toFixed(1)} h`;
      yL = drawKV(page, col1X, colWidth, yL, label, value, font, bold);
    }
  }

  yR = drawSection(page, col2X, yR, `Vacation Balance ${report.period.year}`, bold);
  yR = drawKV(page, col2X, colWidth, yR, "Annual Entitlement", `${report.vacation.entitlementDays} days`, font, bold);
  yR = drawKV(page, col2X, colWidth, yR, "Carry-over", `${report.vacation.carriedOverDays} days`, font, bold);
  yR = drawKV(page, col2X, colWidth, yR, "Taken YTD", `${report.vacation.takenDaysYtd} days`, font, bold);
  yR = drawKV(page, col2X, colWidth, yR, "Planned", `${report.vacation.plannedDays} days`, font, bold);
  yR -= 4;
  page.drawText("Remaining", { x: col2X, y: yR, size: 9, font: bold, color: HEADING });
  page.drawText(`${report.vacation.remainingDays} days`, {
    x: col2X + colWidth - widthOf(`${report.vacation.remainingDays} days`, 11, bold),
    y: yR,
    size: 11,
    font: bold,
    color: ACCENT,
  });
  yR -= 16;

  y = Math.min(yL, yR) - 8;
  drawHRule(page, y);
  y -= 18;

  // ── Daily List ──────────────────────────────────────────────────────
  y = drawSection(page, MARGIN, y, "Daily Overview", bold);
  const cols = [
    { label: "Date", width: 64 },
    { label: "Day", width: 34 },
    { label: "Target", width: 52, right: true },
    { label: "Worked", width: 62, right: true },
    { label: "Break", width: 50, right: true },
    { label: "Balance", width: 56, right: true },
    { label: "Cum. Bal.", width: 66, right: true },
    { label: "Note", width: 131 },
  ];

  // Small padding for right-aligned columns so values/headers do not
  // touch the next column (e.g. "CUM. BAL."→"NOTE").
  const RIGHT_PAD = 8;

  // Header
  let x = MARGIN;
  for (const c of cols) {
    const w = "width" in c ? c.width : 0;
    const t = c.label;
    const tx = c.right ? x + w - RIGHT_PAD - widthOf(t, 7, font) : x;
    page.drawText(t.toUpperCase(), { x: tx, y, size: 7, font, color: MUTED });
    x += w;
  }
  y -= 10;
  drawHRule(page, y, RULE);
  y -= 10;

  for (let di = 0; di < report.days.length; di++) {
    const d = report.days[di];
    if (y < MARGIN + 40) {
      page = doc.addPage(A4);
      if (logo) drawCompanyLogoTopRight(page, logo);
      y = A4[1] - MARGIN;
      page.drawText(`Payroll Report — ${fullName} — ${monthLabel} (continued)`, {
        x: MARGIN,
        y,
        size: 9,
        font,
        color: MUTED,
      });
      y -= 18;
    }
    const balance = d.workedMinutes - d.targetMinutes;
    const running = report.dayRunningBalanceMinutes[di] ?? 0;
    const hint = d.holidayName ?? d.absence?.labelDe ?? "";
    const row = [
      d.date,
      d.weekday,
      formatHM(d.targetMinutes),
      formatHM(d.workedMinutes),
      formatHM(d.breakMinutes),
      `${balance >= 0 ? "+" : ""}${formatHM(balance)}`,
      `${running >= 0 ? "+" : ""}${formatHM(running)}`,
      hint.slice(0, 24),
    ];
    let cx = MARGIN;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const t = row[i] ?? "";
      const tx = c.right ? cx + c.width - RIGHT_PAD - widthOf(t, 9, font) : cx;
      // Spalte 5 = Tagessaldo, 6 = laufender Saldo → rot bei negativ.
      const color =
        (i === 5 && balance < 0) || (i === 6 && running < 0)
          ? ACCENT
          : i === 7
            ? MUTED
            : TEXT;
      page.drawText(t, { x: tx, y, size: 9, font, color });
      cx += c.width;
    }
    y -= 12;
  }

  // ── Signatures / Approval ────────────────────────────────────────
  // Ensure enough space (block needs ~110px), otherwise new page.
  if (y < MARGIN + 130) {
    page = doc.addPage(A4);
    if (logo) drawCompanyLogoTopRight(page, logo);
    y = A4[1] - MARGIN;
  } else {
    y -= 10;
  }
  drawHRule(page, y, RULE);
  y -= 20;
  page.drawText("Confirmation & Approval", { x: MARGIN, y, size: 10, font: bold, color: HEADING });
  y -= 12;
  page.drawText(
    "The recorded times have been reviewed and found to be correct.",
    { x: MARGIN, y, size: 8, font, color: MUTED },
  );
  y -= 40;

  // Two signature columns: Employee | Supervisor
  const sigColW = (A4[0] - 2 * MARGIN - 40) / 2;
  drawSignatureSlot(page, MARGIN, y, sigColW, "Place / Date, Employee Signature", font);
  drawSignatureSlot(page, MARGIN + sigColW + 40, y, sigColW, "Place / Date, Supervisor Signature", font);
  y -= 28;

  // Footer
  y -= 8;
  drawHRule(page, y, RULE);
  y -= 12;
  page.drawText(
    `Created: ${new Date().toLocaleString("en-GB", { timeZone: timezone ?? "Europe/Zurich" })} — Exported by ${exportedBy}`,
    { x: MARGIN, y, size: 8, font, color: MUTED },
  );

  return doc.save();
}

/** Draws a signature line + label below. */
function drawSignatureSlot(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  label: string,
  font: PDFFont,
) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.75,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText(label, { x, y: y - 12, size: 8, font, color: MUTED });
}

function drawSection(page: PDFPage, x: number, y: number, label: string, bold: PDFFont): number {
  page.drawText(label, { x, y, size: 10, font: bold, color: HEADING });
  return y - 14;
}

function drawKV(
  page: PDFPage,
  x: number,
  width: number,
  y: number,
  label: string,
  value: string,
  font: PDFFont,
  bold: PDFFont,
): number {
  page.drawText(label, { x, y, size: 8, font, color: MUTED });
  const valueWidth = widthOf(value, 9, bold);
  page.drawText(value, { x: x + width - valueWidth, y, size: 9, font: bold, color: TEXT });
  return y - 13;
}

function drawHRule(page: PDFPage, y: number, color = RULE) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4[0] - MARGIN, y },
    thickness: 0.5,
    color,
  });
}

function widthOf(text: string, size: number, font: PDFFont): number {
  return font.widthOfTextAtSize(text, size);
}

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString("en-GB") : "—";
}
