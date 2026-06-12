import * as XLSX from "xlsx";
import { formatMin, type EmployeeMonthly } from "./monthly";

export function monthlyXlsx(report: {
  company: { name: string };
  period: { year: number; month: number; from: string; to: string };
  employees: EmployeeMonthly[];
}, exportedBy: string): Buffer {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryRows: (string | number)[][] = [
    ["Company", report.company.name],
    ["Zeitraum", `${report.period.from} – ${report.period.to}`],
    ["Erstellt am", new Date().toISOString().slice(0, 16).replace("T", " ")],
    ["Exportiert von", exportedBy],
    [],
    ["Mitarbeiter-Nr", "Name", "Soll (h)", "Gearbeitet (h)", "Pause (h)", "Saldo (h)"],
  ];
  for (const e of report.employees) {
    summaryRows.push([
      e.employeeNumber,
      `${e.lastName} ${e.firstName}`,
      formatMin(e.totals.targetMinutes),
      formatMin(e.totals.workedMinutes),
      formatMin(e.totals.breakMinutes),
      formatMin(e.totals.balanceMinutes),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Overview");

  // One detail sheet per employee
  for (const e of report.employees) {
    const rows: (string | number)[][] = [
      ["Date", "Wochentag", "Soll (h)", "Gearbeitet (h)", "Pause (h)", "Saldo (h)", "Hinweis"],
    ];
    for (const d of e.days) {
      rows.push([
        d.date,
        d.weekday,
        formatMin(d.targetMinutes),
        formatMin(d.workedMinutes),
        formatMin(d.breakMinutes),
        formatMin(d.balanceMinutes),
        d.holidayName ?? d.absence?.labelDe ?? "",
      ]);
    }
    rows.push([]);
    rows.push([
      "TOTAL",
      "",
      formatMin(e.totals.targetMinutes),
      formatMin(e.totals.workedMinutes),
      formatMin(e.totals.breakMinutes),
      formatMin(e.totals.balanceMinutes),
      "",
    ]);
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const safeName = `${e.employeeNumber} ${e.lastName}`.slice(0, 28);
    XLSX.utils.book_append_sheet(wb, sheet, safeName);
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  return buf;
}
