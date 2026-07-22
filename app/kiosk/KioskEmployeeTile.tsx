"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coffee, LogIn, LogOut, Plane } from "lucide-react";

import type { KioskStatus } from "@/lib/kiosk-tiles";

export type { KioskStatus };

interface Props {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  status: KioskStatus;
  sinceIso: string | null;
  absenceLabel: string | null;
  serverNowIso: string;
}

const STATUS_STYLES: Record<
  KioskStatus,
  {
    card: string;
    pill: string;
    dot: string;
    text: string;
    label: string;
  }
> = {
  IN: {
    card: "hover:border-emerald-500 hover:bg-emerald-500/5 dark:hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] dark:hover:bg-white/10",
    pill: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "In",
  },
  BREAK: {
    card: "hover:border-amber-500 hover:bg-amber-500/5 dark:hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] dark:hover:bg-white/10",
    pill: "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    label: "Break",
  },
  OUT: {
    card: "hover:border-neutral-400 hover:bg-habb-paper dark:hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] dark:hover:bg-white/10",
    pill: "bg-habb-paper text-habb-muted border border-habb-line dark:bg-white/5 dark:text-neutral-400 dark:border-white/10",
    dot: "bg-neutral-400",
    text: "text-habb-muted dark:text-neutral-400",
    label: "Out",
  },
  ABSENT: {
    card: "hover:border-habb-red hover:bg-habb-red/5 dark:hover:shadow-[0_0_20px_rgba(218,14,21,0.2)] dark:hover:bg-white/10",
    pill: "bg-habb-red/10 text-habb-red border border-habb-red/20",
    dot: "bg-habb-red",
    text: "text-habb-red",
    label: "Absent",
  },
};

export function KioskEmployeeTile({
  employeeId,
  firstName,
  lastName,
  employeeNumber,
  status,
  sinceIso,
  absenceLabel,
  serverNowIso,
}: Props) {
  const mountedAtMs = useRef(Date.now());
  const [clientNowMs, setClientNowMs] = useState(Date.now());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleNavigate = (e: React.MouseEvent) => {
    // Intercept default left clicks without modifier keys
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      startTransition(() => {
        router.push(`/kiosk/${employeeId}`);
      });
    }
  };

  useEffect(() => {
    if (status !== "IN" && status !== "BREAK") return;

    const intervalId = window.setInterval(() => {
      setClientNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [status]);

  let liveCounter: string | null = null;

  if (sinceIso && (status === "IN" || status === "BREAK")) {
    const sinceMs = new Date(sinceIso).getTime();
    const serverNowMs = new Date(serverNowIso).getTime();
    const elapsedSinceHydration = clientNowMs - mountedAtMs.current;
    const estimatedNowMs = serverNowMs + elapsedSinceHydration;
    const elapsedMs = Math.max(0, estimatedNowMs - sinceMs);

    liveCounter = formatHMS(elapsedMs);
  }

  const styles = STATUS_STYLES[status];

  return (
    <Link
      href={`/kiosk/${employeeId}`}
      onClick={handleNavigate}
      className={`group flex min-h-[5.5rem] flex-col justify-between gap-2 rounded-xl border border-habb-line bg-white p-3 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:bg-habb-paper dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md dark:hover:bg-white/10 ${styles.card} ${isPending ? 'opacity-70 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-habb-paper border border-habb-line text-sm font-bold text-habb-muted group-hover:text-habb-ink transition-colors dark:bg-black/50 dark:border-white/10 dark:text-neutral-300 dark:group-hover:text-white">
          {isPending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-habb-ink dark:border-white border-t-transparent" />
          ) : (
            <>{firstName.charAt(0)}{lastName.charAt(0)}</>
          )}
        </div>

        <div
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${styles.dot} ${styles.text} ${
            status === "IN" || status === "BREAK" ? "animate-pulse shadow-[0_0_8px_currentColor]" : "opacity-50"
          }`}
        />
      </div>

      <div className="min-w-0">
        <h2 className="break-words text-sm font-bold leading-tight text-habb-ink dark:text-white transition-colors">
          {firstName} {lastName}
        </h2>
        <p className="mt-0.5 text-[10px] font-semibold tracking-widest text-habb-muted dark:text-neutral-500">
          #{employeeNumber}
        </p>
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles.pill}`}>
          {styles.label}
        </span>

        {liveCounter && (
          <span className={`font-mono text-[10px] font-bold tabular-nums ${styles.text}`}>
            {liveCounter}
          </span>
        )}
      </div>
    </Link>
  );
}

function formatHMS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}