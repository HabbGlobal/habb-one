import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { readKioskSession } from "@/lib/kiosk-session";
import { resolveKioskCompany } from "@/lib/kiosk-company";
import { buildEmployeeActionSummary } from "@/lib/kiosk-employee-summary";
import { ActionsPanel } from "./ActionsPanel";
import { LiveStats } from "./LiveStats";
import { BackGuard } from "./BackGuard";
import { endKioskSessionAction } from "./actions";
import { formatDateCH } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";
import { KioskThemeToggle } from "@/components/kiosk/KioskThemeToggle";

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
      company: {
        select: { id: true, name: true, logoMimeType: true, updatedAt: true },
      },
    },
  });
  if (!employee) notFound();

  const serverNow = new Date();
  const { status, today, week, vacation } = await buildEmployeeActionSummary(
    employeeId,
    effectiveCompanyId,
    serverNow,
  );

  const statusLabel =
    status === "IN"
      ? tKiosk("statusIn")
      : status === "BREAK"
      ? tKiosk("statusBreak")
      : tKiosk("statusOut");

  const initials = `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
  const avatarGlow =
    status === "IN"
      ? "bg-emerald-500/25 dark:bg-emerald-500/30"
      : status === "BREAK"
      ? "bg-amber-500/25 dark:bg-amber-500/30"
      : "bg-neutral-400/15 dark:bg-white/10";
  const avatarRing =
    status === "IN"
      ? "border-emerald-500/40"
      : status === "BREAK"
      ? "border-amber-500/40"
      : "border-habb-line dark:border-white/10";

  return (
    <main className="relative min-h-screen overflow-hidden bg-habb-paper text-habb-ink p-4 dark:bg-habb-black dark:text-white md:p-8">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-habb-red/10 blur-3xl dark:bg-habb-red/20" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-habb-red/10 blur-3xl dark:bg-habb-red/15" />

      {/* Prevent bfcache replay by forcing a full reload after back/forward restore. */}
      <BackGuard />
      <div className="relative max-w-3xl mx-auto space-y-4">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          showWordmark={false}
          rightSlot={
            <div className="flex items-center gap-2">
              <KioskThemeToggle />
              {/* This must not be a simple link. Clicking Back must immediately
                  clear the kiosk PIN session so the next tablet user cannot
                  return to this page with browser forward navigation. */}
              <form action={endKioskSessionAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-3 rounded-2xl border border-habb-line bg-white px-5 py-3 text-sm font-bold text-habb-muted transition-all hover:text-habb-ink dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {tKiosk("back")}
                </button>
              </form>
            </div>
          }
        />

        <div className="rounded-3xl border border-habb-line bg-white shadow-sm p-8 dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <div className={`absolute inset-0 scale-125 rounded-full blur-2xl ${avatarGlow}`} />
              <div className={`relative flex h-20 w-20 items-center justify-center rounded-full border-2 bg-habb-paper text-2xl font-black text-habb-ink shadow-lg dark:bg-black/40 dark:text-white ${avatarRing}`}>
                {initials}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-habb-red mb-2">
                {tKiosk("welcome", { name: "" })}
              </p>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-habb-ink dark:text-white dark:drop-shadow-md">
                {employee.firstName} {employee.lastName}
              </h2>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-base font-medium text-habb-muted dark:text-neutral-400">{tKiosk("currentStatus")}:</span>
                <StatusPill status={status} label={statusLabel} />
              </div>
            </div>
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
          isOpen={today.isOpen}
          isOnBreak={today.isOnBreak}
          todayDate={formatDateCH(serverNow)}
          todayTargetMin={today.targetMinutes}
          todayWorkedMin={today.workedMinutes}
          todayBreakMin={today.breakMinutes}
          weekTargetMin={week.targetMinutes}
          weekWorkedMin={week.workedMinutes}
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

        <div className="rounded-3xl border border-habb-line bg-white shadow-sm p-8 flex flex-col justify-center dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-2xl">
          <h3 className="text-xl font-bold text-habb-muted dark:text-neutral-300 mb-2">{tKiosk("vacationRemaining")}</h3>
          <p className="text-4xl font-black tabular-nums text-habb-ink dark:text-white">
            {vacation.remainingDays.toFixed(1)}{" "}
            <span className="text-2xl font-normal text-habb-muted dark:text-neutral-500">
              / {vacation.totalDays.toFixed(1)} days
            </span>
          </p>
        </div>

        <KioskBrandFooter />
      </div>
    </main>
  );
}

function StatusPill({ status, label }: { status: "IN" | "OUT" | "BREAK"; label: string }) {
  const tone =
    status === "IN"
      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400 dark:shadow-[0_0_15px_rgba(16,185,129,0.1)]"
      : status === "BREAK"
      ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400 dark:shadow-[0_0_15px_rgba(245,158,11,0.1)]"
      : "bg-habb-paper text-habb-muted border border-habb-line dark:bg-white/5 dark:text-neutral-400 dark:border-white/10";
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
