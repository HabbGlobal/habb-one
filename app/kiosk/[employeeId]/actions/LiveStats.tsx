"use client";

// Live ticker for the kiosk actions page. The server passes the worked /
// break minutes computed at render-time plus the precise server clock.
// We extrapolate every second so the counter visibly runs while the
// employee is clocked in. When on break, the worked counter freezes and
// the break counter ticks instead.

import { useEffect, useState } from "react";

export interface LiveStatsProps {
  serverNowIso: string;
  isOpen: boolean;
  isOnBreak: boolean;
  todayDate: string;
  todayTargetMin: number;
  todayWorkedMin: number;
  todayBreakMin: number;
  weekTargetMin: number;
  weekWorkedMin: number;
  labels: {
    today: string;
    thisWeek: string;
    target: string;
    worked: string;
    balance: string;
    remaining: string;
    breakLabel: string;
  };
}

export function LiveStats(props: LiveStatsProps) {
  const serverNowMs = new Date(props.serverNowIso).getTime();
  // Tick every second so the seconds display rolls smoothly.
  const [clientNow, setClientNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((clientNow - serverNowMs) / 1000));
  const tickWork = props.isOpen && !props.isOnBreak ? elapsedSec : 0;
  const tickBreak = props.isOnBreak ? elapsedSec : 0;

  // Convert minutes-from-server + live seconds into a single seconds total
  // so the display can show HH:MM:SS while it's running.
  const todayWorkedSec = props.todayWorkedMin * 60 + tickWork;
  const todayBreakSec = props.todayBreakMin * 60 + tickBreak;
  const todayTargetSec = props.todayTargetMin * 60;
  const todayBalanceSec = todayWorkedSec - todayTargetSec;
  const todayRemainingSec = Math.max(0, todayTargetSec - todayWorkedSec);

  const weekWorkedSec = props.weekWorkedMin * 60 + tickWork;
  const weekTargetSec = props.weekTargetMin * 60;
  const weekBalanceSec = weekWorkedSec - weekTargetSec;
  const weekRemainingSec = Math.max(0, weekTargetSec - weekWorkedSec);

  return (
    <>
      <div className="rounded-2xl border border-habb-line bg-white shadow-sm p-5 dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-2xl">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-habb-ink dark:text-white">
            {props.labels.today} — {props.todayDate}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={props.labels.target} value={fmt(todayTargetSec, false)} />
          <Stat
            label={props.labels.worked}
            value={fmt(todayWorkedSec, props.isOpen && !props.isOnBreak)}
            live={props.isOpen && !props.isOnBreak}
          />
          <Stat
            label={props.labels.balance}
            value={fmt(todayBalanceSec, false, { signed: true })}
            tone={todayBalanceSec < 0 ? "negative" : "positive"}
          />
          <Stat label={props.labels.remaining} value={fmt(todayRemainingSec, false)} />
        </div>
        {props.isOnBreak && (
          <div className="mt-4">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                {props.labels.breakLabel}: <span className="font-mono font-black text-base ml-1">{fmt(todayBreakSec, true)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-habb-line bg-white shadow-sm p-5 dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-2xl">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-habb-ink dark:text-white">{props.labels.thisWeek}</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={props.labels.target} value={fmt(weekTargetSec, false)} />
          <Stat
            label={props.labels.worked}
            value={fmt(weekWorkedSec, props.isOpen && !props.isOnBreak)}
            live={props.isOpen && !props.isOnBreak}
          />
          <Stat
            label={props.labels.balance}
            value={fmt(weekBalanceSec, false, { signed: true })}
            tone={weekBalanceSec < 0 ? "negative" : "positive"}
          />
          <Stat label={props.labels.remaining} value={fmt(weekRemainingSec, false)} />
        </div>
      </div>
    </>
  );
}

function fmt(totalSec: number, withSeconds: boolean, opts: { signed?: boolean } = {}): string {
  const sign = totalSec < 0 ? "-" : opts.signed ? "+" : "";
  const abs = Math.abs(totalSec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (withSeconds) {
    return `${sign}${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${sign}${h}:${m.toString().padStart(2, "0")} h`;
}

function Stat({
  label,
  value,
  tone,
  live,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  live?: boolean;
}) {
  const color =
    tone === "negative"
      ? "text-habb-red"
      : tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-habb-ink dark:text-white";
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-habb-muted dark:text-neutral-400 flex items-center gap-1.5 mb-1">
        {label}
        {live && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
      </div>
      <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
