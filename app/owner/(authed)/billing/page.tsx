import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlanBadge } from "@/components/owner/Badges";
import { PlanChangeAction } from "@/components/owner/PlanChangeAction";
import { CreditCard, TrendingUp, Building2 } from "lucide-react";
import { PLANS, formatUsd } from "@/lib/pricing/plans";

export const dynamic = "force-dynamic";

// Prices + taglines come from lib/pricing/plans.ts, the single source of
// truth between the public pricing page and the owner console.
// Enterprise has priceUSD === null ("On request") and is not included in
// the MRR estimate. Individual contracts must be tracked separately.
const planPrices = new Map<string, number | null>(
  PLANS.map((p) => [p.key, p.priceUSD]),
);
const PLAN_NOTE: Record<string, string> = Object.fromEntries(
  PLANS.map((p) => [p.key, p.tagline]),
);
function formatPlanPrice(plan: string): string {
  const p = planPrices.get(plan);
  if (p === null || p === undefined) return "On request";
  return formatUsd(p);
}

export default async function BillingPage() {
  const tenants = await prisma.company.findMany({
    where: { registrationStatus: "ACTIVE" },
    select: {
      id: true,
      name: true,
      city: true,
      plan: true,
      suspendedAt: true,
      createdAt: true,
      _count: { select: { users: true, employees: true } },
    },
    orderBy: [{ plan: "asc" }, { name: "asc" }],
  });

  // Plan distribution
  const byPlan = new Map<string, typeof tenants>();
  for (const t of tenants) {
    const arr = byPlan.get(t.plan) ?? [];
    arr.push(t);
    byPlan.set(t.plan, arr);
  }

  const totalMRR = tenants
    .filter((t) => !t.suspendedAt)
    .reduce((sum, t) => sum + (planPrices.get(t.plan) ?? 0), 0);
  const enterpriseActive = tenants.filter(
    (t) => !t.suspendedAt && t.plan === "ENTERPRISE",
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          Billing
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          {tenants.length} active tenants · indicative MRR{" "}
          <span className="font-semibold text-habb-ink">
            {formatUsd(totalMRR)}
          </span>
          {" "}/ month
        </p>
      </header>

      <p className="rounded-md border border-habb-warning/30 bg-habb-warning/5 px-4 py-2 text-xs text-habb-warning">
        Prices are indicative — real billing runs (for now) via manual contracts.
        Changing plans here is mandatory for module visibility and limits to apply correctly.
      </p>

      {/* Plan overview: one card per plan with MRR and tenant count.
          The list comes from the pricing definition, so new plans appear
          automatically without hardcoding them here. */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => p.key).map((plan) => {
          const list = byPlan.get(plan) ?? [];
          const active = list.filter((t) => !t.suspendedAt);
          const priceVal = planPrices.get(plan);
          const isCustom = priceVal === null;
          const planMRR = isCustom ? null : active.length * (priceVal ?? 0);
          return (
            <div
              key={plan}
              className="rounded-lg border border-habb-line bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <PlanBadge plan={plan} />
                <CreditCard className="h-4 w-4 text-habb-muted" />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums text-habb-ink">
                {active.length}
              </div>
              <p className="text-xs text-habb-muted">
                active · {list.length - active.length} suspended
              </p>
              <p className="mt-3 text-xs text-habb-ink">
                {formatPlanPrice(plan)}
                <span className="text-habb-muted">
                  {isCustom ? " · individual" : " / tenant / month"}
                </span>
              </p>
              {planMRR !== null ? (
                <p className="mt-1 text-sm font-medium tabular-nums text-habb-success">
                  {formatUsd(planMRR)} MRR
                </p>
              ) : (
                <p className="mt-1 text-sm font-medium text-habb-muted">
                  MRR from contracts
                </p>
              )}
              <p className="mt-2 text-[11px] text-habb-muted">{PLAN_NOTE[plan]}</p>
            </div>
          );
        })}
      </section>

      {/* Tenant table with plan changes */}
      <section className="rounded-lg border border-habb-line bg-white overflow-hidden">
        <header className="border-b border-habb-line px-5 py-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-habb-muted" />
          <h2 className="text-sm font-semibold text-habb-ink">Tenants by Plan</h2>
        </header>
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs font-medium uppercase tracking-wide text-habb-muted">
            <tr>
              <th className="px-5 py-3">Tenant</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Price / Month</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Employees</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-habb-muted">
                  No active tenants.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className={t.suspendedAt ? "bg-habb-paper/40" : ""}>
                <td className="px-5 py-3">
                  <Link
                    href={`/owner/tenants/${t.id}`}
                    className="font-medium text-habb-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.city && <div className="text-xs text-habb-muted">{t.city}</div>}
                </td>
                <td className="px-5 py-3">
                  <PlanBadge plan={t.plan} />
                </td>
                <td className="px-5 py-3 text-habb-ink">{formatPlanPrice(t.plan)}</td>
                <td className="px-5 py-3 text-habb-ink">{t._count.users}</td>
                <td className="px-5 py-3 text-habb-ink">{t._count.employees}</td>
                <td className="px-5 py-3">
                  {t.suspendedAt ? (
                    <span className="text-habb-warning text-xs">Suspended</span>
                  ) : (
                    <span className="text-habb-success text-xs">Active</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <PlanChangeAction
                    tenant={{ id: t.id, name: t.name, plan: t.plan, suspended: !!t.suspendedAt }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-habb-line bg-white p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-habb-muted" />
          <h3 className="text-sm font-semibold text-habb-ink">MRR Breakdown</h3>
        </div>
        <p className="text-sm text-habb-ink">
          Combined active tenants:{" "}
          <span className="font-semibold tabular-nums">
            {formatUsd(totalMRR)}
          </span>{" "}
          / month. Annual run rate:{" "}
          <span className="font-semibold tabular-nums text-habb-success">
            {formatUsd(totalMRR * 12)}
          </span>
          .
        </p>
        <p className="mt-1 text-xs text-habb-muted">
          Suspended tenants are not counted.
          {enterpriseActive > 0
            ? ` ${enterpriseActive} Enterprise tenant${enterpriseActive === 1 ? "" : "s"} has individual contracts and is not included in the list price MRR.`
            : ""}
        </p>
      </section>
    </div>
  );
}
