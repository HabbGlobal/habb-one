import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PlanBadge, TenantStatusBadge } from "@/components/owner/Badges";
import { CreateTenantButton } from "@/components/owner/CreateTenantButton";
import { SectionTabs } from "@/components/owner/SectionTabs";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function TenantsListPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  // Aktive Tenanten: registriert, freigegeben, NICHT suspendiert.
  // Suspendierte landen unter /owner/tenants/archive.
  const baseWhere = {
    registrationStatus: "ACTIVE" as const,
    suspendedAt: null,
  };

  const [tenants, archivedCount] = await Promise.all([
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
        createdAt: true,
        updatedAt: true,
        _count: { select: { users: true, employees: true } },
        users: {
          select: { lastLoginAt: true },
          orderBy: { lastLoginAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.company.count({
      where: { suspendedAt: { not: null } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">Tenants</h1>
          <p className="mt-1 text-sm text-habb-muted">
            {tenants.length} aktive{tenants.length === 1 ? "r" : ""} Tenant
            {tenants.length === 1 ? "" : "en"}
            {search ? ` für „${search}"` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-habb-muted" />
              <input
                name="q"
                defaultValue={search}
                placeholder="Tenant oder Ort suchen…"
                className="w-72 rounded-lg border border-habb-line bg-white py-2.5 pl-9 pr-3 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
              />
            </div>
            {search && (
              <Link
                href="/owner/tenants"
                className="rounded-md border border-habb-line bg-white px-3 py-2.5 text-xs font-medium text-habb-muted hover:text-habb-ink"
              >
                Zurücksetzen
              </Link>
            )}
          </form>
          <CreateTenantButton />
        </div>
      </header>

      <SectionTabs
        tabs={[
          { href: "/owner/tenants", label: "Aktive", count: tenants.length },
          { href: "/owner/tenants/archive", label: "Archiv", count: archivedCount },
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-habb-line bg-white">
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs font-medium uppercase tracking-wide text-habb-muted">
            <tr>
              <th scope="col" className="px-5 py-3">Tenant</th>
              <th scope="col" className="px-5 py-3">Plan</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">User</th>
              <th scope="col" className="px-5 py-3">Mitarbeitende</th>
              <th scope="col" className="px-5 py-3">Erstellt</th>
              <th scope="col" className="px-5 py-3">Letzter Login</th>
              <th scope="col" className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {tenants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-habb-muted">
                  Keine aktiven Tenanten gefunden.
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
                  {t.city && (
                    <div className="text-xs text-habb-muted">{t.city}</div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <PlanBadge plan={t.plan} />
                </td>
                <td className="px-5 py-3.5">
                  <TenantStatusBadge suspendedAt={t.suspendedAt} />
                </td>
                <td className="px-5 py-3.5 text-habb-ink">{t._count.users}</td>
                <td className="px-5 py-3.5 text-habb-ink">{t._count.employees}</td>
                <td className="px-5 py-3.5 text-habb-muted">
                  {t.createdAt.toLocaleDateString("de-CH")}
                </td>
                <td className="px-5 py-3.5 text-habb-muted">
                  {t.users[0]?.lastLoginAt
                    ? t.users[0].lastLoginAt.toLocaleDateString("de-CH")
                    : "—"}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/owner/tenants/${t.id}`}
                    className="text-xs font-medium text-habb-ink hover:underline"
                  >
                    Öffnen →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-habb-muted">
        Filter (Plan, Status, &quot;nur problematische&quot;) und Bulk-Actionen folgen in PR&nbsp;2.1.
      </p>
    </div>
  );
}
