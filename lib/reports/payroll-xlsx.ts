import * as XLSX from "xlsx";
import { formatHM, formatHours, type PayrollDataPoint } from "./payroll";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function payrollXlsx(report: PayrollDataPoint, exportedBy: string, timezone?: string): Buffer {
  const tz = timezone ?? "Europe/Zurich";
  const wb = XLSX.utils.book_new();
  const fullName = `${report.employee.lastName} ${report.employee.firstName}`;

  // ── Sheet 1: Overview ────────────────────────────────────────────────
  const summary: (string | number)[][] = [
    ["Payroll"],
    [],
    ["Employee", `${fullName} (#${report.employee.employeeNumber})`],
    ["Period", `${MONTHS[report.period.month - 1]} ${report.period.year}`],
    ["Created at", new Date().toLocaleString("en-GB", { timeZone: tz })],
    ["Exported by", exportedBy],
    ["Company", report.company.name],
    [],
    ["Master data"],
    ["Date of birth", fmt(report.employee.dateOfBirth)],
    ["NIC", report.employee.ahvNumber ?? ""],
    ["Address", report.employee.address ?? ""],
    ["Email", report.employee.email ?? ""],
    ["Phone", report.employee.phone ?? ""],
    [],
    ["Employment"],
    ["Employment type", report.employee.employmentType === "MONTHLY_SALARY" ? "Monthly salary" : "Hourly wage"],
    ["Workload (%)", report.employee.workloadPercent ?? ""],
    ["Weekly hours", report.employee.weeklyTargetHours?.toFixed(2) ?? ""],
    ["Vacation entitlement (days/year)", report.employee.annualVacationDays],
    ["Contract start", fmt(report.employee.startDate)],
    ["Contract end", fmt(report.employee.endDate)],
    [],
    ["Monthly hours"],
    ["Target (h)", formatHours(report.totals.targetMinutes)],
    ["Worked (h)", formatHours(report.totals.workedMinutes)],
    ["Break (h)", formatHours(report.totals.breakMinutes)],
    ["Monthly balance (h)", formatHours(report.totals.balanceMinutes)],
    ["Adjustments (h)", formatHours(report.totals.adjustmentMinutes)],
    ["Cumulative balance (h)", formatHours(report.totals.cumulativeBalanceMinutes)],
    ["Initial balance (h)", report.employee.initialOvertimeHours.toFixed(2)],
    [],
    ["Vacation balance"],
    ["Annual entitlement (days)", report.vacation.entitlementDays],
    ["Carried over (days)", report.vacation.carriedOverDays],
    ["Taken YTD (days)", report.vacation.takenDaysYtd],
    ["Planned (days)", report.vacation.plannedDays],
    ["Remaining (days)", report.vacation.remainingDays],
    [],
    ["Confirmation & approval"],
    ["The recorded times have been reviewed and confirmed as correct."],
    [],
    ["Place / date, employee signature", ""],
    ["Place / date, supervisor signature", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Overview");

  // ── Sheet 2: Daily overview ──────────────────────────────────────────
  const dayRows: (string | number)[][] = [
    [
      "Date",
      "Weekday",
      "Target (h:mm)",
      "Worked (h:mm)",
      "Break (h:mm)",
      "Balance (h:mm)",
      "Cumulative balance (h:mm)",
      "Note",
    ],
  ];
  for (let i = 0; i < report.days.length; i++) {
    const d = report.days[i];
    const balance = d.workedMinutes - d.targetMinutes;
    const running = report.dayRunningBalanceMinutes[i] ?? 0;
    dayRows.push([
      d.date,
      d.weekday,
      formatHM(d.targetMinutes),
      formatHM(d.workedMinutes),
      formatHM(d.breakMinutes),
      `${balance >= 0 ? "+" : ""}${formatHM(balance)}`,
      `${running >= 0 ? "+" : ""}${formatHM(running)}`,
      d.holidayName ?? d.absence?.labelDe ?? "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dayRows), "Days");

  // ── Sheet 3: Absences ────────────────────────────────────────────────
  const absRows: (string | number)[][] = [
    ["Type", "Paid", "Reduces target", "Days", "Hours"],
  ];
  for (const a of report.absences) {
    absRows.push([
      a.label,
      a.isPaid ? "Yes" : "No",
      a.reducesTarget ? "Yes" : "No",
      a.days,
      a.hours,
    ]);
  }
  if (report.absences.length === 0) {
    absRows.push(["(no absences this month)", "", "", "", ""]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(absRows), "Absences");

  // ── Sheet 4: Manual adjustments ─────────────────────────────────────
  const adjRows: (string | number)[][] = [["Date", "Reason", "Adjustment (h)"]];
  for (const a of report.adjustments) {
    adjRows.push([a.date, a.reason, formatHours(a.minutes)]);
  }
  if (report.adjustments.length === 0) {
    adjRows.push(["(no adjustments this month)", "", ""]);
  } else {
    adjRows.push(["Total", "", formatHours(report.totals.adjustmentMinutes)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(adjRows), "Adjustments");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString("en-GB") : "";
}
