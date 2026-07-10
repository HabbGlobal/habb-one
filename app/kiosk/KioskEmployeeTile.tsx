"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coffee, LogIn, LogOut, Plane } from "lucide-react";

export type KioskStatus = "IN" | "BREAK" | "OUT" | "ABSENT";

interface Props {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  status: KioskStatus;
  sinceIso: string | null;
  sinceLabel: string | null;
  absenceLabel: string | null;
  todayWorkedLabel: string | null;
  serverNowIso: string;
}

const STATUS_STYLES: Record<
  KioskStatus,
  {
    card: string;
    pill: string;
    dot: string;
    text: string;
  }
> = {
  IN: {
    card: "hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-white/10",
    pill: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
  BREAK: {
    card: "hover:border-amber-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:bg-white/10",
    pill: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    dot: "bg-amber-400",
    text: "text-amber-400",
  },
  OUT: {
    card: "hover:border-neutral-400 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:bg-white/10",
    pill: "bg-white/5 text-neutral-400 border border-white/10",
    dot: "bg-neutral-400",
    text: "text-neutral-400",
  },
  ABSENT: {
    card: "hover:border-habb-red hover:shadow-[0_0_20px_rgba(218,14,21,0.2)] hover:bg-white/10",
    pill: "bg-habb-red/10 text-habb-red border border-habb-red/20",
    dot: "bg-habb-red",
    text: "text-habb-red",
  },
};

export function KioskEmployeeTile({
  employeeId,
  firstName,
  lastName,
  employeeNumber,
  status,
  sinceIso,
  sinceLabel,
  absenceLabel,
  todayWorkedLabel,
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
      className={`group flex items-center justify-between rounded-full border border-white/10 bg-white/5 backdrop-blur-md p-3 pr-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-white/10 ${styles.card} ${isPending ? 'opacity-70 pointer-events-none' : ''}`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/50 border border-white/10 text-lg font-bold text-neutral-300 group-hover:text-white transition-colors">
          {isPending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>{firstName.charAt(0)}{lastName.charAt(0)}</>
          )}
        </div>
        
        <div className="flex flex-col min-w-0">
          <h2 className="truncate text-xl font-bold leading-tight text-white transition-colors">
            {firstName} {lastName}
          </h2>
          <p className="text-xs font-semibold tracking-widest text-neutral-500 mt-0.5">
             #{employeeNumber}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-4">
        {liveCounter && (
           <span className={`font-mono text-sm font-bold tabular-nums opacity-80 ${styles.text}`}>
             {liveCounter}
           </span>
        )}
        <div className={`h-3 w-3 rounded-full ${styles.dot} ${status === "IN" || status === "BREAK" ? "animate-pulse shadow-[0_0_10px_currentColor]" : "opacity-50"}`} style={{ color: styles.dot.replace('bg-', '') }} />
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