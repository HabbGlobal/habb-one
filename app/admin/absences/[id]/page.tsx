import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AbsenceForm } from "../AbsenceForm";

export default async function AbsenceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("absences");
  const tCommon = await getTranslations("common");

  const absence = await prisma.absence.findUnique({
    where: { id },
    include: { employee: true, absenceType: true },
  });
  if (!absence || absence.employee.companyId !== session.user.companyId) notFound();

  const [employees, types] = await Promise.all([
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
        deletedAt: null,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{tCommon("edit")} — {t("title")}</h1>
        <Link href="/admin/absences" className="text-sm text-muted-foreground hover:underline">
          ← {tCommon("back")}
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {absence.employee.lastName}, {absence.employee.firstName} — {absence.absenceType.labelDe}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AbsenceForm
            mode={{ kind: "edit", absenceId: id }}
            employees={employees.map((e) => ({ id: e.id, name: `${e.lastName}, ${e.firstName}` }))}
            types={types.map((t) => ({ id: t.id, label: t.labelDe }))}
            initial={{
              employeeId: absence.employeeId,
              absenceTypeId: absence.absenceTypeId,
              startDate: absence.startDate.toISOString().slice(0, 10),
              endDate: absence.endDate.toISOString().slice(0, 10),
              startHalfDay: absence.startHalfDay,
              endHalfDay: absence.endHalfDay,
              reason: absence.reason ?? "",
              status: absence.status,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
