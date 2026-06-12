import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlanBadge, TenantStatusBadge } from "@/components/owner/Badges";
import { SectionTabs } from "@/components/owner/SectionTabs";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Archive of suspended tenants. Identical columns as the active list,
 * additionally "Suspended since" and reason. Reactivation happens on the
 * detail page (component `SuspendButtons`).
 */
export default async function ArchivedTenantsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const baseWhere = { suspendedAt: { not: null } };

  const [tenants, activeCount] = await Promise.all([
    prisma.company.findMany({
      where: search
        ? {
            ...baseWhere,
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : baseWhere,
      select: {
        id: true,
        name: true,
        city: true,
        plan: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        _count: { select: { users: true, employees: true } },
      },
      orderBy: { suspendedAt: "desc" },
    }),
    prisma.company.count({
      where: { registrationStatus: "ACTIVE", suspendedAt: null },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
            Tenants · Archive
          </h1>
          <p className="mt-1 text-sm text-habb-muted">
            {tenants.length} suspended tenant{tenants.length === 1 ? "" : "s"}
            {search ? ` for "${search}"` : ""}
          </p>
        </div>

        <form className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-habb-muted" />
            <input
              name="q"
              defaultValue={search}
              placeholder="Search tenant or city…"
              className="w-72 rounded-lg border border-habb-line bg-white py-2.5 pl-9 pr-3 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
            />
          </div>
          {search && (
            <Link
              href="/owner/tenants/archive"
              className="rounded-md border border-habb-line bg-white px-3 py-2.5 text-xs font-medium text-habb-muted hover:text-habb-ink"
            >
              Reset
            </Link>
          )}
        </form>
      </header>

      <SectionTabs
        tabs={[
          { href: "/owner/tenants", label: "Active", count: activeCount },
          { href: "/owner/tenants/archive", label: "Archive", count: tenants.length },
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-habb-line bg-white">
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs font-medium uppercase tracking-wide text-habb-muted">
            <tr>
              <th scope="col" className="px-5 py-3">Tenant</th>
              <th scope="col" className="px-5 py-3">Plan</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Suspended since</th>
              <th scope="col" className="px-5 py-3">Reason</th>
              <th scope="col" className="px-5 py-3">User</th>
              <th scope="col" className="px-5 py-3">Employees</th>
              <th scope="col" className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-habb-muted">
                  No suspended tenants in the archive.
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-habb-paper/60">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/owner/tenants/${t.id}`}
                    className="font-medium text-habb-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.city && <div className="text-xs text-habb-muted">{t.city}</div>}
                </td>
                <td className="px-5 py-3.5">
                  <PlanBadge plan={t.plan} />
                </td>
                <td className="px-5 py-3.5">
                  <TenantStatusBadge suspendedAt={t.suspendedAt} />
                </td>
                <td className="px-5 py-3.5 text-habb-muted">
                  {t.suspendedAt ? t.suspendedAt.toLocaleDateString("de-CH") : "—"}
                </td>
                <td className="px-5 py-3.5 text-habb-muted max-w-[260px] truncate" title={t.suspendedReason ?? undefined}>
                  {t.suspendedReason || "—"}
                </td>
                <td className="px-5 py-3.5 text-habb-ink">{t._count.users}</td>
                <td className="px-5 py-3.5 text-habb-ink">{t._count.employees}</td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/owner/tenants/${t.id}`}
                    className="text-xs font-medium text-habb-ink hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-habb-muted">
        Reactivate on the tenant detail page via &quot;Reactivate&quot; — with sudo + reason,
        an audit entry is written automatically.
      </p>
    </div>
  );
}
