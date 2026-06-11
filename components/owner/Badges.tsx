import type { TenantPlan } from "@prisma/client";

interface PlanBadgeProps {
  plan: TenantPlan;
}

const PLAN_STYLE: Record<TenantPlan, string> = {
  TRIAL: "bg-habb-warning/10 text-habb-warning border-habb-warning/30",
  TIME_ONLY: "bg-habb-success/10 text-habb-success border-habb-success/30",
  STARTER: "bg-habb-line/60 text-habb-ink border-habb-line",
  PRO: "bg-habb-black text-white border-habb-black",
  ENTERPRISE: "bg-habb-red/10 text-habb-red border-habb-red/30",
};

const PLAN_LABEL: Record<TenantPlan, string> = {
  TRIAL: "Trial",
  TIME_ONLY: "Zeiterfassung",
  STARTER: "Starter",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export function PlanBadge({ plan }: PlanBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${PLAN_STYLE[plan]}`}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}

interface StatusBadgeProps {
  suspendedAt: Date | null;
}

export function TenantStatusBadge({ suspendedAt }: StatusBadgeProps) {
  if (suspendedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-habb-red/30 bg-habb-red/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-habb-red">
        <span className="h-1.5 w-1.5 rounded-full bg-habb-red" />
        Suspendiert
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-habb-success/30 bg-habb-success/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-habb-success">
      <span className="h-1.5 w-1.5 rounded-full bg-habb-success" />
      Aktiv
    </span>
  );
}
