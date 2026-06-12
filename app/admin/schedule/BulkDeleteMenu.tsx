"use client";

// Bulk-Löschen für die Personalplanung.
//
// UX-Pattern (aus 1 Modal alles):
//   1. User klickt "Bulk löschen" → Modal öffnet.
//   2. Im Modal: Bereich wählen (Woche/Monat) + Filter wählen (Auto / +Copy / Alle).
//   3. Sobald beides gewählt ist: live `countBulkDeletableEntries`-Aufruf,
//      zeigt "23 Einträge werden gelöscht" inkl. Aufschlüsselung.
//   4. Roter Button "Endgültig löschen" — disabled wenn 0 Einträge.
//
// Damit ist es praktisch unmöglich, aus Versehen die ganze manuelle Planung
// wegzuwischen — der User sieht IMMER die Anzahl vor dem Klick.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bulkDeleteScheduleEntries,
  countBulkDeletableEntries,
  type BulkDeleteInput,
} from "./actions";

type Scope = "week" | "month";
type Filter = "AUTO" | "AUTO_AND_COPIED" | "ALL";

interface CountResult {
  total: number;
  byEmployee: { employeeId: string; employeeName: string; count: number }[];
}

interface Props {
  /** Aktueller Anker — entweder weekStart (ISO Mo) oder ein Tag im Monat. */
  anchorDate: string;
  /** Aktive View (steuert nur die Default-Vorbelegung). */
  view: "month" | "week";
  /** Optional: aktuell aktiver Bereich-Filter (Bulk löscht dann nur diesen). */
  workAreaId?: string | null;
  /** Optional: Bereich-Name, fürs Modal. */
  workAreaName?: string | null;
  /** Anzeige-Label für den aktuellen Bereich (z. B. "Mai 2026" oder "KW 18"). */
  rangeLabel?: string;
}

const FILTER_LABELS: Record<Filter, { title: string; subtitle: string; danger: boolean }> = {
  AUTO: {
    title: "Nur Auto-Planung",
    subtitle: "Manuell eingegebene Einträge bleiben unangetastet",
    danger: false,
  },
  AUTO_AND_COPIED: {
    title: "Auto + aus Vormonat kopiert",
    subtitle: "Alles, was nicht direkt vom Sekretariat eingegeben wurde",
    danger: false,
  },
  ALL: {
    title: "Alles",
    subtitle: "Auch manuell eingegebene Einträge — nicht widerrufbar!",
    danger: true,
  },
};

export function BulkDeleteMenu({
  anchorDate,
  view,
  workAreaId,
  workAreaName,
  rangeLabel,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const [scope, setScope] = useState<Scope>(view === "week" ? "week" : "month");
  const [filter, setFilter] = useState<Filter>("AUTO");
  const [count, setCount] = useState<CountResult | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anzahl live nachladen, wenn der User Bereich oder Filter ändert.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadingCount(true);
    let cancelled = false;
    countBulkDeletableEntries({
      scope,
      filter,
      anchorDate,
      workAreaId: workAreaId ?? null,
    } satisfies BulkDeleteInput)
      .then((r) => {
        if (!cancelled) setCount(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fehler");
      })
      .finally(() => {
        if (!cancelled) setLoadingCount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope, filter, anchorDate, workAreaId]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setCount(null);
    setError(null);
  };

  const confirm = () => {
    if (!count || count.total === 0) return;
    setError(null);
    start(async () => {
      try {
        const r = await bulkDeleteScheduleEntries({
          scope,
          filter,
          anchorDate,
          workAreaId: workAreaId ?? null,
        } satisfies BulkDeleteInput);
        close();
        router.refresh();
        // Mini-Feedback (kein Toast-System in der App)
        alert(`${r.deleted} Einträge gelöscht.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Löschen.");
      }
    });
  };

  const scopeLabel = scope === "week" ? "Week" : "Month";
  const filterMeta = FILTER_LABELS[filter];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-2 h-4 w-4" />
        Bulk löschen
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold">Bulk löschen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rangeLabel ?? "Aktueller Bereich"}
                  {workAreaName && (
                    <>
                      {" · "}
                      <span className="font-medium">{workAreaName}</span>
                    </>
                  )}
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

            {/* Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Scope selection */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Zeitraum
                </label>
                <div className="inline-flex rounded-md border bg-background overflow-hidden w-full">
                  <button
                    type="button"
                    onClick={() => setScope("week")}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm transition-colors",
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
                      "flex-1 px-3 py-2 text-sm border-l transition-colors",
                      scope === "month"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    Aktueller Monat
                  </button>
                </div>
              </div>

              {/* Filter selection */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Was soll gelöscht werden?
                </label>
                <div className="space-y-2">
                  {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => {
                    const meta = FILTER_LABELS[key];
                    const checked = filter === key;
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          checked
                            ? meta.danger
                              ? "border-rose-300 bg-rose-50"
                              : "border-habb-line bg-habb-paper"
                            : "hover:bg-habb-paper",
                        )}
                      >
                        <input
                          type="radio"
                          name="filter"
                          value={key}
                          checked={checked}
                          onChange={() => setFilter(key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {meta.danger && (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                            )}
                            {meta.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {meta.subtitle}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Vorschau */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Vorschau
                </div>
                {loadingCount ? (
                  <div className="text-sm text-muted-foreground">
                    Zähle Einträge …
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive">{error}</div>
                ) : count == null ? null : count.total === 0 ? (
                  <div className="text-sm text-muted-foreground rounded-lg border bg-habb-paper px-3 py-2">
                    Keine Einträge im gewählten Bereich passen — nichts zu
                    löschen.
                  </div>
                ) : (
                  <>
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 mb-2",
                        filterMeta.danger
                          ? "bg-rose-50 border-rose-200"
                          : "bg-amber-50 border-amber-200",
                      )}
                    >
                      <strong
                        className={
                          filterMeta.danger ? "text-rose-900" : "text-amber-900"
                        }
                      >
                        {count.total} Einträge werden gelöscht
                      </strong>
                      <div className="text-xs mt-0.5 text-habb-ink">
                        im {scopeLabel}
                        {workAreaName && (
                          <>, nur Bereich „{workAreaName}&ldquo;</>
                        )}
                      </div>
                    </div>
                    {count.byEmployee.length > 0 && (
                      <ul className="max-h-40 overflow-y-auto text-sm border rounded divide-y">
                        {count.byEmployee.map((e) => (
                          <li
                            key={e.employeeId}
                            className="flex justify-between px-3 py-1.5"
                          >
                            <span>{e.employeeName}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {e.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-5 border-t bg-habb-paper rounded-b-xl">
              <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={confirm}
                disabled={
                  pending || loadingCount || (count?.total ?? 0) === 0
                }
              >
                {pending
                  ? "Lösche …"
                  : count?.total
                    ? `${count.total} Einträge löschen`
                    : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
