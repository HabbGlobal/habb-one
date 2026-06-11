import type { EmployeeMonthly } from "./monthly";
import { formatMin } from "./monthly";

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function monthlyCsv(report: {
  company: { name: string };
  period: { year: number; month: number; from: string; to: string };
  employees: EmployeeMonthly[];
}, exportedBy: string): string {
  const headerLines = [
    `Firma;${csvEscape(report.company.name)}`,
    `Zeitraum;${report.period.from} – ${report.period.to}`,
    `Erstellungsdatum;${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    `Exportiert von;${csvEscape(exportedBy)}`,
    "",
  ];
  const rowHeader = [
    "Mitarbeiter-Nr",
    "Name",
    "Datum",
    "Wochentag",
    "Soll (h)",
    "Gearbeitet (h)",
    "Pause (h)",
    "Saldo (h)",
    "Status",
    "Hinweis",
  ].join(";");

  const lines: string[] = [...headerLines, rowHeader];
  for (const e of report.employees) {
    for (const d of e.days) {
      lines.push(
        [
          e.employeeNumber,
          `${e.lastName} ${e.firstName}`,
          d.date,
          d.weekday,
          formatMin(d.targetMinutes),
          formatMin(d.workedMinutes),
          formatMin(d.breakMinutes),
          formatMin(d.balanceMinutes),
          d.isOpen ? "OFFEN" : d.absence ? "ABS" : d.isHoliday ? "FEIERTAG" : "",
          csvEscape(d.holidayName ?? d.absence?.labelDe ?? ""),
        ].join(";")
      );
    }
    lines.push(
      [
        e.employeeNumber,
        `${e.lastName} ${e.firstName}`,
        "TOTAL",
        "",
        formatMin(e.totals.targetMinutes),
        formatMin(e.totals.workedMinutes),
        formatMin(e.totals.breakMinutes),
        formatMin(e.totals.balanceMinutes),
        "",
        "",
      ].join(";")
    );
    lines.push("");
  }
  return lines.join("\n");
}
