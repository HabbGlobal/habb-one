"use client";

// Haupt-Client für das Stundenblatt. SAP-ähnliches Layout:
//   Header → Tabs → Wochen-Progress → 2-Spalten (Kalender + Tageliste)
//
// Edit-Mode wird oben rechts mit „Zeiten erfassen / bearbeiten"
// umgeschaltet. Im Edit-Mode bekommt jeder bearbeitbare Tag einen
// kleinen Stift; Klick öffnet den Day-Editor.
//
// Live-Lock: wenn der Mitarbeiter aktuell OPEN/ON_BREAK ist, zeigt
// ein durchgängiger Banner oben + heute kein Edit-Button für den
// LIVE-Tag, bis er ausgestempelt wurde.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Activity,
  Coffee,
  PartyPopper,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveLockBanner } from "./LiveLockBanner";
import { DayEditor } from "./DayEditor";

export interface DayPayload {
  date: string;
  weekday: string;
  targetMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  balanceMinutes: number;
  isOpen: boolean;
  isOnBreak: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  absenceLabel: string | null;
  absence: {
    id: string;
    typeId: string;
    labelDe: string;
    colorHex: string;
    halfDay: boolean;
    isMultiDay: boolean;
  } | null;
  punches: Array<{
    id: string;
    type: string;
    occurredAtIso: string;
    occurredAtLocal: string;
    source: string;
    isHomeOffice: boolean;
  }>;
  breaks: Array<{
    id: string;
    startedAtIso: string;
    startedAtLocal: string;
    endedAtIso: string | null;
    endedAtLocal: string | null;
  }>;
}

interface Props {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    employmentType: string;
    workloadPercent: number | null;
    weeklyTargetHours: number | null;
  };
  year: number;
  month: number;
  days: DayPayload[];
  liveStatus: string;
  liveSinceIso: string | null;
  weekTotals: { target: number; worked: number };
  canCorrect: boolean;
  absenceTypes: Array<{
    id: string;
    labelDe: string;
    colorHex: string;
    requiresApproval: boolean;
  }>;
}

const WEEKDAY_LABELS_DE: Record<string, string> = {
  MON: "Montag",
  TUE: "Dienstag",
  WED: "Mittwoch",
  THU: "Donnerstag",
  FRI: "Freitag",
  SAT: "Samstag",
  SUN: "Sonntag",
};

const MONTH_LABELS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function formatHmm(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, "0")}`;
}

function formatDateDe(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${WEEKDAY_LABELS_DE[weekdayFromDate(y, m, d)]}, ${d}. ${MONTH_LABELS_DE[m - 1]} ${y}`;
}

function weekdayFromDate(y: number, m: number, d: number): string {
  const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const)[idx];
}

