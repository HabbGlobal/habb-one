"use client";

// Live ticker for the kiosk actions page. The server passes the worked /
// break minutes computed at render-time plus the precise server clock.
// We extrapolate every second so the counter visibly runs while the
// employee is clocked in. When on break, the worked counter freezes and
// the break counter ticks instead.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card>
        <CardHeader>
          <CardTitle>
            {props.labels.today} — {props.todayDate}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        </CardContent>
        {props.isOnBreak && (
          <CardContent className="pt-0">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm">
                {props.labels.breakLabel}: <span className="font-mono font-semibold">{fmt(todayBreakSec, true)}</span>
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{props.labels.thisWeek}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        </CardContent>
      </Card>
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
    tone === "negative" ? "text-red-600" : tone === "positive" ? "text-green-700" : "";
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
        {label}
        {live && <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
