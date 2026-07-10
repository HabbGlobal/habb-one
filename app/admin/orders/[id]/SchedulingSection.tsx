"use client";

// Scheduling section on the order detail page.
//
// Shows:
//   - List of all planned steps with machine + time + lock status
//   - Conflicts (deadline miss, missing machine, ...)
//   - "Reschedule" button (calls scheduleOrder)
//   - "Delete plan" button (clearOrderSchedule)
//   - Lock/Unlock per entry

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Trash2, Lock, Unlock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  scheduleOrder,
  clearOrderSchedule,
  lockScheduleEntry,
  unlockScheduleEntry,
} from "@/app/admin/scheduler/actions";

export interface ScheduledStepDTO {
  entryId: string;
  stepId: string;
  sequence: number;
  processLabel: string;
  machineName: string | null;
  plannedStart: Date | string;
  plannedEnd: Date | string;
  isLocked: boolean;
  conflicts: Array<{ type: string; severity: string; message: string }>;
}

function fmtDateTime(d: Date | string, timezone: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function fmtTime(d: Date | string, timezone: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

const SEVERITY_VARIANT: Record<string, "warning" | "destructive" | "info"> = {
  INFO: "info",
  WARN: "warning",
  ERROR: "destructive",
};

export function SchedulingSection({
  orderId,
  steps,
  canWrite,
  timezone,
}: {
  orderId: string;
  steps: ScheduledStepDTO[];
  canWrite: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onPlan = () => {
    setError(null);
    setFeedback(null);
    start(async () => {
      try {
        const r = await scheduleOrder(orderId);
        setFeedback(
          `${r.proposedCount} steps scheduled${r.conflictCount > 0 ? `, ${r.conflictCount} conflicts` : ""}.`,
        );
        router.refresh();
        setTimeout(() => setFeedback(null), 5_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const onClear = () => {
    if (!confirm("Delete all scheduling for this order (including locked entries)?")) return;
    setError(null);
    start(async () => {
      try {
        await clearOrderSchedule(orderId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const onToggleLock = (entry: ScheduledStepDTO) => {
    setError(null);
    start(async () => {
      try {
        if (entry.isLocked) {
          await unlockScheduleEntry(entry.entryId);
        } else {
          await lockScheduleEntry(entry.entryId);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  // Aggregate conflicts (combine all entries)
  const allConflicts = steps.flatMap((s) =>
    s.conflicts.map((c) => ({ ...c, stepLabel: `Step ${s.sequence}` })),
  );
  // Deduplicate by message — otherwise, conflicts that span
// multiple orders would be repeated for each entry.
  const uniqueConflicts = Array.from(
    new Map(allConflicts.map((c) => [`${c.type}|${c.message}`, c])).values(),
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {steps.length === 0
            ? "Not yet scheduled."
            : `${steps.length} step${steps.length === 1 ? "" : "s"} scheduled.`}
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button onClick={onPlan} size="sm" disabled={pending}>
              <Wand2 className="h-4 w-4 mr-1" />
              {pending ? "Planning …" : steps.length === 0 ? "Plan now" : "Re-plan"}
            </Button>
            {steps.length > 0 && (
              <Button onClick={onClear} variant="outline" size="sm" disabled={pending}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete plan
              </Button>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Conflicts */}
      {uniqueConflicts.length > 0 && (
        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <div className="font-medium text-destructive flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Conflicts
          </div>
          <ul className="mt-1 space-y-1">
            {uniqueConflicts.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant={SEVERITY_VARIANT[c.severity] ?? "warning"} className="text-[10px]">
                  {c.severity}
                </Badge>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Planned Steps */}
      {steps.length > 0 && (
        <div className="rounded-lg border bg-muted/20">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-2 py-1.5 w-12">#</th>
                <th className="text-left px-2 py-1.5">Step</th>
                <th className="text-left px-2 py-1.5">Machine</th>
                <th className="text-left px-2 py-1.5">Day</th>
                <th className="text-left px-2 py-1.5">Time</th>
                <th className="text-right px-2 py-1.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.entryId} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-mono tabular-nums text-muted-foreground">
                    {s.sequence}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{s.processLabel}</td>
                  <td className="px-2 py-1.5">
                    {s.machineName ? (
                      s.machineName
                    ) : (
                      <span className="text-muted-foreground italic">
                        manual
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {fmtDateTime(s.plannedStart, timezone).split(",")[0]}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {fmtTime(s.plannedStart, timezone)}–{fmtTime(s.plannedEnd, timezone)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => onToggleLock(s)}
                        disabled={pending}
                        className="p-1 rounded hover:bg-accent"
                        title={s.isLocked ? "Unlock" : "Lock (auto-plan skips)"}
                      >
                        {s.isLocked ? (
                          <Lock className="h-3 w-3 text-amber-600" />
                        ) : (
                          <Unlock className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
