// Excel-Export für die drei ERP-Reports. Pure Funktion: nimmt Report-DTO,
// liefert Buffer.

import ExcelJS from "exceljs";
import type { CalcAccuracyReport } from "./calculation";
import type { MachineUtilizationReport } from "./machine-utilization";
import type { EmployeeProductivityReport } from "./employee-productivity";

const HEADER_STYLE = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF1F2937" },
  },
  alignment: { vertical: "middle" as const },
};

function fmtPeriod(from: Date, to: Date): string {
  const f = (d: Date) =>
    new Intl.DateTimeFormat("de-CH", { dateStyle: "short" }).format(d);
  return `${f(from)} – ${f(to)}`;
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = HEADER_STYLE.font;
  row.fill = HEADER_STYLE.fill;
  row.alignment = HEADER_STYLE.alignment;
  row.height = 22;
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
}

// ─────────────────────────────────────────
// Calc-Accuracy
// ─────────────────────────────────────────

export async function calcAccuracyXlsx(
  r: CalcAccuracyReport,
  exportedBy: string,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = exportedBy;
  wb.created = new Date();
  wb.title = `Kalkulations-Genauigkeit ${fmtPeriod(r.period.from, r.period.to)}`;

  const ws = wb.addWorksheet("Kalkulation");
  ws.columns = [
    { header: "Auftrag", key: "orderNumber", width: 18 },
    { header: "Kunde", key: "customerName", width: 32 },
    { header: "Status", key: "status", width: 14 },
    { header: "Liefertermin", key: "promisedAt", width: 14 },
    { header: "Pos.", key: "itemCount", width: 6 },
    { header: "Schätzung (Min)", key: "estimatedMinutes", width: 16 },
    { header: "Ist (Min)", key: "actualMinutes", width: 14 },
    { header: "Verrechnet (Min)", key: "billedMinutes", width: 16 },
    { header: "Abw. Ist vs. Schätz. (%)", key: "deviationActualVsEstimatedPct", width: 22 },
    { header: "Abw. Verr. vs. Schätz. (%)", key: "deviationBilledVsEstimatedPct", width: 24 },
    { header: "Schätzung CHF", key: "estimatedCHF", width: 14 },
    { header: "Verrechnet CHF", key: "billedCHF", width: 14 },
  ];
  styleHeader(ws);

  for (const row of r.rows) {
    ws.addRow({
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      status: row.status,
      promisedAt: row.promisedAt.toLocaleDateString("de-CH"),
      itemCount: row.itemCount,
      estimatedMinutes: row.estimatedMinutes,
      actualMinutes: row.actualMinutes,
      billedMinutes: row.billedMinutes,
      deviationActualVsEstimatedPct:
        row.deviationActualVsEstimatedPct == null
          ? ""
          : Number(row.deviationActualVsEstimatedPct.toFixed(1)),
      deviationBilledVsEstimatedPct: Number(
        row.deviationBilledVsEstimatedPct.toFixed(1),
      ),
      estimatedCHF: row.estimatedCHF,
      billedCHF: row.billedCHF,
    });
  }

  // Total-Zeile
  const total = ws.addRow({
    orderNumber: "TOTAL",
    customerName: "",
    status: "",
    promisedAt: "",
    itemCount: r.rows.length,
    estimatedMinutes: r.totals.estimatedMinutes,
    actualMinutes: r.totals.actualMinutes,
    billedMinutes: r.totals.billedMinutes,
    deviationActualVsEstimatedPct: "",
    deviationBilledVsEstimatedPct: Number(r.totals.weightedDeviationPct.toFixed(1)),
    estimatedCHF: r.totals.estimatedCHF,
    billedCHF: r.totals.billedCHF,
  });
  total.font = { bold: true };
  total.border = { top: { style: "medium" } };

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ─────────────────────────────────────────
// Machine-Utilization
// ─────────────────────────────────────────

export async function machineUtilizationXlsx(
  r: MachineUtilizationReport,
  exportedBy: string,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = exportedBy;
  wb.created = new Date();
  wb.title = `Maschinen-Auslastung ${fmtPeriod(r.period.from, r.period.to)}`;

  const ws = wb.addWorksheet("Maschinen-Auslastung");
  ws.columns = [
    { header: "Maschine", key: "machineName", width: 28 },
    { header: "Typ", key: "machineType", width: 18 },
    { header: "Verfügbar (h)", key: "available", width: 14 },
    { header: "Gebucht (h)", key: "booked", width: 14 },
    { header: "Auslastung (%)", key: "utilizationPct", width: 16 },
    { header: "Buchungen", key: "bookingCount", width: 12 },
  ];
  styleHeader(ws);

  for (const row of r.rows) {
    const r2 = ws.addRow({
      machineName: row.machineName,
      machineType: row.machineType,
      available: Math.round(row.availableMinutes / 6) / 10,
      booked: Math.round(row.bookedMinutes / 6) / 10,
      utilizationPct: row.utilizationPct,
      bookingCount: row.bookingCount,
    });
    // Farbliche Markierung — überlastete Maschinen rot, freie blau
    if (row.utilizationPct > 90) {
      r2.getCell("utilizationPct").font = { color: { argb: "FFB91C1C" }, bold: true };
    } else if (row.utilizationPct < 30) {
      r2.getCell("utilizationPct").font = { color: { argb: "FF1D4ED8" } };
    }
  }

  const total = ws.addRow({
    machineName: "TOTAL",
    machineType: "",
    available: Math.round(r.totals.availableMinutes / 6) / 10,
    booked: Math.round(r.totals.bookedMinutes / 6) / 10,
    utilizationPct: r.totals.utilizationPct,
    bookingCount: r.rows.reduce((s, r) => s + r.bookingCount, 0),
  });
  total.font = { bold: true };
  total.border = { top: { style: "medium" } };

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ─────────────────────────────────────────
// Employee-Productivity
// ─────────────────────────────────────────

export async function employeeProductivityXlsx(
  r: EmployeeProductivityReport,
  exportedBy: string,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = exportedBy;
  wb.created = new Date();
  wb.title = `Mitarbeiter-Produktivität ${fmtPeriod(r.period.from, r.period.to)}`;

  const ws = wb.addWorksheet("Produktivität");
  ws.columns = [
    { header: "Nr.", key: "employeeNumber", width: 8 },
    { header: "Nachname", key: "lastName", width: 20 },
    { header: "Vorname", key: "firstName", width: 18 },
    { header: "Schritte", key: "stepCount", width: 10 },
    { header: "Total (h)", key: "totalHours", width: 12 },
    { header: "Billable (h)", key: "billableHours", width: 12 },
    { header: "Quote (%)", key: "quotaPct", width: 12 },
  ];
  styleHeader(ws);

  for (const row of r.rows) {
    ws.addRow({
      employeeNumber: row.employeeNumber,
      lastName: row.lastName,
      firstName: row.firstName,
      stepCount: row.stepCount,
      totalHours: Math.round(row.totalMinutes / 6) / 10,
      billableHours: Math.round(row.billableMinutes / 6) / 10,
      quotaPct: row.billableQuotaPct,
    });
  }

  const total = ws.addRow({
    employeeNumber: "",
    lastName: "TOTAL",
    firstName: "",
    stepCount: "",
    totalHours: Math.round(r.totals.totalMinutes / 6) / 10,
    billableHours: Math.round(r.totals.billableMinutes / 6) / 10,
    quotaPct: r.totals.billableQuotaPct,
  });
  total.font = { bold: true };
  total.border = { top: { style: "medium" } };

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
