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
    `Company;${csvEscape(report.company.name)}`,
    `Period;${report.period.from} – ${report.period.to}`,
    `Created at;${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    `Exported by;${csvEscape(exportedBy)}`,
    "",
  ];
  const rowHeader = [
    "Employee No.",
    "Name",
    "Date",
    "Weekday",
    "Target (h)",
    "Worked (h)",
    "Break (h)",
    "Balance (h)",
    "Status",
    "Note",
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
          d.isOpen ? "OPEN" : d.absence ? "ABS" : d.isHoliday ? "HOLIDAY" : "",
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
