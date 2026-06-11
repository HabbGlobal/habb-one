import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import { AreaList } from "./AreaList";
import { lifecycleFilter, parseView, type LifecycleView } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "settings.read")) redirect("/admin");

  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  const baseWhere = { companyId: session.user.companyId };

  const [areas, active, archived, deleted] = await Promise.all([
    prisma.workArea.findMany({
      where: { ...baseWhere, ...lifecycleFilter(view) },
      include: { _count: { select: { members: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.workArea.count({ where: { ...baseWhere, ...lifecycleFilter("active") } }),
    prisma.workArea.count({ where: { ...baseWhere, ...lifecycleFilter("archived") } }),
    prisma.workArea.count({ where: { ...baseWhere, ...lifecycleFilter("deleted") } }),
  ]);
  const counts = { active, archived, deleted };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bereiche</h1>
        <Button asChild>
          <Link href="/admin/areas/new">Neuer Bereich</Link>
        </Button>
      </div>

      <LifecycleTabs baseHref="/admin/areas" current={view} counts={counts} />

      <Card>
        <CardContent className="p-2">
          <AreaList
            view={view}
            rows={areas.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
              colorHex: a.colorHex,
              sortOrder: a.sortOrder,
              memberCount: a._count.members,
              minEmployeesPerDay: a.minEmployeesPerDay,
              maxEmployeesPerDay: a.maxEmployeesPerDay,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
