"use client";

// Mobile-first Scan UI. Shows step master data, current state, and
// the currently allowed actions — worker enters action + PIN.
//
// Polling: every 5s `getStepStatus` is fetched, so the worker immediately
// sees when someone else has started/stopped (live-linked).

import { useEffect, useState, useTransition } from "react";
import { Play, Pause, Square, RotateCw, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getStepStatus, recordStepScan } from "./actions";
import { processLabel, machineLabel, materialLabel } from "@/lib/order/labels";
import type { ProcessStepEventType } from "@prisma/client";
import type { ScanState } from "@/lib/order/step-time";

type Status = Awaited<ReturnType<typeof getStepStatus>>;

const STATE_LABEL: Record<ScanState, string> = {
  NOT_STARTED: "Ready to Start",
  RUNNING:     "Running",
  PAUSED:      "Paused",
  DONE:        "Done",
};

const STATE_COLOR: Record<ScanState, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700 border-slate-300",
  RUNNING:     "bg-emerald-100 text-emerald-800 border-emerald-300",
  PAUSED:      "bg-amber-100 text-amber-800 border-amber-300",
  DONE:        "bg-blue-100 text-blue-800 border-blue-300",
};

const POLL_INTERVAL_MS = 5_000;

function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fmtMinutes(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const EVENT_LABEL: Record<ProcessStepEventType, string> = {
  START:  "Started",
  PAUSE:  "Paused",
  RESUME: "Resumed",
  END:    "Ended",
};

export function ScanClient({
  stepId,
  initial,
}: {
  stepId: string;
  initial: Status;
}) {
  const [status, setStatus] = useState<Status>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // PIN-Form-State
  const [pendingAction, setPendingAction] = useState<ProcessStepEventType | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("scan.employeeNumber") ?? "";
  });
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");

  // Polling — refresh every 5s
  useEffect(() => {
    const handle = setInterval(async () => {
      try {
        const fresh = await getStepStatus(stepId);
        setStatus(fresh);
      } catch {
        // Network glitch — retry on next tick.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [stepId]);

  // Local live display for running steps: re-render every second so the
  // stopwatch keeps running without hitting the server.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (status.scanState !== "RUNNING") return;
    const handle = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(handle);
  }, [status.scanState]);

  const liveMinutes = computeLiveMinutes(status, tick);

  const submitAction = () => {
    if (!pendingAction) return;
    if (!employeeNumber.trim()) {
      setError("Please enter employee number.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be 4 digits.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        await recordStepScan({
          stepId,
          employeeNumber: employeeNumber.trim(),
          pin,
          action: pendingAction,
          note,
        });
        // Persist employee number locally so it's pre-filled on next scan.
        localStorage.setItem("scan.employeeNumber", employeeNumber.trim());
        setSuccess(`"${EVENT_LABEL[pendingAction]}" recorded.`);
        setPin("");
        setNote("");
        setPendingAction(null);
        // Reload immediately
        const fresh = await getStepStatus(stepId);
        setStatus(fresh);
        setTimeout(() => setSuccess(null), 4_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error recording action.");
        setPin("");
      }
    });
  };

  const cancelForm = () => {
    setPendingAction(null);
    setPin("");
    setNote("");
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Order Header ── */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-mono text-lg font-semibold">
              {status.order.orderNumber}
            </div>
            {status.order.priority === "EXPRESS" && (
              <Badge variant="destructive">Express</Badge>
            )}
            {status.order.priority === "HIGH" && (
              <Badge variant="warning">High</Badge>
            )}
          </div>
          <div className="text-sm font-medium">{status.order.customerDisplayName}</div>
          <div className="text-xs text-muted-foreground">
            Delivery date: {fmtDateTime(status.order.promisedAt)}
          </div>
        </CardContent>
      </Card>

      {/* ── Step Header ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-xs text-muted-foreground">
              Pos. {status.item.position} · {status.item.description}
            </div>
            <div className="text-lg font-semibold mt-1">
              {processLabel(status.step.processCode)}
            </div>
            <div className="text-xs text-muted-foreground">
              Step {status.step.sequence} ·{" "}
              {machineLabel(status.step.machineTypeRequired)} ·{" "}
              {materialLabel(status.item.material)}
              {status.item.colorCode && ` · ${status.item.colorCode}`} ·{" "}
              {status.item.surfaceM2} m² · {status.item.quantity}×
            </div>
          </div>

          {/* State-Badge */}
          <div
            className={`rounded-lg border px-3 py-2 text-center font-semibold ${STATE_COLOR[status.scanState]}`}
          >
            {STATE_LABEL[status.scanState]}
          </div>

          {/* Stopwatch / Time display */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">Estimated</div>
              <div className="font-semibold tabular-nums">
                {fmtMinutes(status.step.estimatedMinutes)}
              </div>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">
                {status.scanState === "DONE" ? "Final" : "So far"}
              </div>
              <div className="font-semibold tabular-nums flex items-center gap-1">
                {status.scanState === "RUNNING" && (
                  <Clock className="h-3 w-3 text-emerald-600 animate-pulse" />
                )}
                {fmtMinutes(liveMinutes)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Success/Error Messages ── */}
      {success && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}

      {/* ── Actions / PIN Form ── */}
      {!pendingAction ? (
        <ActionButtons
          state={status.scanState}
          onPick={(a) => {
            setError(null);
            setSuccess(null);
            setPendingAction(a);
          }}
          disabled={pending}
        />
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">
              Confirm action:{" "}
              <span className="text-primary">
                {EVENT_LABEL[pendingAction]}
              </span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Employee No.</Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 001"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                className="text-lg"
                autoFocus={!employeeNumber}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PIN (4 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-lg tracking-widest"
                autoFocus={!!employeeNumber}
              />
            </div>
            {(pendingAction === "PAUSE" || pendingAction === "END") && (
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    pendingAction === "PAUSE"
                      ? "e.g. lunch break / powder change"
                      : "e.g. finished, inspected"
                  }
                />
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={cancelForm}
                disabled={pending}
              >Cancel</Button>
              <Button
                onClick={submitAction}
                disabled={pending}
                className="flex-1"
              >
                {pending ? "…" : "Confirm"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Event History ── */}
      {status.events.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              History
            </div>
            <ul className="text-sm space-y-1">
              {[...status.events].reverse().map((e) => (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(e.occurredAt)}
                    </span>
                    <span className="font-medium">
                      {EVENT_LABEL[e.eventType]}
                    </span>
                    {e.note && (
                      <span className="text-muted-foreground italic truncate">
                        „{e.note}&ldquo;
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {e.employeeNumber}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function ActionButtons({
  state,
  onPick,
  disabled,
}: {
  state: ScanState;
  onPick: (a: ProcessStepEventType) => void;
  disabled: boolean;
}) {
  if (state === "DONE") {
    return (
      <div className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
        Step is complete. No further scans possible.
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {state === "NOT_STARTED" && (
        <Button
          size="lg"
          className="h-16 text-lg bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onPick("START")}
          disabled={disabled}
        >
          <Play className="h-6 w-6 mr-2" /> Start
        </Button>
      )}
      {state === "RUNNING" && (
        <>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-lg border-2 border-amber-400 text-amber-700"
            onClick={() => onPick("PAUSE")}
            disabled={disabled}
          >
            <Pause className="h-5 w-5 mr-2" /> Pause
          </Button>
          <Button
            size="lg"
            className="h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onPick("END")}
            disabled={disabled}
          >
            <Square className="h-5 w-5 mr-2" /> End
          </Button>
        </>
      )}
      {state === "PAUSED" && (
        <>
          <Button
            size="lg"
            className="h-16 text-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onPick("RESUME")}
            disabled={disabled}
          >
            <RotateCw className="h-6 w-6 mr-2" /> Resume
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-lg border-2 border-blue-400 text-blue-700"
            onClick={() => onPick("END")}
            disabled={disabled}
          >
            <Square className="h-5 w-5 mr-2" /> End
          </Button>
        </>
      )}
    </div>
  );
}

function computeLiveMinutes(status: Status, _tick: number): number {
  // tick wird als Re-Render-Trigger gebraucht, sonst nicht.
  void _tick;
  const events = status.events.map((e) => ({
    eventType: e.eventType,
    occurredAt: typeof e.occurredAt === "string" ? new Date(e.occurredAt) : e.occurredAt,
  }));
  // Same logic as `calcActualMinutes` — inline portiert weil wir hier keinen
  // Server-Aufruf machen wollen.
  let totalMs = 0;
  let runningSince: Date | null = null;
  let state: ScanState = "NOT_STARTED";
  for (const ev of events) {
    const next = applyEvent(state, ev.eventType);
    if (state === "RUNNING" && (next === "PAUSED" || next === "DONE")) {
      if (runningSince) {
        totalMs += ev.occurredAt.getTime() - runningSince.getTime();
        runningSince = null;
      }
    }
    if ((state === "NOT_STARTED" || state === "PAUSED") && next === "RUNNING") {
      runningSince = ev.occurredAt;
    }
    state = next;
  }
  if (state === "RUNNING" && runningSince) {
    totalMs += Date.now() - runningSince.getTime();
  }
  return Math.round(totalMs / 60_000);
}

function applyEvent(state: ScanState, ev: ProcessStepEventType): ScanState {
  if (ev === "START" && state === "NOT_STARTED") return "RUNNING";
  if (ev === "PAUSE" && state === "RUNNING") return "PAUSED";
  if (ev === "RESUME" && state === "PAUSED") return "RUNNING";
  if (ev === "END" && (state === "RUNNING" || state === "PAUSED")) return "DONE";
  return state;
}
