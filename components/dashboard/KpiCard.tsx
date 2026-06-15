// Modern KPI card with icon badge, main value, and subtext.
// Server-component compatible (no hooks).

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiTone =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "slate";

const TONE_STYLES: Record<KpiTone, { bg: string; icon: string; ring: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", ring: "ring-blue-100" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", ring: "ring-amber-100" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", ring: "ring-purple-100" },
  rose: { bg: "bg-rose-50", icon: "text-rose-600", ring: "ring-rose-100" },
  slate: { bg: "bg-slate-50", icon: "text-slate-600", ring: "ring-slate-100" },
};

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  trendPct?: number | null;
  subline?: string;
  negativeIsBad?: boolean;
}

function fmtPct(pct: number): string {
  const abs = Math.abs(pct);
  return `${pct >= 0 ? "+" : "−"}${abs.toFixed(0)}%`;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  trendPct,
  subline,
  negativeIsBad,
}: Props) {
  const toneStyle = TONE_STYLES[tone];

  const trendColor =
    trendPct == null
      ? "text-muted-foreground"
      : trendPct === 0
        ? "text-muted-foreground"
        : (trendPct > 0) === !negativeIsBad
          ? "text-emerald-600"
          : "text-rose-600";

  const TrendIcon =
    trendPct == null || trendPct === 0
      ? Minus
      : trendPct > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <div className="group relative rounded-2xl border-0 bg-white/80 backdrop-blur-sm p-5 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      {/* Subtle gradient accent at top */}
      <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity ${
        tone === "emerald" ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
        tone === "blue" ? "bg-gradient-to-r from-blue-400 to-blue-600" :
        tone === "amber" ? "bg-gradient-to-r from-amber-400 to-amber-600" :
        tone === "purple" ? "bg-gradient-to-r from-purple-400 to-purple-600" :
        tone === "rose" ? "bg-gradient-to-r from-rose-400 to-rose-600" :
        "bg-gradient-to-r from-slate-400 to-slate-600"
      }`} />

      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${toneStyle.bg} ring-1 ${toneStyle.ring}`}>
          <Icon className={`h-5 w-5 ${toneStyle.icon}`} />
        </div>
        {trendPct != null && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor} bg-slate-50 rounded-full px-2 py-0.5`}>
            <TrendIcon className="h-3 w-3" />
            {fmtPct(trendPct)}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
          {value}
        </p>
      </div>

      {subline && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {subline}
        </p>
      )}
    </div>
  );
}
