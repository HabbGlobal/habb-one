import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { loadEmployeeProductivity } from "@/lib/reports/erp/employee-productivity";
import { PeriodFilter } from "../PeriodFilter";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function fmtHours(min: number): string {
  return `${(min / 60).toFixed(1)} h`;
}
function quotaColor(pct: number): string {
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 50) return "text-amber-700";
  return "text-destructive";
}

export default async function EmployeeProductivityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports.export")) redirect("/admin");

  const sp = await searchParams;
  const fromIso = sp.from ?? thirtyDaysAgoIso();
  const toIso = sp.to ?? todayIso();
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T23:59:59.999Z`);

  const report = await loadEmployeeProductivity({
    prisma,
    companyId: session.user.companyId,
    from,
    to,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/admin/reports"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> back
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Employee Productivity</h1>
          <p className="text-sm text-muted-foreground">
            Scan-based hours per employee, of which billable.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/admin/reports/erp/employee-productivity.xlsx?from=${fromIso}&to=${toIso}`}
          >
            <Download className="h-4 w-4 mr-1" /> Excel-Export
          </a>
        </Button>
      </div>

      <PeriodFilter defaultFrom={fromIso} defaultTo={toIso} />

      {/* Summen */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Scan-Stunden gesamt</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {fmtHours(report.totals.totalMinutes)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Davon billable</div>
            <div className="text-2xl font-semibold tabular-nums mt-1 text-emerald-700">
              {fmtHours(report.totals.billableMinutes)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Billable-Quote</div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${quotaColor(report.totals.billableQuotaPct)}`}>
              {report.totals.billableQuotaPct.toFixed(1)} %
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {report.totals.employeeCount} active employees
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per Employee</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-12">Nr.</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-right px-3 py-2 w-20">Schritte</th>
                  <th className="text-right px-3 py-2 w-24">Total</th>
                  <th className="text-right px-3 py-2 w-24">Billable</th>
                  <th className="text-right px-3 py-2 w-24">Quote</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.employeeId} className="border-b">
                    <td className="px-3 py-2 font-mono tabular-nums text-xs">
                      {r.employeeNumber}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.lastName}, {r.firstName}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.stepCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtHours(r.totalMinutes)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {fmtHours(r.billableMinutes)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${quotaColor(r.billableQuotaPct)}`}
                    >
                      {r.totalMinutes === 0 ? "—" : `${r.billableQuotaPct.toFixed(0)} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {report.rows.reduce((s, r) => s + r.stepCount, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtHours(report.totals.totalMinutes)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {fmtHours(report.totals.billableMinutes)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${quotaColor(report.totals.billableQuotaPct)}`}
                  >
                    {report.totals.billableQuotaPct.toFixed(1)} %
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Total-Stunden = Σ Scan-Intervalle (Pause-clean). Billable = Schritte deren Order
        nicht <em>storniert</em> ist UND deren Verrechnungs-Quelle nicht
        <em> Schätzung</em> ist (also ACTUAL oder MANUAL).
      </p>
    </div>
  );
}
