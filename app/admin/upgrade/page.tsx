import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MODULES, type PlanKey } from "@/lib/pricing/plans";
import type { TenantModule } from "@prisma/client";

export const dynamic = "force-dynamic";

const PLAN_LABEL: Record<PlanKey, string> = {
  TRIAL: "Trial",
  TIME_ONLY: "Time Tracking",
  STARTER: "Starter",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { m } = await searchParams;

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { plan: true },
  });

  const moduleKey = m as TenantModule | undefined;
  const moduleLabel =
    moduleKey && moduleKey in MODULES ? MODULES[moduleKey].label : "This module";
  const planLabel = company ? PLAN_LABEL[company.plan as PlanKey] : "—";

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-habb-paper">
        <Lock className="h-5 w-5 text-habb-muted" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
        {moduleLabel} is not in your plan
      </h1>
      <p className="mt-3 text-sm text-habb-muted">
        Your current plan is <strong>{planLabel}</strong>. This module is
        not included and therefore locked. Contact the HABB Global (PVT) LTD team
        to upgrade your plan — activation is immediate.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-lg border border-habb-line bg-white px-5 py-2.5 text-sm font-medium text-habb-ink hover:bg-habb-paper"
        >
          Back to dashboard</Link>
        <a
          href="mailto:support@HABB Global (PVT) LTD?subject=Plan-Erweiterung"
          className="inline-flex items-center justify-center rounded-lg bg-habb-black px-5 py-2.5 text-sm font-medium text-white hover:bg-habb-ink"
        >
          Upgrade plan
        </a>
      </div>
    </div>
  );
}
