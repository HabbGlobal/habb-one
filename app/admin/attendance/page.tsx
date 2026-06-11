// Admin-Anwesenheits-Übersicht — Hybrid-Dashboard:
//   - KPI-Cards oben: Anwesend / In Pause / Abwesend / Heute total
//   - Liste pro Mitarbeiter mit Status-Badge + Heute/Soll + Wochen-Saldo
//
// Auto-Refresh alle 30 s. Kein Caching server-seitig (`force-dynamic`).

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getCompanyAttendanceSnapshot, type EmployeeAttendance } from "@/lib/time/attendance";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Activity, Coffee, LogOut, Plane, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "attendance.read")) {
    redirect("/admin");
  }

  const snapshot = await getCompanyAttendanceSnapshot(
    session.user.companyId,
    new Date(),
  );

  // Wenn User korrigieren darf, gehen die Zeilen-Links auf das
  // SAP-Style Stundenblatt — sonst weiter auf die Korrektur-Liste.
  const canEditSheet = hasPermission(session.user.role, "timeEntries.correct");

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <header>
        <h1 className="text-2xl font-semibold">Anwesenheit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live-Übersicht der Werkstatt — wer ist da, wer ist in Pause, wer
          abwesend. Datenstand:{" "}
          {new Date(snapshot.generatedAtIso).toLocaleTimeString("de-CH", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
          {" "}· auto-refresh alle 30 s.
        </p>
      </header>

      {/* KPI-Cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi
          label="Aktive Mitarbeiter"
          value={snapshot.kpis.total}
          icon={<Users className="h-4 w-4" />}
        />
        <Kpi
          label="Anwesend"
          value={snapshot.kpis.countIn}
          tone="success"
          icon={<Activity className="h-4 w-4" />}
        />
        <Kpi
          label="In Pause"
          value={snapshot.kpis.countBreak}
          tone="warning"
          icon={<Coffee className="h-4 w-4" />}
        />
        <Kpi
          label="Abwesend"
          value={snapshot.kpis.countAbsent}
          tone="info"
          icon={<Plane className="h-4 w-4" />}
        />
        <Kpi
          label="Ausgestempelt"
          value={snapshot.kpis.countOut}
          tone="muted"
          icon={<LogOut className="h-4 w-4" />}
        />
      </section>

      {/* Heute Gesamt-Leistung */}
      <section className="rounded-xl border border-habb-line bg-white px-4 py-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-habb-muted">
              Heute geleistet (Werkstatt total)
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {formatHmm(snapshot.kpis.todayWorkedMinutesTotal)}
            </div>
          </div>
        </div>
      </section>

      {/* Mitarbeiter-Liste */}
      <section className="rounded-xl border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-semibold">Mitarbeiter</h2>
        </div>
        {snapshot.employees.length === 0 ? (
          <p className="px-5 py-6 text-sm text-habb-muted">
            Keine aktiven Mitarbeiter.
          </p>
        ) : (
          <ul className="divide-y divide-habb-line">
            {snapshot.employees.map((e) => (
              <EmployeeRow key={e.id} e={e} canEditSheet={canEditSheet} />
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Hinweis: Stempel-Korrekturen (z. B. wenn jemand das Ausstempeln
        vergessen hat) gehen weiter über{" "}
        <Link href="/admin/time-entries" className="underline">
          Zeiterfassung
        </Link>
        . Diese Ansicht ist nur lesend.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────
// Sub-Komponenten
// ─────────────────────────────────────────

function Kpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "info" | "muted";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "success"
      ? "text-habb-success"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "info"
          ? "text-sky-600"
          : tone === "muted"
            ? "text-habb-muted"
            : "text-habb-black";
  return (
    <div className="rounded-xl border border-habb-line bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-habb-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeAttendance["status"] }) {
  if (status === "IN") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Eingestempelt
      </span>
    );
  }
  if (status === "BREAK") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        In Pause
      </span>
    );
  }
  if (status === "ABSENT") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
        Abwesend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
      Ausgestempelt
    </span>
  );
}

function EmployeeRow({
  e,
  canEditSheet,
}: {
  e: EmployeeAttendance;
  canEditSheet: boolean;
}) {
  const todayPct =
    e.todayTargetMinutes > 0
      ? Math.min(100, Math.round((e.todayWorkedMinutes / e.todayTargetMinutes) * 100))
      : 0;
  // Mit Korrektur-Recht → direkt zum SAP-Stundenblatt. Sonst → bestehende
  // Filter-Liste der Zeitbuchungen.
  const href = canEditSheet
    ? `/admin/attendance/${e.id}/sheet`
    : `/admin/time-entries?employeeId=${e.id}`;

  return (
    <li>
      <Link
        href={href}
        className="grid grid-cols-1 items-center gap-3 px-5 py-3 hover:bg-habb-paper/50 md:grid-cols-[1.5fr_1fr_1fr_1fr]"
      >
        {/* Spalte 1: Name + Status */}
        <div>
          <div className="font-medium text-habb-ink">
            {e.firstName} {e.lastName}
            <span className="ml-2 text-xs text-habb-muted">#{e.employeeNumber}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-habb-muted">
            <StatusBadge status={e.status} />
            {e.status === "ABSENT" && e.absenceLabel ? (
              <span>
                {e.absenceLabel}
                {e.absenceUntilIso
                  ? ` · bis ${new Date(e.absenceUntilIso).toLocaleDateString("de-CH")}`
                  : ""}
              </span>
            ) : e.statusSinceIso ? (
              <span>
                seit{" "}
                {new Date(e.statusSinceIso).toLocaleTimeString("de-CH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
        </div>

        {/* Spalte 2: Heute Ist / Soll */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-habb-muted">
            Heute
          </div>
          <div className="font-semibold tabular-nums">
            {formatHmm(e.todayWorkedMinutes)}{" "}
            <span className="text-xs font-normal text-habb-muted">
              / {formatHmm(e.todayTargetMinutes)}
            </span>
          </div>
          {e.todayTargetMinutes > 0 && (
            <div className="mt-1 h-1 w-32 max-w-full overflow-hidden rounded-full bg-habb-line">
              <div
                className="h-full bg-habb-success"
                style={{ width: `${todayPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Spalte 3: Woche Ist / Soll */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-habb-muted">
            Diese Woche
          </div>
          <div className="font-semibold tabular-nums">
            {formatHmm(e.weekWorkedMinutes)}{" "}
            <span className="text-xs font-normal text-habb-muted">
              / {formatHmm(e.weekTargetMinutes)}
            </span>
          </div>
        </div>

        {/* Spalte 4: Wochen-Saldo */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-habb-muted">
            Saldo
          </div>
          <div
            className={
              "font-semibold tabular-nums " +
              (e.weekBalanceMinutes > 0
                ? "text-habb-success"
                : e.weekBalanceMinutes < 0
                  ? "text-habb-red"
                  : "text-habb-black")
            }
          >
            {formatHmmSigned(e.weekBalanceMinutes)}
          </div>
        </div>
      </Link>
    </li>
  );
}

// ─────────────────────────────────────────
// Formatierung
// ─────────────────────────────────────────

function formatHmm(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, "0")}`;
}

function formatHmmSigned(minutes: number): string {
  if (minutes === 0) return "±0:00";
  const sign = minutes > 0 ? "+" : "−";
  return `${sign}${formatHmm(minutes)}`;
}
