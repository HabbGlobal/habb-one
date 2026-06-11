"use client";

// Button "Personal aus Werkstatt-Plan ableiten".
//
// UX-Flow:
//   1. Klick → Modal öffnet, lädt sofort Vorschau (dryRun=true).
//   2. Vorschau zeigt:
//      - Pro Tag pro Bereich: Bedarf vs. zugewiesen
//      - Konflikte (Bereich unterbesetzt, Maschine ohne Bereich, etc.)
//      - Anzahl Einträge die geschrieben werden
//   3. Optionen: Scope (Woche/Monat), "AUTO überschreiben"
//   4. Bestätigen → Schreibvorgang.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserPlus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  derivePersonnelFromWorkshopPlan,
  type DerivePersonnelInput,
} from "./actions";
import type { DeriveResult } from "@/lib/schedule/derive-personnel";

type Scope = "week" | "month";

interface Props {
  /** Anker — entweder weekStart (ISO Mo) oder beliebiger Tag im Monat. */
  anchorDate: string;
  /** Aktive View — Vorbelegung für scope. */
  view: "month" | "week";
  /** Anzeige-Label des aktuellen Bereichs (z. B. "Mai 2026" / "KW 18"). */
  rangeLabel?: string;
}

export function DerivePersonnelButton({ anchorDate, view, rangeLabel }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const [scope, setScope] = useState<Scope>(view === "week" ? "week" : "month");
  const [overwriteAuto, setOverwriteAuto] = useState(false);

  const [preview, setPreview] = useState<(DeriveResult & { written?: number }) | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vorschau live nachladen, wenn der User Bereich oder overwrite ändert.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadingPreview(true);
    let cancelled = false;
    derivePersonnelFromWorkshopPlan({
      scope,
      anchorDate,
      overwriteAuto,
      dryRun: true,
    } satisfies DerivePersonnelInput)
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fehler");
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope, overwriteAuto, anchorDate]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setPreview(null);
    setError(null);
  };

  const confirm = () => {
    if (!preview || preview.assignments.length === 0) return;
    setError(null);
    start(async () => {
      try {
        const r = await derivePersonnelFromWorkshopPlan({
          scope,
          anchorDate,
          overwriteAuto,
          dryRun: false,
        } satisfies DerivePersonnelInput);
        close();
        router.refresh();
        alert(
          `${r.written} Personalplan-Einträge geschrieben${
            r.conflicts.length > 0
              ? ` · ${r.conflicts.length} Konflikt${r.conflicts.length === 1 ? "" : "e"}`
              : ""
          }.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  };

  const totalAssignments = preview?.assignments.length ?? 0;
  const conflicts = preview?.conflicts ?? [];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Aus Werkstatt-Plan
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold">Personal aus Werkstatt-Plan</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Erzeugt automatisch passende Personalplan-Einträge basierend auf
                  den geplanten Aufträgen + Maschinen-Bereichen.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="p-1 rounded hover:bg-habb-paper"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Scope */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Zeitraum {rangeLabel && <span className="normal-case">— {rangeLabel}</span>}
                </label>
                <div className="inline-flex rounded-md border bg-background overflow-hidden w-full">
                  <button
                    type="button"
                    onClick={() => setScope("week")}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm",
                      scope === "week"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    Aktuelle Woche
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("month")}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm border-l",
                      scope === "month"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    Aktueller Monat
                  </button>
                </div>
              </div>

              {/* Optionen */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwriteAuto}
                  onChange={(e) => setOverwriteAuto(e.target.checked)}
                />
                <span>
                  Bereits automatisch geplante Einträge überschreiben
                  <span className="text-muted-foreground text-xs block">
                    Manuelle Einträge bleiben IMMER unangetastet.
                  </span>
                </span>
              </label>

              {/* Vorschau */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Vorschau
                </div>

                {loadingPreview ? (
                  <div className="text-sm text-muted-foreground">Berechne …</div>
                ) : error ? (
                  <div className="text-sm text-destructive rounded-lg border border-destructive bg-destructive/10 px-3 py-2">
                    {error}
                  </div>
                ) : preview == null ? null : (
                  <>
                    {/* Summary-Card */}
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 mb-3",
                        totalAssignments === 0
                          ? "bg-habb-paper border-habb-line"
                          : conflicts.length > 0
                            ? "bg-amber-50 border-amber-200"
                            : "bg-emerald-50 border-emerald-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {totalAssignments === 0 ? null : conflicts.length === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        <strong className="text-sm">
                          {totalAssignments === 0
                            ? "Nichts zu tun — Personalplan ist bereits konsistent."
                            : `${totalAssignments} Personalplan-Einträge werden geschrieben`}
                        </strong>
                      </div>
                      {conflicts.length > 0 && (
                        <div className="text-xs mt-1 text-amber-900">
                          {conflicts.length} Konflikt{conflicts.length === 1 ? "" : "e"} —
                          siehe unten.
                        </div>
                      )}
                    </div>

                    {/* Konflikte */}
                    {conflicts.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                          Konflikte
                        </div>
                        <ul className="space-y-1 text-sm border rounded divide-y max-h-32 overflow-y-auto">
                          {conflicts.map((c, i) => (
                            <li key={i} className="px-3 py-1.5 flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                              <span>{c.message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tages-Aufschlüsselung */}
                    {preview.summaryByDate.length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                          Aufschlüsselung pro Tag
                        </div>
                        <ul className="space-y-1 text-sm border rounded divide-y max-h-64 overflow-y-auto">
                          {preview.summaryByDate.map((d) => (
                            <li key={d.date} className="px-3 py-2">
                              <div className="font-medium text-xs uppercase text-habb-muted">
                                {d.date}
                              </div>
                              <div className="mt-1 space-y-0.5">
                                {d.byArea.map((a) => {
                                  const ok = a.assigned >= a.demand;
                                  return (
                                    <div
                                      key={a.areaId}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span>{a.areaName}</span>
                                      <span
                                        className={cn(
                                          "tabular-nums",
                                          ok
                                            ? "text-emerald-700"
                                            : "text-rose-700 font-medium",
                                        )}
                                      >
                                        {a.assigned} / {a.demand}{" "}
                                        {ok ? "✓" : "⚠"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t bg-habb-paper rounded-b-xl">
              <Button variant="ghost" onClick={close} disabled={pending}>
                Abbrechen
              </Button>
              <Button
                onClick={confirm}
                disabled={pending || loadingPreview || totalAssignments === 0}
              >
                {pending
                  ? "Speichere …"
                  : totalAssignments
                    ? `${totalAssignments} Einträge schreiben`
                    : "Schreiben"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
