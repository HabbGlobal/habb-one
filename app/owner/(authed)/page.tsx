import { getOwnerContext } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";
import { Activity, Building2, Users, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Owner dashboard. Skeleton with real numbers where trivial; otherwise
 * placeholders for PR 2+ (MRR, health indicator, activity heatmap later).
 */
export default async function OwnerDashboardPage() {
  const ctx = await getOwnerContext();
  if (!ctx) return null; // layout redirects; this is only for type safety

  const [tenantCount, activeTenantCount, userCount, recentAuditEvents] = await Promise.all([
    prisma.company.count(),
    prisma.company.count(), // PR 2 adds suspended filter
    prisma.user.count({ where: { isActive: true } }),
    prisma.ownerAuditLog.findMany({
      take: 10,
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        timestamp: true,
        action: true,
        ownerEmail: true,
        targetCompanyId: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Overview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          Welcome, {ctx.name}
        </h1>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Building2} label="Tenants" value={tenantCount} sub={`${activeTenantCount} active`} />
        <Kpi icon={Users} label="Active Users" value={userCount} sub="across all tenants" />
        <Kpi icon={KeyRound} label="Impersonation active" value={0} sub="Placeholder — PR 4" muted />
        <Kpi icon={Activity} label="Health" value="—" sub="Placeholder — PR 2" muted />
      </section>

      <section className="rounded-lg border border-habb-line bg-white">
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-medium text-habb-ink">Recent Audit Events</h2>
          <span className="text-xs text-habb-muted">{recentAuditEvents.length} entries</span>
        </header>
        {recentAuditEvents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-habb-muted">
            No audit events yet. Initial actions will be visible here after login.
          </p>
        ) : (
          <ul className="divide-y divide-habb-line">
            {recentAuditEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-xs text-habb-muted">
                  {e.timestamp.toLocaleString("en-US")}
                </span>
                <span className="font-medium text-habb-ink">{e.action}</span>
                <span className="text-xs text-habb-muted">{e.ownerEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  muted,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "rounded-lg border border-dashed border-habb-line bg-white px-4 py-3.5"
          : "rounded-lg border border-habb-line bg-white px-4 py-3.5"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-habb-muted">{label}</p>
        <Icon className="h-4 w-4 text-habb-muted" aria-hidden="true" />
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${muted ? "text-habb-muted" : "text-habb-black"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-habb-muted">{sub}</p>
    </div>
  );
}
