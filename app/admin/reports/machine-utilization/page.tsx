import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { loadMachineUtilization } from "@/lib/reports/erp/machine-utilization";
import { machineLabel } from "@/lib/order/labels";
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
function utilizationColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-habb-line";
}

export default async function MachineUtilizationPage({
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

  const report = await loadMachineUtilization({
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
            <ArrowLeft className="h-3 w-3 mr-1" /> zurück
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Maschinen-Auslastung</h1>
          <p className="text-sm text-muted-foreground">
            Gebuchte vs. verfügbare Stunden pro Maschine.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/admin/reports/erp/machine-utilization.xlsx?from=${fromIso}&to=${toIso}`}
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
            <div className="text-xs text-muted-foreground">Verfügbar gesamt</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {fmtHours(report.totals.availableMinutes)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Gebucht gesamt</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {fmtHours(report.totals.bookedMinutes)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Auslastung gesamt</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {report.totals.utilizationPct.toFixed(1)} %
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${utilizationColor(report.totals.utilizationPct)}`}
                style={{ width: `${Math.min(100, report.totals.utilizationPct)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pro Maschine</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine aktiven Maschinen in dieser Firma.
            </p>
          ) : (
            <div className="space-y-3">
              {report.rows.map((r) => (
                <div
                  key={r.machineId}
                  className="border rounded-lg p-3 bg-card hover:bg-muted/20 transition"
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-semibold">{r.machineName}</div>
                      <div className="text-xs text-muted-foreground">
                        {machineLabel(r.machineType)} · {r.bookingCount} Buchung(en)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold tabular-nums">
                        {r.utilizationPct.toFixed(1)} %
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {fmtHours(r.bookedMinutes)} / {fmtHours(r.availableMinutes)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${utilizationColor(r.utilizationPct)} transition-all`}
                      style={{ width: `${Math.min(100, r.utilizationPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Verfügbare Stunden = Working-Hours der Maschine ∩ Periode, abzüglich
        Feiertage und Wartungsfenster. Buchungen werden auf die Periode geclamped
        falls sie über den Range hinausgehen.
      </p>
    </div>
  );
}
