import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { ParameterTable, type ParameterRowData } from "./ParameterTable";

export const dynamic = "force-dynamic";

export default async function ParametersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "parameters.read")) redirect("/admin");

  const canWrite = hasPermission(session.user.role, "parameters.write");

  const params = await prisma.systemParameter.findMany({
    where: { companyId: session.user.companyId },
    include: {
      changeLogs: {
        orderBy: { effectiveAt: "desc" },
        take: 10,
        include: { changedBy: { select: { name: true } } },
      },
      updatedBy: { select: { name: true } },
    },
    orderBy: [{ category: "asc" }, { subCategory: "asc" }, { key: "asc" }],
  });

  const rows: ParameterRowData[] = params.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    unit: p.unit,
    currentValue: p.currentValue,
    defaultValue: p.defaultValue,
    minValue: p.minValue?.toString() ?? null,
    maxValue: p.maxValue?.toString() ?? null,
    step: p.step?.toString() ?? null,
    valueType: p.valueType,
    category: p.category,
    subCategory: p.subCategory,
    lastChangedAt: p.changeLogs[0]?.effectiveAt ?? p.updatedAt,
    lastChangedBy:
      p.changeLogs[0]?.changedBy.name ?? p.updatedBy.name ?? null,
    historyCount: p.changeLogs.length,
    history: p.changeLogs.map((cl) => ({
      id: cl.id,
      oldValue: cl.oldValue,
      newValue: cl.newValue,
      reason: cl.reason,
      changedBy: cl.changedBy.name,
      effectiveAt: cl.effectiveAt,
    })),
    allRows: params.map((q) => ({ key: q.key, currentValue: q.currentValue })),
  }));

  // Recent changes across all parameters (last 30 days, max 50) — pro Mandant.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentChanges = await prisma.parameterChangeLog.findMany({
    where: {
      effectiveAt: { gte: since },
      parameterCompanyId: session.user.companyId,
    },
    include: {
      parameter: { select: { label: true, unit: true } },
      changedBy: { select: { name: true } },
    },
    orderBy: { effectiveAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">System-Parameter</h1>
          <p className="text-sm text-muted-foreground">
            Zeit-, Temperatur-, Faktor- und Preisparameter — wirkt sofort auf
            DRAFT-Aufträge, eingefroren bei CONFIRMED+ via Snapshot.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/parameters/export.xlsx">
              <Download className="h-4 w-4 mr-2" />
              Excel-Export
            </a>
          </Button>
        </div>
      </div>

      {!canWrite && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 text-sm text-amber-900">
            Du siehst Parameter nur lesend. Änderungen sind dem ADMIN
            (CEO/Geschäftsleitung) vorbehalten.
          </CardContent>
        </Card>
      )}

      <ParameterTable rows={rows} canWrite={canWrite} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Letzte 30 Tage Änderungen</CardTitle>
        </CardHeader>
        <CardContent>
          {recentChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Parameter-Änderungen in den letzten 30 Tagen.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {recentChanges.map((c) => (
                <li key={c.id} className="py-2 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Intl.DateTimeFormat("de-CH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(c.effectiveAt)}
                  </span>
                  <span className="font-medium">{c.parameter.label}</span>
                  <span className="font-mono text-xs">
                    {c.oldValue}
                    {c.parameter.unit ? ` ${c.parameter.unit}` : ""}{" "}→{" "}
                    <strong>{c.newValue}{c.parameter.unit ? ` ${c.parameter.unit}` : ""}</strong>
                  </span>
                  <span className="text-xs text-muted-foreground italic">
                    „{c.reason}&ldquo;
                  </span>
                  <span className="text-xs text-muted-foreground">— {c.changedBy.name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
