import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CorrectionForm } from "./CorrectionForm";
import { DeletePunchButton } from "./DeletePunchButton";
import { formatDateTimeLocal, formatTimeLocal, localDateString } from "@/lib/time/zone";
import { formatHours } from "@/lib/utils";
import Link from "next/link";

export default async function TimeEntryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "timeEntries.read")) redirect("/admin");

  const { id } = await params;
  const t = await getTranslations("timeEntries");
  const tCommon = await getTranslations("common");

  // Tenant filter via FK chain: only find the entry if the associated
  // employee belongs to the session company. Otherwise 404 — no cross-tenant
  // view of time entries.
  const entry = await prisma.timeEntry.findFirst({
    where: {
      id,
      employee: { companyId: session.user.companyId },
    },
    include: {
      employee: true,
      punches: { orderBy: { occurredAt: "asc" } },
      breaks: { orderBy: { startedAt: "asc" } },
    },
  });
  if (!entry) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {entry.employee.lastName}, {entry.employee.firstName}
          </h1>
          <p className="text-muted-foreground">{localDateString(entry.workDate)}</p>
        </div>
        <Link href="/admin/time-entries" className="text-sm text-muted-foreground hover:underline">
          ← {tCommon("back")}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label={tCommon("status")} value={entry.status} />
        <Stat label={t("in")} value={entry.firstIn ? formatTimeLocal(entry.firstIn) : "—"} />
        <Stat label={t("out")} value={entry.lastOut ? formatTimeLocal(entry.lastOut) : "—"} />
        <Stat label={tCommon("hours")} value={formatHours(entry.workedMinutes)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Time Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("punchType")}</TableHead>
                <TableHead>{t("occurredAt")}</TableHead>
                <TableHead>Source</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.punches.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{formatDateTimeLocal(p.occurredAt)}</TableCell>
                  <TableCell>{p.source}</TableCell>
                  <TableCell>
                    <DeletePunchButton punchId={p.id} timeEntryId={entry.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("addPunch")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CorrectionForm timeEntryId={entry.id} employeeId={entry.employeeId} workDate={localDateString(entry.workDate)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
