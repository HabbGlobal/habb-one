import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EntitlementsList, type EntitlementRow } from "@/components/owner/EntitlementsList";
import { getEffectiveEntitlements, MODULE_DEFAULTS } from "@/lib/owner/entitlements";
import { PlanChangeAction } from "@/components/owner/PlanChangeAction";
import { PLANS, formatUsd } from "@/lib/pricing/plans";
import { Check } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TenantModulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, plan: true, suspendedAt: true },
  });
  if (!tenant) notFound();

  const entitlements = await getEffectiveEntitlements(tenant.id);
  const rows: EntitlementRow[] = entitlements.map((e) => ({
    module: e.module,
    enabled: e.enabled,
    monthlyLimit: e.monthlyLimit,
    hasOverride: e.hasOverride,
    inPlan: e.inPlan,
  }));

  const planSpec = PLANS.find((p) => p.key === tenant.plan);

  return (
    <div className="space-y-6">
      {/* ── Plan-Steuerung: Plan wechseln → Module folgen automatisch ── */}
      <section className="rounded-lg border border-habb-line bg-white">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-habb-line px-5 py-3">
          <div>
            <h2 className="text-sm font-medium text-habb-ink">Plan</h2>
            <p className="mt-0.5 text-xs text-habb-muted">
              Der Plan bestimmt die enthaltenen Module. Beim Wechsel werden sie
              automatisch aktiviert (Upgrade) bzw. entfernt (Downgrade). Manuelle
              Sonderfreischaltungen/-sperren unten <strong>bleiben erhalten</strong>.
            </p>
          </div>
          <PlanChangeAction
            tenant={{
              id: tenant.id,
              name: tenant.name,
              plan: tenant.plan,
              suspended: !!tenant.suspendedAt,
            }}
          />
        </header>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-habb-muted">
              Aktiver Plan
            </p>
            <p className="mt-0.5 text-base font-semibold text-habb-ink">
              {planSpec?.label ?? tenant.plan}
              <span className="ml-2 text-sm font-normal text-habb-muted">
                {planSpec
                  ? planSpec.priceUSD === null
                    ? "On Request"
                    : `${formatUsd(planSpec.priceUSD)} / mo`
                  : "Unknown Plan"}
              </span>
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-habb-muted">
              Im Plan enthaltene Module
            </p>
            {planSpec && planSpec.modules.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {planSpec.modules.map((m) => (
                  <li
                    key={m}
                    className="flex items-center gap-1.5 text-xs text-habb-ink"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-habb-success" />
                    {MODULE_DEFAULTS[m].label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-habb-muted">—</p>
            )}
          </div>
        </div>
      </section>

      <EntitlementsList tenantId={tenant.id} initial={rows} />
    </div>
  );
}
