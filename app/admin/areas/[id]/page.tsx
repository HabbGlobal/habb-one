import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/permissions";
import { AreaForm } from "../AreaForm";

export default async function EditAreaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "settings.read")) redirect("/admin");
  const { id } = await params;
  const area = await prisma.workArea.findUnique({ where: { id } });
  if (!area || area.companyId !== session.user.companyId) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bereich bearbeiten</h1>
        <Link href="/admin/areas" className="text-sm text-muted-foreground hover:underline">← Back</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{area.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaForm
            mode={{ kind: "edit", areaId: id }}
            initial={{
              name: area.name,
              description: area.description ?? "",
              colorHex: area.colorHex,
              sortOrder: area.sortOrder,
              minEmployeesPerDay: area.minEmployeesPerDay,
              maxEmployeesPerDay: area.maxEmployeesPerDay,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
