import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import { EmployeeList } from "./EmployeeList";
import {
  lifecycleFilter,
  parseView,
  type LifecycleView,
} from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("employees");
  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  // Counts for the tab badges.
  const [active, archived, deleted] = await Promise.all([
    prisma.employee.count({
      where: { companyId: session.user.companyId, ...lifecycleFilter("active") },
    }),
    prisma.employee.count({
      where: { companyId: session.user.companyId, ...lifecycleFilter("archived") },
    }),
    prisma.employee.count({
      where: { companyId: session.user.companyId, ...lifecycleFilter("deleted") },
    }),
  ]);
  const counts = { active, archived, deleted };

  const employees = await prisma.employee.findMany({
    where: {
      companyId: session.user.companyId,
      ...lifecycleFilter(view),
    },
    include: {
      workAreas: { include: { workArea: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/employees/new">{t("new")}</Link>
        </Button>
      </div>

      <LifecycleTabs baseHref="/admin/employees" current={view} counts={counts} />

      <Card>
        <CardContent className="p-2">
          <EmployeeList
            view={view}
            rows={employees.map((e) => ({
              id: e.id,
              employeeNumber: e.employeeNumber,
              firstName: e.firstName,
              lastName: e.lastName,
              employmentType: e.employmentType,
              workloadPercent: e.workloadPercent,
              annualVacationDays: e.annualVacationDays,
              isActive: e.isActive,
              areas: e.workAreas
                .filter((wa) => wa.workArea.deletedAt === null)
                .map((wa) => ({
                  id: wa.workArea.id,
                  name: wa.workArea.name,
                  colorHex: wa.workArea.colorHex,
                })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
