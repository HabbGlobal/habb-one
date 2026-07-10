"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
    card: "hover:border-emerald-300",
    pill: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-600",
    text: "text-emerald-700",
  },
  BREAK: {
    card: "hover:border-amber-300",
    pill: "bg-amber-50 text-amber-700",
    dot: "bg-amber-600",
    text: "text-amber-700",
  },
  OUT: {
    card: "hover:border-neutral-300",
    pill: "bg-habb-paper text-habb-muted",
    dot: "bg-neutral-400",
    text: "text-habb-muted",
  },
  ABSENT: {
    card: "hover:border-red-200",
    pill: "bg-red-50 text-habb-red",
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
      className={`group block rounded-xl border border-habb-line bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}
    >
      <div className="flex min-h-40 flex-col justify-between gap-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold leading-tight tracking-tight text-habb-ink">
                {firstName}
              </h2>

              <p className="mt-1 truncate text-base text-habb-muted">
                {lastName}
              </p>
            </div>

            <span className="shrink-0 rounded-md bg-habb-paper px-2 py-1 text-[11px] font-semibold text-habb-muted">
              #{employeeNumber}
            </span>
          </div>
        </div>

        <div>
          <StatusPill status={status} absenceLabel={absenceLabel} />

          {status === "IN" && (
            <div className="mt-3">
              {sinceLabel && (
                <p className="text-xs text-habb-muted">since {sinceLabel}</p>
              )}

              {liveCounter && (
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
                  {liveCounter}
                </p>
              )}
            </div>
          )}

          {status === "BREAK" && (
            <div className="mt-3">
              {sinceLabel && (
                <p className="text-xs text-habb-muted">since {sinceLabel}</p>
              )}

              {liveCounter && (
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700">
                  {liveCounter}
                </p>
              )}
            </div>
          )}

          {status === "OUT" && (
            <div className="mt-3">
              {todayWorkedLabel ? (
                <p className="text-xs text-habb-muted">
                  Today: {todayWorkedLabel}
                </p>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-habb-muted">
                  <LogIn className="h-3.5 w-3.5" />
                  Tap to clock in
                </p>
              )}
            </div>
          )}

          {status === "ABSENT" && (
            <p className="mt-3 text-xs text-habb-muted">
              Not available today
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatusPill({
  status,
  absenceLabel,
}: {
  status: KioskStatus;
  absenceLabel: string | null;
}) {
  const styles = STATUS_STYLES[status];

  if (status === "IN") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${styles.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot} animate-pulse`} />
        Clocked in
      </span>
    );
  }

  if (status === "BREAK") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${styles.pill}`}
      >
        <Coffee className="h-3.5 w-3.5" />
        On break
      </span>
    );
  }

  if (status === "ABSENT") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${styles.pill}`}
      >
        <Plane className="h-3.5 w-3.5" />
        {absenceLabel ?? "Absent"}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${styles.pill}`}
    >
      <LogOut className="h-3.5 w-3.5" />
      Clocked out
    </span>
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