import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format, startOfMonth } from "date-fns";
import Link from "next/link";
import { formatHours } from "@/lib/utils";
import { formatTimeLocal, localDateString } from "@/lib/time/zone";

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "timeEntries.read")) redirect("/admin");

  const t = await getTranslations("timeEntries");
  const tCommon = await getTranslations("common");
  const sp = await searchParams;

  // Mandanten-Filter: nur Mitarbeitende DIESES Tenants. Ohne diesen Filter
  // sehen User aller Mandanten alle Mitarbeitenden.
  const employees = await prisma.employee.findMany({
    where: {
      companyId: session.user.companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: [{ lastName: "asc" }],
  });

  const today = new Date();
  const fromStr = sp.from || format(startOfMonth(today), "yyyy-MM-dd");
  const toStr = sp.to || format(today, "yyyy-MM-dd");

  // employeeId aus Query-String IMMER gegen die geladene Liste validieren —
  // sonst könnte jemand mit einer fremden employeeId Stempelzeiten leaken.
  const validIds = new Set(employees.map((e) => e.id));
  const requestedId = sp.employeeId;
  const employeeId =
    requestedId && validIds.has(requestedId) ? requestedId : employees[0]?.id;

  const entries = employeeId
    ? await prisma.timeEntry.findMany({
        where: {
          employeeId,
          // Defense-in-Depth: zusätzlich gegen die Tenant-Kette filtern.
          employee: { companyId: session.user.companyId },
          workDate: {
            gte: new Date(`${fromStr}T00:00:00Z`),
            lte: new Date(`${toStr}T23:59:59Z`),
          },
        },
        include: {
          punches: { orderBy: { occurredAt: "asc" } },
          breaks: { orderBy: { startedAt: "asc" } },
        },
        orderBy: { workDate: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap gap-3 items-end" method="get">
            <div className="space-y-1">
              <label className="text-xs uppercase text-muted-foreground">{tCommon("name")}</label>
              <Select name="employeeId" defaultValue={employeeId}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName}, {e.firstName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase text-muted-foreground">{tCommon("from")}</label>
              <Input type="date" name="from" defaultValue={fromStr} />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase text-muted-foreground">{tCommon("to")}</label>
              <Input type="date" name="to" defaultValue={toStr} />
            </div>
            <Button type="submit">{tCommon("filter")}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tCommon("date")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead>{t("in")}</TableHead>
                <TableHead>{t("out")}</TableHead>
                <TableHead className="text-right">{t("breakStart")}</TableHead>
                <TableHead className="text-right">{tCommon("hours")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("noEntries")}
                  </TableCell>
                </TableRow>
              )}
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{localDateString(e.workDate)}</TableCell>
                  <TableCell>{e.status}</TableCell>
                  <TableCell>{e.firstIn ? formatTimeLocal(e.firstIn) : "—"}</TableCell>
                  <TableCell>{e.lastOut ? formatTimeLocal(e.lastOut) : "—"}</TableCell>
                  <TableCell className="text-right">{formatHours(e.breakMinutes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatHours(e.workedMinutes)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/time-entries/${e.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {tCommon("edit")}
                    </Link>
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
