import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PlanBadge, TenantStatusBadge } from "@/components/owner/Badges";
import { SuspendButtons } from "@/components/owner/SuspendButtons";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/modules", label: "Modules" },
  { href: "/roles", label: "Roles & Permissions" },
  { href: "/users", label: "User" },
  { href: "/activity", label: "Activity" },
  { href: "/billing", label: "Billing" },
  { href: "/audit", label: "Audit" },
  { href: "/support", label: "Support" },
];

export default async function TenantDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      plan: true,
      suspendedAt: true,
      createdAt: true,
    },
  });
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/owner/tenants"
          className="inline-flex items-center gap-1 text-xs text-habb-muted hover:text-habb-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          Tenant list
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
              {tenant.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-habb-muted">
              <span>
                {tenant.city ? `${tenant.city}, ` : ""}
                {tenant.country}
              </span>
              <span>·</span>
              <span>since {tenant.createdAt.toLocaleDateString("de-CH")}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PlanBadge plan={tenant.plan} />
              <Link
                href={`/owner/tenants/${tenant.id}/modules`}
                className="text-[11px] text-habb-muted underline-offset-2 hover:text-habb-ink hover:underline"
              >
                Change plan & modules →
              </Link>
              <TenantStatusBadge suspendedAt={tenant.suspendedAt} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SuspendButtons tenantId={tenant.id} isSuspended={!!tenant.suspendedAt} />
          </div>
        </div>
      </div>

      <nav className="border-b border-habb-line">
        <ul className="-mb-px flex flex-wrap gap-0.5">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={`/owner/tenants/${tenant.id}${tab.href}`}
                className="inline-flex border-b-2 border-transparent px-3.5 py-2.5 text-sm text-habb-muted transition-colors hover:border-habb-line hover:text-habb-ink focus-visible:outline-none focus-visible:text-habb-ink"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div>{children}</div>
    </div>
  );
}