export function SheetClient({
  employee,
  year,
  month,
  days,
  liveStatus,
  liveSinceIso,
  weekTotals,
  canCorrect,
  absenceTypes,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);

  const isLive = liveStatus === "OPEN" || liveStatus === "ON_BREAK";
  const todayIso = new Date().toISOString().slice(0, 10);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const targetPct =
    weekTotals.target > 0
      ? Math.min(100, Math.round((weekTotals.worked / weekTotals.target) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-habb-line pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-habb-ink">
              {employee.firstName} {employee.lastName}
            </h1>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-habb-success/10 px-2 py-0.5 text-xs font-semibold text-habb-success">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-habb-success" />
                {liveStatus === "ON_BREAK" ? "In Pause" : "Eingestempelt"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-habb-muted">
            #{employee.employeeNumber} ·{" "}
            {employee.employmentType === "MONTHLY_SALARY" ? "Monatslohn" : "Stundenlohn"}
            {employee.workloadPercent ? ` · ${employee.workloadPercent}%` : ""}
            {employee.weeklyTargetHours
              ? ` · ${employee.weeklyTargetHours} h / Woche`
              : ""}
          </p>
        </div>

        {canCorrect && (
          <Button
            variant={editMode ? "default" : "outline"}
            onClick={() => setEditMode(!editMode)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {editMode ? "Bearbeitung beenden" : "Zeiten erfassen / bearbeiten"}
          </Button>
        )}
      </header>

      {/* Tab-Strip (Platzhalter — Leistungen + Zeitkonten kommen später) */}
      <nav className="border-b border-habb-line">
        <ul className="-mb-px flex gap-1">
          <li>
            <span className="inline-block border-b-2 border-habb-red px-3 py-2 text-sm font-medium text-habb-ink">
              Zeiterfassung
            </span>
          </li>
          <li>
            <span className="inline-block px-3 py-2 text-sm text-habb-muted">
              Leistungen <span className="ml-1 text-[10px] opacity-60">(bald)</span>
            </span>
          </li>
          <li>
            <span className="inline-block px-3 py-2 text-sm text-habb-muted">
              Zeitkonten <span className="ml-1 text-[10px] opacity-60">(bald)</span>
            </span>
          </li>
        </ul>
      </nav>

      {/* Live-Lock-Banner */}
      {isLive && canCorrect && (
        <LiveLockBanner
          employeeId={employee.id}
          employeeName={`${employee.firstName} ${employee.lastName}`}
          status={liveStatus as "OPEN" | "ON_BREAK"}
          sinceIso={liveSinceIso}
          onCleared={() => {
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Wochen-Progress */}
      <section className="rounded-lg border border-habb-line bg-white px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-habb-muted">
            Woche · Erfasste Zeit / Sollzeit
          </p>
          <p className="text-sm font-semibold tabular-nums text-habb-ink">
            {formatHmm(weekTotals.worked)} / {formatHmm(weekTotals.target)} h
          </p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-habb-paper">
          <div
            className="h-full bg-habb-success transition-all"
            style={{ width: `${targetPct}%` }}
          />
        </div>
      </section>

      {/* Zwei-Spalten-Layout: Kalender links, Tageliste rechts */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── Kalender ─────────────────────────── */}
        <aside>
          <div className="rounded-lg border border-habb-line bg-white p-4">
            <div className="flex items-center justify-between">
              <Link
                href={`/admin/attendance/${employee.id}/sheet?y=${prevYear}&m=${prevMonth}`}
                aria-label="Voriger Monat"
                className="rounded p-1 text-habb-muted hover:bg-habb-paper hover:text-habb-ink"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <p className="text-sm font-semibold text-habb-ink">
                {MONTH_LABELS_DE[month - 1]} {year}
              </p>
              <Link
                href={`/admin/attendance/${employee.id}/sheet?y=${nextYear}&m=${nextMonth}`}
                aria-label="Nächster Monat"
                className="rounded p-1 text-habb-muted hover:bg-habb-paper hover:text-habb-ink"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <Calendar
              year={year}
              month={month}
              days={days}
              todayIso={todayIso}
            />

            <Legend />
          </div>
        </aside>

        {/* ── Tageliste ────────────────────────── */}
        <section className="space-y-4">
          {days.map((d) => (
            <DayRow
              key={d.date}
              day={d}
              employeeId={employee.id}
              isToday={d.date === todayIso}
              editMode={editMode && canCorrect}
              isLiveBlocked={isLive && d.date === todayIso}
              onEdit={() => setEditingDay(d.date)}
            />
          ))}
        </section>
      </div>

      {/* Day-Editor */}
      {editingDay && (
        <DayEditor
          employeeId={employee.id}
          day={days.find((d) => d.date === editingDay)!}
          absenceTypes={absenceTypes}
          open={!!editingDay}
          onClose={() => setEditingDay(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Kalender-Grid
// ─────────────────────────────────────────

function Calendar({
  year,
  month,
  days,
  todayIso,
}: {
  year: number;
  month: number;
  days: DayPayload[];
  todayIso: string;
}) {
  // Erster Tag des Monats — auf welchem Wochentag liegt er?
  const firstDay = new Date(year, month - 1, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mo=0
  const dayMap = new Map(days.map((d) => [d.date, d]));
  const totalDays = new Date(year, month, 0).getDate();

  const cells: Array<{ date: string | null; day: DayPayload | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${month.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
    cells.push({ date: dateStr, day: dayMap.get(dateStr) ?? null });
  }

  return (
    <div className="mt-3 grid grid-cols-7 gap-0.5 text-xs">
      {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
        <div key={w} className="text-center font-medium text-habb-muted">
          {w}
        </div>
      ))}
      {cells.map((c, i) => {
        if (!c.date || !c.day) {
          return <div key={i} className="h-7" />;
        }
        const isToday = c.date === todayIso;
        const hasWork = c.day.workedMinutes > 0;
        const hasTarget = c.day.targetMinutes > 0;
        const absence = c.day.absence;
        const isHoliday = c.day.isHoliday;
        const isLive = c.day.isOpen || c.day.isOnBreak;
        const dayNum = c.date.slice(-2).replace(/^0/, "");

        // Abwesenheit → Tag in der Typ-Farbe (mit Alpha). Sonst Klassen.
        let bg = "bg-white";
        let inlineStyle: React.CSSProperties | undefined;
        if (isLive) bg = "bg-habb-success/20";
        else if (absence) {
          bg = "";
          inlineStyle = { backgroundColor: `${absence.colorHex}22` };
        } else if (isHoliday) bg = "bg-blue-100";
        else if (hasWork) bg = "bg-habb-success/10";
        else if (hasTarget) bg = "bg-amber-100"; // Arbeitstag ohne Erfassung = Lücke

        return (
          <div
            key={c.date}
            style={inlineStyle}
            className={`flex h-7 items-center justify-center rounded text-[11px] tabular-nums ${bg} ${
              isToday ? "ring-2 ring-habb-red" : ""
            } text-habb-ink`}
            title={absence ? `${c.date} · ${absence.labelDe}` : c.date}
          >
            {dayNum}
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-3 space-y-1 text-[10px] text-habb-muted">
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-habb-red" /> Heute
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-habb-success/10" /> Zeiten erfasst
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-amber-100" /> Soll ohne Erfassung
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-habb-red/10" /> Abwesenheit
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-blue-100" /> Feiertag
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-habb-success/20" /> Aktuell live
      </li>
    </ul>
  );
}

// ─────────────────────────────────────────
// Day-Row (rechte Spalte)
// ─────────────────────────────────────────

function DayRow({
  day,
  isToday,
  editMode,
  isLiveBlocked,
  onEdit,
}: {
  day: DayPayload;
  employeeId: string;
  isToday: boolean;
  editMode: boolean;
  isLiveBlocked: boolean;
  onEdit: () => void;
}) {
  // Blöcke (Arbeitsphasen aus Punches + Pausen aus Breaks) zur Anzeige sortieren.
  // Home-Office-Spannen werden anhand des CLOCK_IN-Flags unterschieden.
  const workBlocks: Array<{
    start: string;
    end: string | null;
    minutes: number;
    homeOffice: boolean;
  }> = [];
  let currentIn: { start: string; iso: string; homeOffice: boolean } | null = null;
  for (const p of day.punches) {
    if (p.type === "CLOCK_IN") {
      currentIn = {
        start: p.occurredAtLocal,
        iso: p.occurredAtIso,
        homeOffice: p.isHomeOffice,
      };
    } else if (p.type === "CLOCK_OUT" && currentIn) {
      const m = Math.round(
        (new Date(p.occurredAtIso).getTime() - new Date(currentIn.iso).getTime()) / 60000,
      );
      workBlocks.push({
        start: currentIn.start,
        end: p.occurredAtLocal,
        minutes: m,
        homeOffice: currentIn.homeOffice,
      });
      currentIn = null;
    }
  }
  if (currentIn) {
    workBlocks.push({
      start: currentIn.start,
      end: null,
      minutes: 0,
      homeOffice: currentIn.homeOffice,
    });
  }

  const breakBlocks = day.breaks.map((b) => ({
    start: b.startedAtLocal,
    end: b.endedAtLocal,
    minutes: b.endedAtIso
      ? Math.round(
          (new Date(b.endedAtIso).getTime() - new Date(b.startedAtIso).getTime()) / 60000,
        )
      : 0,
  }));

  return (
    <article
      className={`rounded-lg border ${
        isToday ? "border-habb-red/40" : "border-habb-line"
      } bg-white`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-habb-line px-4 py-2">
        <h3 className="text-sm font-semibold text-habb-ink">{formatDateDe(day.date)}</h3>
        <div className="text-xs tabular-nums text-habb-muted">
          {formatHmm(day.workedMinutes)} / {formatHmm(day.targetMinutes)} h
          {day.balanceMinutes !== 0 && (
            <span
              className={`ml-2 ${
                day.balanceMinutes > 0 ? "text-habb-success" : "text-habb-red"
              }`}
            >
              {day.balanceMinutes > 0 ? "+" : "−"}
              {formatHmm(day.balanceMinutes)}
            </span>
          )}
        </div>
      </header>

      <div className="divide-y divide-habb-line">
        {day.isHoliday && (
          <Row label="Feiertag" badge={<PartyPopper className="h-3.5 w-3.5" />} note={day.holidayName} />
        )}
        {day.absence && (
          <Row
            label={day.absence.labelDe}
            badge={
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: day.absence.colorHex }}
              />
            }
            note={
              (day.absence.halfDay ? "Halber Tag" : "Abwesenheit") +
              (day.absence.isMultiDay ? " · mehrtägig" : "")
            }
          />
        )}
        {workBlocks.map((b, i) => (
          <Row
            key={`w${i}`}
            label={b.homeOffice ? "Home Office" : "Arbeitszeit"}
            badge={b.homeOffice ? <Home className="h-3.5 w-3.5 text-habb-ink" /> : undefined}
            start={b.start}
            end={b.end ?? "—"}
            minutes={b.minutes}
            live={b.end === null}
          />
        ))}
        {breakBlocks.map((b, i) => (
          <Row
            key={`b${i}`}
            label="Pause"
            badge={<Coffee className="h-3.5 w-3.5" />}
            start={b.start}
            end={b.end ?? "—"}
            minutes={b.minutes}
            live={b.end === null}
          />
        ))}
        {workBlocks.length === 0 && breakBlocks.length === 0 && !day.absenceLabel && !day.isHoliday && (
          <p className="px-4 py-2 text-xs text-habb-muted">Keine Zeiten erfasst.</p>
        )}
      </div>

      {editMode && (
        <footer className="border-t border-habb-line px-4 py-2 text-right">
          {isLiveBlocked ? (
            <span className="text-xs text-habb-warning">
              <Activity className="mr-1 inline h-3 w-3 animate-pulse" />
              Live aktiv — bitte oben zuerst ausstempeln
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Tag bearbeiten
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}

function Row({
  label,
  badge,
  start,
  end,
  minutes,
  note,
  live,
}: {
  label: string;
  badge?: React.ReactNode;
  start?: string;
  end?: string;
  minutes?: number;
  note?: string | null;
  live?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 px-4 py-2 md:grid-cols-[1fr_120px_120px_80px]">
      <div className="flex items-center gap-2 text-sm">
        {badge}
        <span className="text-habb-ink">{label}</span>
        {note && <span className="text-xs text-habb-muted">· {note}</span>}
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full bg-habb-success/10 px-1.5 text-[10px] font-semibold text-habb-success">
            <span className="h-1 w-1 animate-pulse rounded-full bg-habb-success" />
            live
          </span>
        )}
      </div>
      <div className="text-sm tabular-nums text-habb-muted">{start ?? ""}</div>
      <div className="text-sm tabular-nums text-habb-muted">{end ?? ""}</div>
      <div className="text-right text-sm tabular-nums text-habb-ink">
        {typeof minutes === "number" ? `${formatHmm(minutes)} h` : ""}
      </div>
    </div>
  );
}
