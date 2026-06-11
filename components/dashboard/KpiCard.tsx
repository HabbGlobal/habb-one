// KPI-Card mit Icon-Badge, Hauptwert und Subtext (Trend oder Aufschlüsselung).
// Server-Component-tauglich (keine Hooks). Stil angelehnt an das
// shadcn-style Mock vom 21st-magic-Beispiel, aber mit unseren Tailwind-
// Tokens (kein Dark-Mode-Variante, weil der Rest der App noch keinen
// Dark-Toggle hat).

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KpiTone =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "slate";

const TONE_BG: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
};

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Trend in %. Positive = grün, negative = rot, null = neutral. */
  trendPct?: number | null;
  /** Sub-Label unter dem Hauptwert (z. B. "5 davon überfällig"). */
  subline?: string;
  /** Wenn rot statt grün: bei "negativen" KPIs (z. B. Mahnungen). */
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
    <div className="rounded-xl border border-habb-line bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${TONE_BG[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trendPct != null && (
          <TrendIcon className={`h-4 w-4 ${trendColor}`} />
        )}
      </div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
        {value}
      </div>
      {(trendPct != null || subline) && (
        <div className="text-xs mt-2 flex items-center gap-2">
          {trendPct != null && (
            <span className={`${trendColor} font-medium tabular-nums`}>
              {fmtPct(trendPct)}
            </span>
          )}
          {subline && (
            <span className="text-muted-foreground">{subline}</span>
          )}
        </div>
      )}
    </div>
  );
}
