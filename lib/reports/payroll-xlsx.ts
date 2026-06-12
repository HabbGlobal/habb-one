import * as XLSX from "xlsx";
import { formatHM, formatHours, type PayrollDataPoint } from "./payroll";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function payrollXlsx(report: PayrollDataPoint, exportedBy: string): Buffer {
  const wb = XLSX.utils.book_new();
  const fullName = `${report.employee.lastName} ${report.employee.firstName}`;

  // ── Sheet 1: Übersicht ───────────────────────────────────────────────
  const summary: (string | number)[][] = [
    ["Personalabrechnung"],
    [],
    ["Employee", `${fullName} (#${report.employee.employeeNumber})`],
    ["Zeitraum", `${MONTHS[report.period.month - 1]} ${report.period.year}`],
    ["Erstellt am", new Date().toLocaleString("de-CH", { timeZone: "Europe/Zurich" })],
    ["Exportiert von", exportedBy],
    ["Company", report.company.name],
    [],
    ["Master data"],
    ["Geburtsdatum", fmt(report.employee.dateOfBirth)],
    ["AHV-Nr.", report.employee.ahvNumber ?? ""],
    ["Adresse", report.employee.address ?? ""],
    ["Email", report.employee.email ?? ""],
    ["Phone", report.employee.phone ?? ""],
    [],
    ["Anstellung"],
    ["Anstellungsart", report.employee.employmentType === "MONTHLY_SALARY" ? "Monatslohn" : "Stundenlohn"],
    ["Pensum (%)", report.employee.workloadPercent ?? ""],
    ["Wochenstunden", report.employee.weeklyTargetHours?.toFixed(2) ?? ""],
    ["Ferienanspruch (Tage/Jahr)", report.employee.annualVacationDays],
    ["Vertragsbeginn", fmt(report.employee.startDate)],
    ["Vertragsende", fmt(report.employee.endDate)],
    [],
    ["Stunden Monat"],
    ["Soll (h)", formatHours(report.totals.targetMinutes)],
    ["Gearbeitet (h)", formatHours(report.totals.workedMinutes)],
    ["Pause (h)", formatHours(report.totals.breakMinutes)],
    ["Saldo Monat (h)", formatHours(report.totals.balanceMinutes)],
    ["Korrekturen (h)", formatHours(report.totals.adjustmentMinutes)],
    ["Saldo kumuliert (h)", formatHours(report.totals.cumulativeBalanceMinutes)],
    ["Anfangsbestand (h)", report.employee.initialOvertimeHours.toFixed(2)],
    [],
    ["Ferien-Saldo"],
    ["Jahresanspruch (Tage)", report.vacation.entitlementDays],
    ["Übertrag Vorjahr (Tage)", report.vacation.carriedOverDays],
    ["Bezogen YTD (Tage)", report.vacation.takenDaysYtd],
    ["Geplant (Tage)", report.vacation.plannedDays],
    ["Restanspruch (Tage)", report.vacation.remainingDays],
    [],
    ["Bestätigung & Freigabe"],
    ["Die erfassten Zeiten wurden geprüft und für korrekt befunden."],
    [],
    ["Ort / Datum, Unterschrift Mitarbeiter:in", ""],
    ["Ort / Datum, Unterschrift Vorgesetzte:r", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Overview");

  // ── Sheet 2: Tagesübersicht ──────────────────────────────────────────
  const dayRows: (string | number)[][] = [
    [
      "Date",
      "Wochentag",
      "Soll (h:mm)",
      "Gearbeitet (h:mm)",
      "Pause (h:mm)",
      "Saldo (h:mm)",
      "Saldo kum. (h:mm)",
      "Hinweis",
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dayRows), "Tage");

  // ── Sheet 3: Abwesenheiten ───────────────────────────────────────────
  const absRows: (string | number)[][] = [
    ["Typ", "Bezahlt", "Reduziert Soll", "Tage", "Stunden"],
  ];
  for (const a of report.absences) {
    absRows.push([
      a.label,
      a.isPaid ? "Ja" : "Nein",
      a.reducesTarget ? "Ja" : "Nein",
      a.days,
      a.hours,
    ]);
  }
  if (report.absences.length === 0) {
    absRows.push(["(keine Abwesenheiten in diesem Monat)", "", "", "", ""]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(absRows), "Abwesenheiten");

  // ── Sheet 4: Manuelle Korrekturen ────────────────────────────────────
  const adjRows: (string | number)[][] = [["Date", "Grund", "Korrektur (h)"]];
  for (const a of report.adjustments) {
    adjRows.push([a.date, a.reason, formatHours(a.minutes)]);
  }
  if (report.adjustments.length === 0) {
    adjRows.push(["(keine Korrekturen in diesem Monat)", "", ""]);
  } else {
    adjRows.push(["Summe", "", formatHours(report.totals.adjustmentMinutes)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(adjRows), "Korrekturen");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

function fmt(d: Date | null): string {
  return d ? d.toLocaleDateString("de-CH") : "";
}
