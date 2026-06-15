import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download } from "lucide-react";
import { loadAllParams } from "@/lib/domain/parameters/store";
import { loadCalculationAccuracy } from "@/lib/reports/erp/calculation";
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

function fmtMin(min: number | null): string {
  if (min == null) return "—";
  const h = min / 60;
  if (h < 10) return `${h.toFixed(1)} h`;
  return `${Math.round(h)} h`;
}
function fmtCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "short" }).format(d);
}
function fmtPct(p: number | null): string {
  if (p == null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)} %`;
}

function pctColor(p: number | null): string {
  if (p == null) return "text-muted-foreground";
  if (Math.abs(p) <= 10) return "text-emerald-700";
  if (Math.abs(p) <= 25) return "text-amber-700";
  return "text-destructive";
}

export default async function CalculationReportPage({
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

  const params = await loadAllParams(prisma, session.user.companyId);
  const report = await loadCalculationAccuracy({
    prisma,
    companyId: session.user.companyId,
    from,
    to,
    params,
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
          <h1 className="text-2xl font-semibold mt-1">Calculation Accuracy</h1>
          <p className="text-sm text-muted-foreground">
            Estimate vs. Actual vs. Billed — per order, with deviations.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/admin/reports/erp/calculation.xlsx?from=${fromIso}&to=${toIso}`}>
            <Download className="h-4 w-4 mr-1" /> Excel-Export
          </a>
        </Button>
      </div>

      <PeriodFilter defaultFrom={fromIso} defaultTo={toIso} />

      {/* Summen-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Orders" value={String(report.rows.length)} />
        <SummaryCard
          label="Estimate"
          value={fmtMin(report.totals.estimatedMinutes)}
          sub={fmtCHF(report.totals.estimatedCHF)}
        />
        <SummaryCard
          label="Actual (Scans)"
          value={fmtMin(report.totals.actualMinutes)}
          sub={
            report.totals.actualMinutes == null
              ? "incomplete"
              : undefined
          }
        />
        <SummaryCard
          label="Billed"
          value={fmtMin(report.totals.billedMinutes)}
          sub={fmtCHF(report.totals.billedCHF)}
          accent={`Abw. ${fmtPct(report.totals.weightedDeviationPct)}`}
          accentColor={pctColor(report.totals.weightedDeviationPct)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders in the period</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              No orders in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Customer</th>
                    <th className="text-left px-3 py-2">Due</th>
                    <th className="text-right px-3 py-2">Est.</th>
                    <th className="text-right px-3 py-2">Actual</th>
                    <th className="text-right px-3 py-2">Billed</th>
                    <th className="text-right px-3 py-2">Δ Actual</th>
                    <th className="text-right px-3 py-2">Δ Billed</th>
                    <th className="text-right px-3 py-2">Billed CHF</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.orderId} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/orders/${r.orderId}`}
                          className="font-mono tabular-nums hover:underline"
                        >
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {fmtDate(r.promisedAt)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtMin(r.estimatedMinutes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtMin(r.actualMinutes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                        {fmtMin(r.billedMinutes)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-xs ${pctColor(r.deviationActualVsEstimatedPct)}`}
                      >
                        {fmtPct(r.deviationActualVsEstimatedPct)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-xs ${pctColor(r.deviationBilledVsEstimatedPct)}`}
                      >
                        {fmtPct(r.deviationBilledVsEstimatedPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtCHF(r.billedCHF)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-medium">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      Total ({report.rows.length})
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMin(report.totals.estimatedMinutes)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMin(report.totals.actualMinutes)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {fmtMin(report.totals.billedMinutes)}
                    </td>
                    <td className="px-3 py-2"></td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums text-xs ${pctColor(report.totals.weightedDeviationPct)}`}
                    >
                      {fmtPct(report.totals.weightedDeviationPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCHF(report.totals.billedCHF)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[10px]">Note</Badge>
        {" "}Orders are listed when their delivery date, completion, or delivery
        falls within the selected period. CHF values are based on the current
        employee hourly rate (system parameter).
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
  accentColor = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  accentColor?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
        {sub && (
          <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{sub}</div>
        )}
        {accent && (
          <div className={`text-xs font-medium tabular-nums mt-0.5 ${accentColor}`}>
            {accent}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
