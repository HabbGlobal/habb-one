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

  // Core protection: only the employee authenticated by PIN may view the
  // actions page for this employeeId. Without a valid kiosk session, return
  // to the PIN entry page.
  const sessionEmployeeId = await readKioskSession();
  if (sessionEmployeeId !== employeeId) redirect(`/kiosk/${employeeId}`);

  // Resolve the company from the account session, lock cookie, or
  // single-company fallback. Do not require a lock cookie because account
  // and single-tenant kiosks may not have one.
  const { effectiveCompanyId } = await resolveKioskCompany();
  if (!effectiveCompanyId) redirect("/kiosk");

  // Defense in depth: the PIN-authenticated employee must belong to the
  // company currently assigned to this kiosk.
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
    <main className="min-h-screen bg-habb-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-habb-red/20 via-habb-black to-habb-black text-white p-4 md:p-8">
      {/* Prevent bfcache replay by forcing a full reload after back/forward restore. */}
      <BackGuard />
      <div className="max-w-3xl mx-auto space-y-4">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          showWordmark={false}
          theme="dark"
          rightSlot={
            // This must not be a simple link. Clicking Back must immediately
            // clear the kiosk PIN session so the next tablet user cannot
            // return to this page with browser forward navigation.
            <form action={endKioskSessionAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-5 py-3 text-sm font-bold text-neutral-300 transition-all hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                {tKiosk("back")}
              </button>
            </form>
          }
        />

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-habb-red mb-2">
                {tKiosk("welcome", { name: "" })}
              </p>
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
                {employee.firstName} {employee.lastName}
              </h2>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <span className="text-lg font-medium text-neutral-400">{tKiosk("currentStatus")}:</span>
            <StatusPill status={status} label={statusLabel} />
          </div>
        </div>

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

        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl flex flex-col justify-center">
          <h3 className="text-xl font-bold text-neutral-300 mb-2">{tKiosk("vacationRemaining")}</h3>
          <p className="text-4xl font-black tabular-nums text-white">
            {vacation.remainingDays.toFixed(1)}{" "}
            <span className="text-2xl font-normal text-neutral-500">
              / {vacation.totalDays.toFixed(1)} days
            </span>
          </p>
        </div>

        <KioskBrandFooter theme="dark" />
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
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
      : status === "BREAK"
      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
      : "bg-white/5 text-neutral-400 border border-white/10";
  return (
    <span
      className={`inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm font-bold tracking-wider uppercase ${tone}`}
    >
      {status === "IN" && <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      {status === "BREAK" && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
      {label}
    </span>
  );
}
