"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Coffee, Play, CheckCircle2, AlertTriangle } from "lucide-react";

type Status = "IN" | "OUT" | "BREAK";
type Action = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";

interface Labels {
  clockIn: string;
  clockOut: string;
  breakStart: string;
  breakEnd: string;
  doneClockIn: string;
  doneClockOut: string;
  doneBreakStart: string;
  doneBreakEnd: string;
}

export function ActionsPanel({ status, labels }: { status: Status; labels: Labels }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const router = useRouter();

  // Periodic background refresh (every 30 s) so the server-side state stays
  // in sync even if the user does nothing — covers cases like a colleague
  // pausing on another device, or a long pause.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  // Hide the confirmation toast after a few seconds.
  useEffect(() => {
    if (!confirmation) return;
    const id = setTimeout(() => setConfirmation(null), 4_000);
    return () => clearTimeout(id);
  }, [confirmation]);

  const submit = (action: Action) => {
    start(async () => {
      setError(null);
      const res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { ok: boolean; action: Action; at: string }
          | null;
        const at = body?.at ? new Date(body.at) : new Date();
        const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const tmpl =
          action === "CLOCK_IN"
            ? labels.doneClockIn
            : action === "CLOCK_OUT"
            ? labels.doneClockOut
            : action === "BREAK_START"
            ? labels.doneBreakStart
            : labels.doneBreakEnd;
        setConfirmation(tmpl.replace("{time}", time));
        router.refresh();
      } else {
        const body = await res.json().catch(() => null);
        const code = body?.error ?? "ERROR";
        setError(translateError(code));
        if (code === "UNAUTH") {
          // Session expired — bounce back to PIN screen.
          setTimeout(() => router.push(window.location.pathname.replace(/\/actions$/, "")), 1500);
        }
      }
    });
  };

  // Show only the actions that make sense for the current state.
  // Color tokens: habb-success=clock in, habb-warning=start break,
  // habb-red=clock out, habb-black=end break (neutral tone).
  const buttons: { action: Action; label: string; icon: React.ReactNode; color: string }[] = [];
  if (status === "OUT") {
    buttons.push({
      action: "CLOCK_IN",
      label: labels.clockIn,
      icon: <LogIn className="w-6 h-6 mb-2" />,
      color: "bg-habb-ink text-white hover:bg-neutral-800 dark:bg-white dark:text-habb-black dark:hover:bg-neutral-200 dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]",
    });
  } else if (status === "IN") {
    buttons.push({
      action: "CLOCK_OUT",
      label: labels.clockOut,
      icon: <LogOut className="w-6 h-6 mb-2" />,
      color: "bg-habb-red text-white hover:bg-habb-red-dark shadow-[0_0_40px_rgba(218,14,21,0.15)] dark:shadow-[0_0_40px_rgba(218,14,21,0.2)]",
    });
    buttons.push({
      action: "BREAK_START",
      label: labels.breakStart,
      icon: <Coffee className="w-6 h-6 mb-2" />,
      color: "bg-habb-paper text-habb-ink border border-habb-line hover:bg-habb-line/60 dark:bg-white/5 dark:backdrop-blur-md dark:text-white dark:border-white/10 dark:hover:bg-white/10",
    });
  } else if (status === "BREAK") {
    buttons.push({
      action: "BREAK_END",
      label: labels.breakEnd,
      icon: <Play className="w-6 h-6 mb-2" />,
      color: "bg-habb-ink text-white hover:bg-neutral-800 dark:bg-white dark:text-habb-black dark:hover:bg-neutral-200 dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]",
    });
    buttons.push({
      action: "CLOCK_OUT",
      label: labels.clockOut,
      icon: <LogOut className="w-6 h-6 mb-2" />,
      color: "bg-habb-red text-white hover:bg-habb-red-dark shadow-[0_0_40px_rgba(218,14,21,0.15)] dark:shadow-[0_0_40px_rgba(218,14,21,0.2)]",
    });
  }

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${buttons.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {buttons.map((b) => (
          <button
            key={b.action}
            onClick={() => submit(b.action)}
            disabled={isPending}
            className={`flex flex-col items-center justify-center rounded-2xl min-h-[7rem] text-base font-bold transition-all duration-300 hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:pointer-events-none p-4 ${b.color}`}
          >
            {b.icon}
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      {confirmation && (
        <div className="rounded-lg bg-white border border-habb-line px-4 py-3 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 dark:bg-white/5 dark:border-white/10">
          <CheckCircle2 className="w-5 h-5 text-habb-ink dark:text-white" />
          <span className="text-habb-ink dark:text-white font-medium text-sm">{confirmation}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-habb-red/10 border border-habb-red/30 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-habb-red" />
          <span className="text-habb-red text-sm">{error}</span>
        </div>
      )}
    </div>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "ALREADY_CLOCKED_IN":
      return "You are already clocked in.";
    case "NOT_CLOCKED_IN":
      return "You are not clocked in.";
    case "ALREADY_ON_BREAK":
      return "A break is already in progress.";
    case "NOT_ON_BREAK":
      return "No break is currently in progress.";
    case "UNAUTH":
      return "Session expired. Please enter your PIN again.";
    default:
      return "Action failed. Please try again.";
  }
}
