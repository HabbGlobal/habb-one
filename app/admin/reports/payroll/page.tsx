import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { buildPayrollReport, formatHM, formatHours } from "@/lib/reports/payroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, FileText, ChevronLeft } from "lucide-react";
import { PayrollAdjustments } from "./PayrollAdjustments";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ employeeId?: string; year?: string; month?: string }>;
}

export default async function PayrollDashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports.export")) {
    redirect("/admin");
  }
  const canEditAdjustments = hasPermission(session.user.role, "timeEntries.correct");

  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getFullYear();
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1;

  const employees = await prisma.employee.findMany({
    where: {
      companyId: session.user.companyId,
      deletedAt: null,
    },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
  });

  const employeeId = sp.employeeId ?? employees[0]?.id ?? null;

  let report: Awaited<ReturnType<typeof buildPayrollReport>> | null = null;
  if (employeeId) {
    try {
      report = await buildPayrollReport({
        companyId: session.user.companyId,
        employeeId,
        year,
        month,
      });
    } catch {
      // employee not found / cross-tenant → render empty state
      report = null;
    }
  }

  const months = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/reports"
        className="inline-flex items-center gap-1 text-xs text-habb-muted hover:text-habb-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Reports-Übersicht
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
          Personalabrechnung
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          Monats-Übersicht pro Mitarbeiter mit Stunden, Abwesenheiten und Ferien-Saldo. Export als
          Excel oder PDF.
        </p>
      </header>

      <form className="rounded-lg border border-habb-line bg-white px-5 py-4" method="GET">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label="Employee">
            <select
              name="employeeId"
              defaultValue={employeeId ?? ""}
              className={inputCls}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName} (#{e.employeeNumber}){e.isActive ? "" : " — inaktiv"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Month">
            <select name="month" defaultValue={month} className={inputCls}>
              {months.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Year">
            <select name="year" defaultValue={year} className={inputCls}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
            >
              Anzeigen
            </button>
          </div>
        </div>
      </form>

      {!report ? (
        <Card>
          <CardContent className="px-5 py-10 text-center text-sm text-habb-muted">
            Wähle einen Mitarbeiter und einen Monat.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/admin/reports/payroll.xlsx?employeeId=${employeeId}&year=${year}&month=${month}`}
              className="inline-flex items-center gap-2 rounded-md border border-habb-line bg-white px-3 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel exportieren
            </a>
            <a
              href={`/api/admin/reports/payroll.pdf?employeeId=${employeeId}&year=${year}&month=${month}`}
              className="inline-flex items-center gap-2 rounded-md border border-habb-line bg-white px-3 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
            >
              <FileText className="h-4 w-4" />
              PDF exportieren
            </a>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personalstammdaten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Name" value={`${report.employee.lastName} ${report.employee.firstName}`} />
                <Row label="Mitarbeiter-Nr." value={report.employee.employeeNumber} />
                <Row label="Geburtsdatum" value={fmtDate(report.employee.dateOfBirth)} />
                <Row label="AHV-Nr." value={report.employee.ahvNumber || "—"} />
                <Row label="Adresse" value={report.employee.address || "—"} />
                <Row label="Email" value={report.employee.email || "—"} />
                <Row label="Phone" value={report.employee.phone || "—"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Anstellung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Anstellungsart"
                  value={
                    report.employee.employmentType === "MONTHLY_SALARY"
                      ? "Monatslohn"
                      : "Stundenlohn"
                  }
                />
                <Row label="Pensum" value={report.employee.workloadPercent != null ? `${report.employee.workloadPercent}%` : "—"} />
                <Row
                  label="Wochenstunden"
                  value={report.employee.weeklyTargetHours != null ? `${report.employee.weeklyTargetHours.toFixed(2)} h` : "—"}
                />
                <Row label="Ferienanspruch" value={`${report.employee.annualVacationDays} Tage`} />
                <Row label="Vertragsbeginn" value={fmtDate(report.employee.startDate)} />
                <Row label="Vertragsende" value={fmtDate(report.employee.endDate)} />
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>
                  Stunden {months[month - 1]} {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Soll" value={`${formatHours(report.totals.targetMinutes)} h`} />
                  <Stat label="Gearbeitet" value={`${formatHours(report.totals.workedMinutes)} h`} />
                  <Stat label="Pause" value={`${formatHours(report.totals.breakMinutes)} h`} />
                  <Stat
                    label="Saldo Monat"
                    value={`${report.totals.balanceMinutes >= 0 ? "+" : ""}${formatHours(report.totals.balanceMinutes)} h`}
                    accent={report.totals.balanceMinutes < 0 ? "red" : "green"}
                  />
                </div>
                <p className="mt-3 text-xs text-habb-muted">
                  Kumulierter Saldo:{" "}
                  <span className="font-medium text-habb-ink">
                    {report.totals.cumulativeBalanceMinutes >= 0 ? "+" : ""}
                    {formatHours(report.totals.cumulativeBalanceMinutes)} h
                  </span>
                  &nbsp;(Anfangsbestand{" "}
                  {report.employee.initialOvertimeHours >= 0 ? "+" : ""}
                  {report.employee.initialOvertimeHours.toFixed(2)} h
                  {report.totals.adjustmentMinutes !== 0 && (
                    <>
                      {" "}· Korrekturen{" "}
                      {report.totals.adjustmentMinutes >= 0 ? "+" : ""}
                      {formatHours(report.totals.adjustmentMinutes)} h
                    </>
                  )}
                  )
                </p>
              </CardContent>
            </Card>

            <PayrollAdjustments
              employeeId={report.employee.id}
              defaultDate={`${year}-${String(month).padStart(2, "0")}-15`}
              adjustments={report.adjustments}
              totalMinutes={report.totals.adjustmentMinutes}
              canEdit={canEditAdjustments}
            />

            <Card>
              <CardHeader>
                <CardTitle>Abwesenheiten</CardTitle>
              </CardHeader>
              <CardContent>
                {report.absences.length === 0 ? (
                  <p className="text-sm text-habb-muted">Keine Abwesenheiten in diesem Monat.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-habb-line text-left text-xs uppercase tracking-wide text-habb-muted">
                        <th className="pb-2">Typ</th>
                        <th className="pb-2 text-right">Tage</th>
                        <th className="pb-2 text-right">Stunden</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-habb-line">
                      {report.absences.map((a) => (
                        <tr key={a.absenceTypeId}>
                          <td className="py-2">
                            <span className="text-habb-ink">{a.label}</span>{" "}
                            <span className="text-xs text-habb-muted">
                              ({a.isPaid ? "bezahlt" : "unbezahlt"})
                            </span>
                          </td>
                          <td className="py-2 text-right text-habb-ink">{a.days.toFixed(1)}</td>
                          <td className="py-2 text-right text-habb-muted">{a.hours.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ferien-Saldo {year}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Jahresanspruch" value={`${report.vacation.entitlementDays} Tage`} />
                <Row label="Übertrag Vorjahr" value={`${report.vacation.carriedOverDays} Tage`} />
                <Row label="Bezogen YTD" value={`${report.vacation.takenDaysYtd} Tage`} />
                <Row label="Geplant" value={`${report.vacation.plannedDays} Tage`} />
                <div className="mt-2 border-t border-habb-line pt-2">
                  <Row
                    label="Restanspruch"
                    value={`${report.vacation.remainingDays} Tage`}
                    bold
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tagesübersicht</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-habb-line text-left text-xs uppercase tracking-wide text-habb-muted">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Day</th>
                      <th className="px-2 py-2 text-right">Soll</th>
                      <th className="px-2 py-2 text-right">Gearbeitet</th>
                      <th className="px-2 py-2 text-right">Pause</th>
                      <th className="px-2 py-2 text-right">Saldo</th>
                      <th className="px-2 py-2">Hinweis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-habb-line">
                    {report.days.map((d) => {
                      const hint = d.holidayName ?? d.absence?.labelDe ?? "";
                      const balance = d.workedMinutes - d.targetMinutes;
                      return (
                        <tr key={d.date} className={hint ? "bg-habb-paper/50" : ""}>
                          <td className="px-2 py-1.5 font-mono text-xs">{d.date}</td>
                          <td className="px-2 py-1.5">{d.weekday}</td>
                          <td className="px-2 py-1.5 text-right">{formatHM(d.targetMinutes)}</td>
                          <td className="px-2 py-1.5 text-right">{formatHM(d.workedMinutes)}</td>
                          <td className="px-2 py-1.5 text-right text-habb-muted">{formatHM(d.breakMinutes)}</td>
                          <td className={`px-2 py-1.5 text-right ${balance < 0 ? "text-habb-red" : balance > 0 ? "text-habb-success" : ""}`}>
                            {balance >= 0 ? "+" : ""}{formatHM(balance)}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-habb-muted">{hint}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-habb-line/60 pb-1.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-habb-muted">{label}</span>
      <span className={`text-right ${bold ? "font-semibold text-habb-black" : "text-habb-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "red" | "green";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-habb-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          accent === "red" ? "text-habb-red" : accent === "green" ? "text-habb-success" : "text-habb-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-CH");
}
