"use client";

// Bulk delete for personnel planning.
//
// UX pattern (everything from 1 modal):
//   1. User clicks "Bulk delete" → Modal opens.
//   2. In modal: choose scope (Week/Month) + choose filter (Auto / +Copy / All).
//   3. Once both are chosen: live `countBulkDeletableEntries` call,
//      shows "23 entries will be deleted" incl. breakdown.
//   4. Red button "Delete permanently" — disabled when 0 entries.
//
// This makes it practically impossible to accidentally wipe all manual planning
// — the user ALWAYS sees the count before clicking.

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
  /** Current anchor — either weekStart (ISO Mon) or a day in the month. */
  anchorDate: string;
  /** Active view (only controls the default pre-selection). */
  view: "month" | "week";
  /** Optional: currently active area filter (bulk then only deletes this one). */
  workAreaId?: string | null;
  /** Optional: area name, for the modal. */
  workAreaName?: string | null;
  /** Display label for the current range (e.g. "May 2026" or "CW 18"). */
  rangeLabel?: string;
}

const FILTER_LABELS: Record<Filter, { title: string; subtitle: string; danger: boolean }> = {
  AUTO: {
    title: "Auto-plan only",
    subtitle: "Manually entered entries remain untouched",
    danger: false,
  },
  AUTO_AND_COPIED: {
    title: "Auto + copied from prev. month",
    subtitle: "Everything that was not directly entered by the secretary",
    danger: false,
  },
  ALL: {
    title: "All",
    subtitle: "Including manually entered entries — not reversible!",
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

  // Reload count live when the user changes scope or filter.
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
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
        // Mini feedback (no toast system in the app)
        alert(`${r.deleted} entries deleted.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while deleting.");
      }
    });
  };

  const scopeLabel = scope === "week" ? "Week" : "Month";
  const filterMeta = FILTER_LABELS[filter];

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="mr-2 h-4 w-4" />
        Bulk delete
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
                <h2 className="text-lg font-semibold">Bulk delete</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rangeLabel ?? "Current area"}
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
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Scope selection */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  Period
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
                    Current week
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
                    Current month
                  </button>
                </div>
              </div>

              {/* Filter selection */}
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 block">
                  What should be deleted?
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

              {/* Preview */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Preview
                </div>
                {loadingCount ? (
                  <div className="text-sm text-muted-foreground">
                    Counting entries…
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive">{error}</div>
                ) : count == null ? null : count.total === 0 ? (
                  <div className="text-sm text-muted-foreground rounded-lg border bg-habb-paper px-3 py-2">
                    No entries in the selected range match — nothing to
                    delete.
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
                        {count.total} entries will be deleted
                      </strong>
                      <div className="text-xs mt-0.5 text-habb-ink">
                        in {scopeLabel}
                        {workAreaName && (
                          <>, only area „{workAreaName}&ldquo;</>
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
                  ? "Deleting…"
                  : count?.total
                    ? `Delete ${count.total} entries`
                    : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
