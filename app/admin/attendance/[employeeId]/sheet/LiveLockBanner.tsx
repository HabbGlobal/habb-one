"use client";

// Banner on the sheet page when the employee is currently clocked in
// live. Offers TWO ways to clock out (so the subsequent edit is allowed):
//   1. PIN pad inline → calls /api/admin/employees/[id]/clock-out-via-pin
//   2. Admin override with mandatory reason → server action `forceClockOut`
//
// Once the call succeeds, call `onCleared()` — the parent then reloads
// via router.refresh() and the live status is gone.

import { useState, useTransition } from "react";
import { AlertCircle, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forceClockOut } from "./actions";

interface Props {
  employeeId: string;
  employeeName: string;
  status: "OPEN" | "ON_BREAK";
  sinceIso: string | null;
  onCleared: () => void;
}

type Mode = "menu" | "pin" | "override";

export function LiveLockBanner({
  employeeId,
  employeeName,
  status,
  sinceIso,
  onCleared,
}: Props) {
  const [mode, setMode] = useState<Mode>("menu");
  const [success, setSuccess] = useState<string | null>(null);

  const sinceLabel = sinceIso
    ? new Date(sinceIso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  if (success) {
    return (
      <Card className="border-habb-success/40 bg-habb-success/5">
        <CardContent className="p-4 text-sm text-habb-success">
          {success} — editing of today is now unlocked.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-habb-warning/40 bg-amber-50">
      <CardContent className="space-y-3 p-4 text-sm text-habb-ink">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-habb-warning" />
          <div className="space-y-1">
            <p className="font-semibold">
              {employeeName} is currently {status === "ON_BREAK" ? "on break" : "clocked in"}
              {sinceLabel ? ` since ${sinceLabel}` : ""}.
            </p>
            <p className="text-habb-muted">
              Manual editing of today would damage the running
              time recording. Please clock out regularly first:
            </p>
          </div>
        </div>

        {mode === "menu" && (
          <div className="flex flex-wrap gap-2 pl-8">
            <Button onClick={() => setMode("pin")} size="sm">
              <KeyRound className="mr-1.5 h-4 w-4" />
              Clock out via kiosk PIN
            </Button>
            <Button onClick={() => setMode("override")} size="sm" variant="outline">
              <ShieldAlert className="mr-1.5 h-4 w-4" />
              Admin override (without PIN)
            </Button>
          </div>
        )}

        {mode === "pin" && (
          <PinPad
            employeeId={employeeId}
            onSuccess={() => {
              setSuccess(`${employeeName} was clocked out via PIN`);
              onCleared();
            }}
            onCancel={() => setMode("menu")}
          />
        )}

        {mode === "override" && (
          <OverrideForm
            employeeId={employeeId}
            employeeName={employeeName}
            onSuccess={() => {
              setSuccess(`${employeeName} was clocked out via admin override`);
              onCleared();
            }}
            onCancel={() => setMode("menu")}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// PIN Pad — 4 digits, send-on-complete
// ─────────────────────────────────────────

function PinPad({
  employeeId,
  onSuccess,
  onCancel,
}: {
  employeeId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submitPin = (full: string) => {
    setError(null);
    start(async () => {
      const res = await fetch(
        `/api/admin/employees/${encodeURIComponent(employeeId)}/clock-out-via-pin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: full }),
        },
      );
      if (res.ok) {
        onSuccess();
        return;
      }
      const body = await res.json().catch(() => null);
      const code = body?.error ?? "ERROR";
      setError(translatePinError(code));
      setPin("");
    });
  };

  const tap = (digit: string) => {
    if (pending) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    if (next.length === 4) submitPin(next);
  };

  const del = () => {
    if (pending) return;
    setPin(pin.slice(0, -1));
  };
  const clear = () => {
    if (pending) return;
    setPin("");
    setError(null);
  };

  return (
    <div className="ml-8 space-y-3 rounded-lg border border-habb-line bg-white p-4">
      <p className="text-xs text-habb-muted">
        Employee PIN (4 digits). Verified the same as on the kiosk, then
        clocked out normally.
      </p>

      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-habb-line text-2xl"
          >
            {pin[i] ? "•" : ""}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => tap(d)}
            disabled={pending}
            className="rounded-lg border border-habb-line bg-white py-3 text-xl font-semibold text-habb-ink hover:bg-habb-paper disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={clear}
          disabled={pending}
          className="rounded-lg border border-habb-line bg-white py-3 text-sm text-habb-muted hover:bg-habb-paper disabled:opacity-50"
        >
          C
        </button>
        <button
          onClick={() => tap("0")}
          disabled={pending}
          className="rounded-lg border border-habb-line bg-white py-3 text-xl font-semibold text-habb-ink hover:bg-habb-paper disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={del}
          disabled={pending}
          className="rounded-lg border border-habb-line bg-white py-3 text-sm text-habb-muted hover:bg-habb-paper disabled:opacity-50"
        >
          ⌫
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        {pending && <span className="text-xs text-habb-muted">Checking PIN…</span>}
      </div>
    </div>
  );
}

function translatePinError(code: string): string {
  switch (code) {
    case "INVALID":
      return "Invalid PIN.";
    case "LOCKED":
      return "PIN entry locked (5 min lockout after 5 failed attempts).";
    case "INACTIVE":
      return "Employee is not active.";
    case "NOT_CLOCKED_IN":
      return "Employee is not (anymore) clocked in — reload.";
    case "FORBIDDEN":
      return "No permission.";
    case "UNAUTH":
      return "Session expired — please log in again.";
    case "NOT_FOUND":
      return "Employee not found.";
    default:
      return "Action failed.";
  }
}

// ─────────────────────────────────────────
// Override form with mandatory reason
// ─────────────────────────────────────────

function OverrideForm({
  employeeId,
  employeeName,
  onSuccess,
  onCancel,
}: {
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError("Reason (at least 5 characters) required.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await forceClockOut({ employeeId, reason });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Override failed.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="ml-8 space-y-3 rounded-lg border border-habb-line bg-white p-4"
    >
      <div className="space-y-1">
        <Label htmlFor="override-reason">
          Reason (mandatory — stored in audit log)
        </Label>
        <Input
          id="override-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`e.g. "${employeeName} has already left the premises"`}
          maxLength={500}
          required
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <p className="text-xs text-habb-muted">
        Via admin override the employee will be marked as clocked out
        without requiring a PIN. Your name and the stated reason will appear
        in the audit log. Only use this when the PIN is not at hand.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Clocking out…" : "Clock out now"}
        </Button>
      </div>
    </form>
  );
}