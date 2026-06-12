import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeLocal } from "@/lib/time/zone";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("audit");
  const logs = await prisma.auditLog.findMany({
    where: { companyId: session.user.companyId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("who")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("entity")}</TableHead>
                <TableHead>{t("details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("noEntries")}
                  </TableCell>
                </TableRow>
              )}
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTimeLocal(l.createdAt)}
                  </TableCell>
                  <TableCell>{l.user?.name ?? (l.employeeId ? "Employee" : "System")}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell>
                    {l.entityType}{" "}
                    {l.entityId && (
                      <span className="text-xs text-muted-foreground">{l.entityId.slice(0, 6)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                    {l.reason ?? JSON.stringify(l.newValue ?? l.oldValue ?? "")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
