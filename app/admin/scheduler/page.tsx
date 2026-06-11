// Werkstatt-Wochenplaner.
//
// Layout:
//   - Toolbar mit Wochennavigation, "Alle Aufträge planen"-Button, Konflikt-Counter
//   - Grid: 1 Zeile pro Maschine, 5 Spalten Mo-Fr (oder 7 inkl. Sa/So bei Sonderfällen)
//   - Jede Zelle zeigt die Schedule-Entries dieses Tages auf dieser Maschine
//   - Klick auf Eintrag → öffnet zugehörigen Auftrag
//
// Read-only — Drag & Drop / manuelles Verschieben kommt in Phase 4.5.

import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { ZONE } from "@/lib/time/zone";
import { machineLabel } from "@/lib/order/labels";
import { customerDisplayName } from "@/lib/dto/customer";
import { ScheduleAllButton } from "./ScheduleAllButton";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function startOfWeekZurich(d: Date): Date {
  // Montag der Woche von d in Europe/Zurich
  const dateStr = formatInTimeZone(d, ZONE, "yyyy-MM-dd");
  const local = fromZonedTime(`${dateStr}T00:00:00`, ZONE);
  // getDay liefert in der Browser-/Server-TZ; wir brauchen Zurich-Wochentag
  const wdLocal = formatInTimeZone(local, ZONE, "i"); // 1..7 (Mo..So)
  const offset = (parseInt(wdLocal, 10) - 1);
  const monday = new Date(local.getTime() - offset * 86_400_000);
  return monday;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function fmtTime(d: Date): string {
  return formatInTimeZone(d, ZONE, "HH:mm");
}

function fmtDate(d: Date): string {
  return formatInTimeZone(d, ZONE, "dd.MM.");
}

function isoDate(d: Date): string {
  return formatInTimeZone(d, ZONE, "yyyy-MM-dd");
}

/** Stabiles Farbpaar (BG + Border) pro Auftragsnummer. */
function colorForOrder(orderNumber: string): { bg: string; border: string; text: string } {
  let h = 0;
  for (let i = 0; i < orderNumber.length; i++) {
    h = (h * 31 + orderNumber.charCodeAt(i)) >>> 0;
  }
  const palette = [
    // Block-Palette für Gantt-Bereiche: bewusst differenzierende Farben pro
    // Auftrag (hash-basiert). HABB-Akzentrot bleibt reserved für aktive
    // Zustände/Warnungen, deshalb nutzen die Blöcke hier eine neutrale
    // Differenzialpalette.
    { bg: "bg-habb-paper", border: "border-habb-line", text: "text-habb-ink" },
    { bg: "bg-emerald-100", border: "border-emerald-400", text: "text-emerald-900" },
    { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-900" },
    { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-900" },
    { bg: "bg-pink-100", border: "border-pink-400", text: "text-pink-900" },
    { bg: "bg-cyan-100", border: "border-cyan-400", text: "text-cyan-900" },
    { bg: "bg-orange-100", border: "border-orange-400", text: "text-orange-900" },
  ];
  return palette[h % palette.length];
}

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "schedule.read")) redirect("/admin");

  const sp = await searchParams;
  // Bezugswoche aus ?week=YYYY-MM-DD; Default = aktuelle Woche
  const referenceDate = sp.week ? new Date(`${sp.week}T12:00:00.000Z`) : new Date();
  const monday = startOfWeekZurich(referenceDate);
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(monday, i)); // Mo-Fr
  const weekStart = monday;
  const weekEnd = addDays(monday, 5); // exklusiv: Sa 00:00

  // Maschinen
  const machines = await prisma.machine.findMany({
    where: {
      companyId: session.user.companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: { name: "asc" },
  });

  // Schedule-Einträge dieser Woche
  const entries = await prisma.orderScheduleEntry.findMany({
    where: {
      order: { companyId: session.user.companyId },
      plannedStart: { gte: weekStart, lt: weekEnd },
    },
    include: {
      order: {
        include: {
          customer: { include: { contacts: true } },
        },
      },
      processStep: { select: { processCode: true, sequence: true } },
      conflicts: { where: { resolvedAt: null } },
    },
  });

  // Konflikte global zählen (auch außerhalb dieser Woche)
  const conflictCount = await prisma.scheduleConflict.count({
    where: {
      entry: { order: { companyId: session.user.companyId } },
      resolvedAt: null,
    },
  });

  // Pro Maschine + Tag gruppieren
  type CellEntry = (typeof entries)[number];
  const grid: Map<string, Map<string, CellEntry[]>> = new Map();
  for (const m of machines) {
    grid.set(m.id, new Map());
  }
  for (const e of entries) {
    if (!e.machineId) continue;
    const dayKey = isoDate(e.plannedStart);
    const machineMap = grid.get(e.machineId);
    if (!machineMap) continue;
    const list = machineMap.get(dayKey) ?? [];
    list.push(e);
    machineMap.set(dayKey, list);
  }

  // Stunden pro Zelle, pro Maschine-Wochensumme, pro Tag-Spalte und Total
  function minutesOf(e: CellEntry): number {
    return Math.max(0, Math.round((e.plannedEnd.getTime() - e.plannedStart.getTime()) / 60_000));
  }
  function fmtHours(min: number): string {
    if (min === 0) return "—";
    const h = min / 60;
    return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  }
  const cellMinutes = new Map<string, number>(); // key = `${machineId}|${dayKey}`
  const machineWeekTotals = new Map<string, number>(); // machineId → minutes
  const dayTotals = new Map<string, number>(); // dayKey → minutes
  let weekGrandTotal = 0;
  for (const m of machines) {
    let mTotal = 0;
    for (const d of weekDays) {
      const key = isoDate(d);
      const cell = grid.get(m.id)?.get(key) ?? [];
      const min = cell.reduce((sum, e) => sum + minutesOf(e), 0);
      cellMinutes.set(`${m.id}|${key}`, min);
      mTotal += min;
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + min);
    }
    machineWeekTotals.set(m.id, mTotal);
    weekGrandTotal += mTotal;
  }

  // Werkstatt-Verfügbarkeit pro Tag = Standard 8h × 5 Tage = 40h. Wir
  // berechnen Auslastung relativ dazu, damit der User auf einen Blick
  // sieht ob eine Maschine über/unterausgelastet ist.
  const STANDARD_HOURS_PER_DAY = 8;
  function utilizationClass(min: number): string {
    if (min === 0) return "text-muted-foreground";
    const pct = min / 60 / STANDARD_HOURS_PER_DAY;
    if (pct >= 1.0) return "text-rose-700 font-semibold"; // ≥100% — voll/über
    if (pct >= 0.7) return "text-amber-700 font-medium";  // ≥70% — gut belegt
    return "text-emerald-700";                              // <70% — Luft
  }

  // Manuelle (machineId=null) Schritte separat anzeigen
  const manualEntries = entries.filter((e) => !e.machineId);

  // Wochennavigation-URLs
  const prevWeek = isoDate(addDays(monday, -7));
  const nextWeek = isoDate(addDays(monday, 7));
  const today = isoDate(new Date());

  const canWrite = hasPermission(session.user.role, "schedule.write");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" /> Werkstatt-Plan
          </h1>
          <p className="text-sm text-muted-foreground">
            Woche {fmtDate(monday)} – {fmtDate(addDays(monday, 4))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/scheduler?week=${prevWeek}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/scheduler?week=${today}`}>Heute</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/scheduler?week=${nextWeek}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          {canWrite && <ScheduleAllButton />}
        </div>
      </div>

      {/* Konflikt-Banner */}
      {conflictCount > 0 && (
        <div className="rounded-lg border-2 border-destructive/50 bg-destructive/5 px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <strong className="text-destructive">{conflictCount}</strong>
          {conflictCount === 1 ? " Konflikt" : " Konflikte"} aktiv —
          Lieferterminen prüfen und Aufträge ggf. neu planen.
        </div>
      )}

      {/* Grid */}
      {machines.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            Keine Maschinen erfasst. In den Einstellungen Maschinen anlegen.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-3 py-2 w-44 font-medium">Maschine</th>
                  {weekDays.map((d, i) => (
                    <th
                      key={isoDate(d)}
                      className={
                        "text-left px-2 py-2 font-medium " +
                        (isoDate(d) === today ? "bg-habb-paper" : "")
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {WEEKDAY_LABELS[i]}
                      </div>
                      <div className="tabular-nums">{fmtDate(d)}</div>
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium border-l-2 border-habb-line bg-habb-paper w-24">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Σ Woche
                    </div>
                    <div className="text-[10px] text-muted-foreground font-normal">Std.</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => {
                  const weekTotalMin = machineWeekTotals.get(m.id) ?? 0;
                  return (
                    <tr key={m.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {machineLabel(m.type)}
                        </div>
                      </td>
                      {weekDays.map((d) => {
                        const dayKey = isoDate(d);
                        const cellEntries = grid.get(m.id)?.get(dayKey) ?? [];
                        const sorted = [...cellEntries].sort(
                          (a, b) => a.plannedStart.getTime() - b.plannedStart.getTime(),
                        );
                        const cellMin = cellMinutes.get(`${m.id}|${dayKey}`) ?? 0;
                        return (
                          <td key={dayKey} className="px-1 py-1 align-top min-w-[140px]">
                            <div className="space-y-1">
                              {sorted.map((e) => {
                                const c = colorForOrder(e.order.orderNumber);
                                const hasConflict = e.conflicts.length > 0;
                                return (
                                  <Link
                                    key={e.id}
                                    href={`/admin/orders/${e.order.id}`}
                                    className={`block rounded border-l-2 ${c.bg} ${c.border} ${c.text} px-1.5 py-1 hover:shadow-sm transition`}
                                    title={`${e.order.orderNumber} · ${customerDisplayName(e.order.customer)}`}
                                  >
                                    <div className="flex items-baseline justify-between gap-1">
                                      <span className="font-mono tabular-nums text-[10px]">
                                        {fmtTime(e.plannedStart)}–{fmtTime(e.plannedEnd)}
                                      </span>
                                      {e.isLocked && (
                                        <span title="Gesperrt" className="text-[10px]">🔒</span>
                                      )}
                                      {hasConflict && (
                                        <AlertTriangle className="h-3 w-3 text-destructive" />
                                      )}
                                    </div>
                                    <div className="font-medium truncate text-[11px]">
                                      {e.order.orderNumber}
                                    </div>
                                    <div className="truncate text-[10px] opacity-80">
                                      Schritt {e.processStep.sequence} · {e.processStep.processCode}
                                    </div>
                                  </Link>
                                );
                              })}
                              {cellMin > 0 && (
                                <div
                                  className={`text-right text-[10px] tabular-nums pt-0.5 border-t border-habb-line/60 ${utilizationClass(cellMin)}`}
                                  title={`${(cellMin / 60).toFixed(2)} Std. geplant · ${Math.round((cellMin / 60 / STANDARD_HOURS_PER_DAY) * 100)}% Auslastung`}
                                >
                                  {fmtHours(cellMin)}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 align-top text-right border-l-2 border-habb-line bg-habb-paper">
                        <div
                          className={`tabular-nums font-semibold ${utilizationClass(weekTotalMin / 5)}`}
                          title={`${(weekTotalMin / 60).toFixed(2)} Std. in dieser Woche geplant`}
                        >
                          {fmtHours(weekTotalMin)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {weekTotalMin > 0
                            ? `${Math.round((weekTotalMin / 60 / (STANDARD_HOURS_PER_DAY * 5)) * 100)}%`
                            : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-habb-paper border-t-2 border-habb-line">
                <tr>
                  <td className="px-3 py-2 font-medium text-[11px] uppercase tracking-wider text-habb-muted">
                    Σ Tag
                  </td>
                  {weekDays.map((d) => {
                    const dayKey = isoDate(d);
                    const dMin = dayTotals.get(dayKey) ?? 0;
                    return (
                      <td
                        key={dayKey}
                        className={
                          "px-2 py-2 text-right tabular-nums font-semibold " +
                          (isoDate(d) === today ? "bg-habb-line " : "") +
                          utilizationClass(dMin / Math.max(1, machines.length))
                        }
                        title={`${(dMin / 60).toFixed(2)} Std. an diesem Tag, alle Maschinen`}
                      >
                        {fmtHours(dMin)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-bold border-l-2 border-habb-line bg-habb-line">
                    {fmtHours(weekGrandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Auslastungs-Legende */}
      {machines.length > 0 && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Auslastung pro Tag (Basis 8h):</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            &lt;70%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            70–99%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
            ≥100% (voll/über)
          </span>
        </div>
      )}

      {/* Manuelle Schritte (ohne Maschine) */}
      {manualEntries.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-medium mb-2">
              Manuelle Schritte (keine Maschine)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {manualEntries.map((e) => {
                const c = colorForOrder(e.order.orderNumber);
                return (
                  <Link
                    key={e.id}
                    href={`/admin/orders/${e.order.id}`}
                    className={`block rounded border-l-4 ${c.bg} ${c.border} ${c.text} px-3 py-2 hover:shadow-sm transition`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono tabular-nums">
                        {fmtDate(e.plannedStart)} {fmtTime(e.plannedStart)}–{fmtTime(e.plannedEnd)}
                      </span>
                      {e.isLocked && <Badge variant="secondary" className="text-[9px]">🔒</Badge>}
                    </div>
                    <div className="font-medium">
                      {e.order.orderNumber} · {customerDisplayName(e.order.customer)}
                    </div>
                    <div className="opacity-80">
                      Schritt {e.processStep.sequence} · {e.processStep.processCode}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
