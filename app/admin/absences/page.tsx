import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import { AbsenceList } from "./AbsenceList";
import { NewAbsenceDialog } from "./NewAbsenceDialog";
import { lifecycleFilter, parseView, type LifecycleView } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("absences");
  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  const baseWhere = { employee: { companyId: session.user.companyId } };

  const [absences, employees, types, active, archived, deleted] = await Promise.all([
    prisma.absence.findMany({
      where: { ...baseWhere, ...lifecycleFilter(view) },
      include: { employee: true, absenceType: true },
      orderBy: { startDate: "desc" },
      take: 200,
    }),
    prisma.employee.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.absenceType.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
        deletedAt: null,
      },
    }),
    prisma.absence.count({ where: { ...baseWhere, ...lifecycleFilter("active") } }),
    prisma.absence.count({ where: { ...baseWhere, ...lifecycleFilter("archived") } }),
    prisma.absence.count({ where: { ...baseWhere, ...lifecycleFilter("deleted") } }),
  ]);
  const counts = { active, archived, deleted };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/absences/types">{t("manageTypes")}</Link>
          </Button>
          <NewAbsenceDialog
            employees={employees.map((e) => ({ id: e.id, name: `${e.lastName}, ${e.firstName}` }))}
            types={types.map((t) => ({ id: t.id, label: t.labelDe }))}
          />
        </div>
      </div>

      <LifecycleTabs baseHref="/admin/absences" current={view} counts={counts} />

      <Card>
        <CardContent className="p-2">
          <AbsenceList
            view={view}
            rows={absences.map((a) => ({
              id: a.id,
              employeeName: `${a.employee.lastName}, ${a.employee.firstName}`,
              typeLabel: a.absenceType.labelDe,
              typeColor: a.absenceType.colorHex,
              startDate: a.startDate,
              endDate: a.endDate,
              startHalfDay: a.startHalfDay,
              endHalfDay: a.endHalfDay,
              status: a.status,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
