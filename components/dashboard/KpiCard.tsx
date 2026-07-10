import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export type KpiTone =
  | "blue"
  | "emerald"
  | "amber"
  | "purple"
  | "rose"
  | "slate";

type BadgeTone = "neutral" | "success" | "warning" | "danger";

const TONE_STYLES: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  purple: "bg-purple-50 text-purple-700 ring-purple-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-50 text-slate-700 ring-slate-100",
};

const BADGE_STYLES: Record<BadgeTone, string> = {
  neutral: "bg-habb-paper text-habb-muted",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-orange-50 text-orange-700",
};

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  trendPct?: number | null;
  subline?: string;
  negativeIsBad?: boolean;
  badgeLabel?: string;
  badgeTone?: BadgeTone;
}

function fmtPct(pct: number): string {
  const abs = Math.abs(pct);
  return `${pct >= 0 ? "+" : "−"}${abs.toFixed(0)}%`;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
  trendPct,
  subline,
  negativeIsBad = false,
  badgeLabel,
  badgeTone = "neutral",
}: Props) {
  const trendIsGood =
    trendPct == null || trendPct === 0
      ? null
      : negativeIsBad
        ? trendPct < 0
        : trendPct > 0;

  const trendColor =
    trendIsGood == null
      ? "bg-habb-paper text-habb-muted"
      : trendIsGood
        ? "bg-emerald-50 text-emerald-700"
        : "bg-orange-50 text-orange-700";

  const TrendIcon =
    trendPct == null || trendPct === 0
      ? Minus
      : trendPct > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <div className="rounded-xl border border-habb-line bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`rounded-lg p-2 ring-1 ${TONE_STYLES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>

        {trendPct != null ? (
          <div
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${trendColor}`}
          >
            <TrendIcon className="h-3 w-3" />
            {fmtPct(trendPct)}
          </div>
        ) : (
          <div
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${BADGE_STYLES[badgeTone]}`}
          >
            {badgeLabel ?? "—"}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-habb-muted">{label}</p>

        <p className="mt-2 text-2xl font-bold tracking-tight text-habb-ink tabular-nums dark:text-white">
          {value}
        </p>
      </div>

      {subline && (
        <p className="mt-2 text-xs leading-relaxed text-habb-muted">
          {subline}
        </p>
      )}
    </div>
  );
}