import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readKioskSession } from "@/lib/kiosk-session";
import { resolveKioskCompany } from "@/lib/kiosk-company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { calculateVacationBalance } from "@/lib/time/calc";
import { ActionsPanel } from "./ActionsPanel";
import { LiveStats } from "./LiveStats";
import { BackGuard } from "./BackGuard";
import { endKioskSessionAction } from "./actions";
import { formatDateCH } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";

// Always fetch fresh data — never cache the kiosk page since it backs a
// real-time UI. The LiveStats component still ticks per-second on the client.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskActionsPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const tKiosk = await getTranslations("kiosk");
  const { employeeId } = await params;

  // Kern-Schutz: nur wer per PIN authentifiziert ist (Kiosk-Session) darf
  // die Actions-Seite DIESES employeeId sehen. Das ist die eigentliche
  // Anti-Leak-Garantie — ohne gültige PIN-Session geht es zurück zur
  // PIN-Eingabe.
  const sessionEmployeeId = await readKioskSession();
  if (sessionEmployeeId !== employeeId) redirect(`/kiosk/${employeeId}`);

  // Firma 3-Wege auflösen (Account-Session ODER Lock-Cookie ODER Single-
  // Company). Kein hartes Lock-Cookie mehr verlangen — sonst landen
  // Account-/Single-Tenant-Kioske nach PIN-Eingabe wieder auf der Liste.
  const { effectiveCompanyId } = await resolveKioskCompany();
  if (!effectiveCompanyId) redirect("/kiosk");

  // Defense-in-Depth: der PIN-authentifizierte Employee MUSS zur Kiosk-
  // Firma gehören.
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: effectiveCompanyId },
    include: {
      absences: { include: { absenceType: true } },
      company: {
        select: { id: true, name: true, logoMimeType: true, updatedAt: true },
      },
    },
  });
  if (!employee) notFound();

  const serverNow = new Date();
  const summary = await getEmployeeKioskSummary(employeeId, serverNow, {
    expectedCompanyId: effectiveCompanyId,
  });
  const today = summary.today;
  const status = today?.isOnBreak ? "BREAK" : today?.isOpen ? "IN" : "OUT";

  // Vacation balance for the current year.
  const year = serverNow.getFullYear();
  const vacationDaysUsed = employee.absences
    .filter((a) => a.status === "APPROVED" && a.absenceType.category === "VACATION")
    .filter((a) => a.startDate.getFullYear() === year)
    .reduce((sum, a) => sum + countAbsenceDays(a), 0);
  const vacationDaysPlanned = employee.absences
    .filter((a) => a.status === "REQUESTED" && a.absenceType.category === "VACATION")
    .filter((a) => a.startDate.getFullYear() === year)
    .reduce((sum, a) => sum + countAbsenceDays(a), 0);
  const vacation = calculateVacationBalance({
    annualDays: employee.annualVacationDays,
    carryOverDays: employee.initialVacationDays,
    usedDays: vacationDaysUsed,
    plannedDays: vacationDaysPlanned,
  });

  const statusLabel =
    status === "IN"
      ? tKiosk("statusIn")
      : status === "BREAK"
      ? tKiosk("statusBreak")
      : tKiosk("statusOut");

  return (
    <main className="min-h-screen bg-habb-paper p-4 md:p-8">
      {/* bfcache-Replay-Schutz: erzwingt Full-Reload bei Back/Forward-Restore */}
      <BackGuard />
      <div className="max-w-3xl mx-auto space-y-4">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          rightSlot={
            // WICHTIG: kein simpler Link! Der "Back"-Klick MUSS die
            // Kiosk-PIN-Session sofort löschen, sonst kann der Nachfolger
            // am Tablet via Browser-Forward auf diese Seite zurück.
            <form action={endKioskSessionAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink shadow-sm transition hover:bg-habb-paper hover:text-habb-black"
              >
                <ArrowLeft className="h-4 w-4" />
                {tKiosk("back")}
              </button>
            </form>
          }
        />

        <Card className="border-habb-line shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">
                  {tKiosk("welcome", { name: "" })}
                </p>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-habb-ink">
                  {employee.firstName} {employee.lastName}
                </h2>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-habb-muted">{tKiosk("currentStatus")}:</span>
              <StatusPill status={status} label={statusLabel} />
            </div>
          </CardContent>
        </Card>

        <ActionsPanel
          status={status}
          labels={{
            clockIn: tKiosk("clockIn"),
            clockOut: tKiosk("clockOut"),
            breakStart: tKiosk("breakStart"),
            breakEnd: tKiosk("breakEnd"),
            doneClockIn: tKiosk("doneClockIn", { time: "{time}" }),
            doneClockOut: tKiosk("doneClockOut", { time: "{time}" }),
            doneBreakStart: tKiosk("doneBreakStart", { time: "{time}" }),
            doneBreakEnd: tKiosk("doneBreakEnd", { time: "{time}" }),
          }}
        />

        <LiveStats
          serverNowIso={serverNow.toISOString()}
          isOpen={today?.isOpen ?? false}
          isOnBreak={today?.isOnBreak ?? false}
          todayDate={formatDateCH(serverNow)}
          todayTargetMin={today?.targetMinutes ?? 0}
          todayWorkedMin={today?.workedMinutes ?? 0}
          todayBreakMin={today?.breakMinutes ?? 0}
          weekTargetMin={summary.weekTotals.targetMinutes}
          weekWorkedMin={summary.weekTotals.workedMinutes}
          labels={{
            today: tKiosk("today"),
            thisWeek: tKiosk("thisWeek"),
            target: tKiosk("target"),
            worked: tKiosk("worked"),
            balance: tKiosk("balance"),
            remaining: tKiosk("remaining"),
            breakLabel: tKiosk("statusBreak"),
          }}
        />

        <Card className="border-habb-line shadow-sm">
          <CardHeader>
            <CardTitle className="text-habb-ink">{tKiosk("vacationRemaining")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-habb-ink">
              {vacation.remainingDays.toFixed(1)}{" "}
              <span className="text-lg font-normal text-habb-muted">
                / {vacation.totalDays.toFixed(1)} Tage
              </span>
            </p>
          </CardContent>
        </Card>

        <KioskBrandFooter />
      </div>
    </main>
  );
}

function countAbsenceDays(a: {
  startDate: Date;
  endDate: Date;
  startHalfDay: boolean;
  endHalfDay: boolean;
}): number {
  const ms = a.endDate.getTime() - a.startDate.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  let result = days;
  if (a.startHalfDay) result -= 0.5;
  if (a.endHalfDay && days > 0) result -= 0.5;
  return Math.max(0, result);
}

function StatusPill({ status, label }: { status: "IN" | "OUT" | "BREAK"; label: string }) {
  const tone =
    status === "IN"
      ? "bg-habb-success/10 text-habb-success"
      : status === "BREAK"
      ? "bg-habb-warning/10 text-habb-warning"
      : "bg-habb-paper text-habb-muted ring-1 ring-habb-line";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${tone}`}
    >
      {status === "IN" && <span className="inline-block w-2 h-2 rounded-full bg-habb-success animate-pulse" />}
      {status === "BREAK" && <span className="inline-block w-2 h-2 rounded-full bg-habb-warning animate-pulse" />}
      {label}
    </span>
  );
}
