import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import {
  loadDashboardKPIs,
  loadRecentInvoices,
  loadRecentOrders,
} from "@/lib/dashboard/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  detectLongWorkday,
  detectMissingBreak,
  detectMissingClockOut,
} from "@/lib/time/calc";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { formatTimeLocal, localDateString, ZONE } from "@/lib/time/zone";
import { formatHours, formatDateCH } from "@/lib/utils";
import { AutoRefresh } from "@/components/AutoRefresh";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  RecentInvoicesCard,
  RecentOrdersCard,
} from "@/components/dashboard/RecentLists";
import {
  Banknote,
  Receipt,
  ClipboardList,
  FileText,
  Users as UsersIcon,
  Coffee,
  AlertTriangle,
  Activity,
} from "lucide-react";

// Always render fresh; this page reflects the live state of the company.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHF_LARGE = (n: number) =>
  new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

interface EmployeeRow {
  id: string;
  name: string;
  number: string;
  status: "IN" | "OUT" | "BREAK" | "ABSENT";
  sinceLabel: string | null;
  todayWorkedMin: number;
  weekWorkedMin: number;
  weekBalanceMin: number;
  warnings: string[];
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const companyId = session.user.companyId;

  // Welche Rechte hat der User? Davon hängt ab, welche Cards wir laden + zeigen.
  const canSeeFinance = hasPermission(role, "invoices.read");
  const canSeeOrders = hasPermission(role, "orders.read");
  const canSeeQuotes = hasPermission(role, "quotes.read");
  const canSeeEmployees = hasPermission(role, "employees.read");

  // ─── Parallel laden: KPIs + Listen ────────────────────────────────
  const [kpis, recentOrders, recentInvoices, company] = await Promise.all([
    canSeeFinance || canSeeOrders || canSeeQuotes
      ? loadDashboardKPIs(companyId)
      : null,
    canSeeOrders ? loadRecentOrders(companyId, 5) : Promise.resolve([]),
    canSeeFinance ? loadRecentInvoices(companyId, 5) : Promise.resolve([]),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        maxDailyHours: true,
        highOvertimeHours: true,
      },
    }),
  ]);

  // ─── Werkstatt-Live: nur wenn employees.read ──────────────────────
  let employeeRows: EmployeeRow[] = [];
  let presentNow: EmployeeRow[] = [];
  let onBreak: EmployeeRow[] = [];
  let allWarnings: { name: string; key: string; employeeId: string }[] = [];

  if (canSeeEmployees) {
    const employees = await prisma.employee.findMany({
      where: { companyId, isActive: true, archivedAt: null, deletedAt: null },
      orderBy: [{ firstName: "asc" }],
    });
    const todayDateStr = localDateString(new Date());

    employeeRows = await Promise.all(
      employees.map(async (e) => {
        const summary = await getEmployeeKioskSummary(e.id, undefined, {
          expectedCompanyId: companyId,
        });
        const todayStat = summary.today;
        let status: EmployeeRow["status"] = "OUT";
        if (todayStat?.absence) status = "ABSENT";
        else if (todayStat?.isOnBreak) status = "BREAK";
        else if (todayStat?.isOpen) status = "IN";

        const todayEntry = await prisma.timeEntry.findUnique({
          where: {
            employeeId_workDate: {
              employeeId: e.id,
              workDate: new Date(`${todayDateStr}T00:00:00.000Z`),
            },
          },
        });
        let sinceLabel: string | null = null;
        if (todayEntry?.firstIn && (status === "IN" || status === "BREAK")) {
          sinceLabel = formatTimeLocal(todayEntry.firstIn);
        } else if (todayEntry?.lastOut && status === "OUT") {
          sinceLabel = `bis ${formatTimeLocal(todayEntry.lastOut)}`;
        }

        const warnings: string[] = [];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yPunches = await prisma.timePunch.findMany({
          where: {
            employeeId: e.id,
            occurredAt: {
              gte: new Date(yesterday.setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { occurredAt: "asc" },
        });
        if (
          detectMissingClockOut(
            yPunches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
          )
        ) {
          warnings.push("missingClockOut");
        }
        const todayWorked = todayStat?.workedMinutes ?? 0;
        const todayBreak = todayStat?.breakMinutes ?? 0;
        if (detectLongWorkday(todayWorked, (company?.maxDailyHours ?? 10) * 60)) {
          warnings.push("longWorkday");
        }
        if (detectMissingBreak(todayWorked, todayBreak)) {
          warnings.push("missingBreak");
        }
        if (
          summary.weekTotals.balanceMinutes <=
          -((company?.highOvertimeHours ?? 40) * 60)
        ) {
          warnings.push("highNegative");
        }
        if (
          summary.weekTotals.balanceMinutes >=
          (company?.highOvertimeHours ?? 40) * 60
        ) {
          warnings.push("highOvertime");
        }

        return {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          number: e.employeeNumber,
          status,
          sinceLabel,
          todayWorkedMin: todayWorked,
          weekWorkedMin: summary.weekTotals.workedMinutes,
          weekBalanceMin: summary.weekTotals.balanceMinutes,
          warnings,
        };
      }),
    );

    presentNow = employeeRows.filter((r) => r.status === "IN");
    onBreak = employeeRows.filter((r) => r.status === "BREAK");
    allWarnings = employeeRows.flatMap((r) =>
      r.warnings.map((w) => ({ name: r.name, key: w, employeeId: r.id })),
    );
  }

  const refreshedAt = formatTimeLocal(new Date());
  const monthLabel = new Date().toLocaleDateString("de-CH", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={15_000} />

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            {company?.name ?? "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stand: {refreshedAt} ({ZONE}) · Auto-Refresh alle 15 s
          </p>
        </div>
      </div>

      {/* ─── Block 1: Geschäfts-KPIs ─────────────────────────────── */}
      {kpis && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
            Geschäft — {monthLabel}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {canSeeFinance && (
              <KpiCard
                label="Umsatz Monat"
                value={CHF_LARGE(kpis.revenueThisMonthNet)}
                icon={Banknote}
                tone="emerald"
                trendPct={kpis.revenueTrendPct}
                subline={
                  kpis.revenueTrendPct != null
                    ? `vs. ${CHF_LARGE(kpis.revenuePrevMonthNet)} Vormonat`
                    : "kein Vormonats-Vergleich"
                }
              />
            )}
            {canSeeFinance && (
              <KpiCard
                label="Offene Forderungen"
                value={CHF_LARGE(kpis.outstandingGrossCHF)}
                icon={Receipt}
                tone={kpis.overdueCount > 0 ? "rose" : "blue"}
                subline={
                  kpis.outstandingCount === 0
                    ? "alle Rechnungen bezahlt"
                    : kpis.overdueCount > 0
                      ? `${kpis.outstandingCount} offen, davon ${kpis.overdueCount} überfällig`
                      : `${kpis.outstandingCount} offen`
                }
              />
            )}
            {canSeeOrders && (
              <KpiCard
                label="Aktive Aufträge"
                value={String(kpis.activeOrdersCount)}
                icon={ClipboardList}
                tone="blue"
                subline={
                  kpis.activeOrdersCount === 0
                    ? "keine aktiven Aufträge"
                    : `${kpis.activeOrdersInProgress} in Arbeit · ${kpis.activeOrdersConfirmed} bestätigt`
                }
                trendPct={
                  kpis.ordersPrevMonth > 0
                    ? ((kpis.ordersThisMonth - kpis.ordersPrevMonth) /
                        kpis.ordersPrevMonth) *
                      100
                    : null
                }
              />
            )}
            {canSeeQuotes && (
              <KpiCard
                label="Offerten im Umlauf"
                value={String(kpis.openQuotesCount)}
                icon={FileText}
                tone="purple"
                subline={
                  kpis.openQuotesCount === 0
                    ? "keine offenen Offerten"
                    : `Gesamtwert ${CHF_LARGE(kpis.openQuotesNetCHF)}`
                }
              />
            )}
          </div>
        </section>
      )}

      {/* ─── Block 2: Werkstatt-Live ─────────────────────────────── */}
      {canSeeEmployees && employeeRows.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
            Werkstatt heute
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Eingestempelt"
              value={String(presentNow.length)}
              icon={UsersIcon}
              tone="emerald"
              subline={
                presentNow.length === 0
                  ? "niemand aktuell anwesend"
                  : `von ${employeeRows.length} aktiven Mitarbeitern`
              }
            />
            <KpiCard
              label="In Pause"
              value={String(onBreak.length)}
              icon={Coffee}
              tone="amber"
            />
            <KpiCard
              label="Warnungen"
              value={String(allWarnings.length)}
              icon={AlertTriangle}
              tone={allWarnings.length > 0 ? "rose" : "slate"}
              subline={
                allWarnings.length === 0
                  ? "alles im grünen Bereich"
                  : "siehe unten"
              }
            />
            <KpiCard
              label="Heute total"
              value={formatHours(
                employeeRows.reduce((sum, r) => sum + r.todayWorkedMin, 0),
              )}
              icon={Activity}
              tone="blue"
              subline="geleistete Arbeitszeit"
            />
          </div>
        </section>
      )}

      {/* ─── Block 3: Letzte Aktivität (2-Spalten) ──────────────── */}
      {(canSeeOrders || canSeeFinance) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {canSeeOrders && <RecentOrdersCard rows={recentOrders} />}
          {canSeeFinance && <RecentInvoicesCard rows={recentInvoices} />}
        </section>
      )}

      {/* ─── Block 4: Warnungen-Liste (wenn vorhanden) ─────────── */}
      {canSeeEmployees && allWarnings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-habb-red" />
              Personal-Warnungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {allWarnings.map((w, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge
                    variant={w.key === "highOvertime" ? "info" : "warning"}
                  >
                    {warningLabel(w.key)}
                  </Badge>
                  <Link
                    href={`/admin/employees/${w.employeeId}`}
                    className="hover:underline"
                  >
                    {w.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ─── Block 5: Mitarbeiter-Tabelle (Original-Block, behalten) */}
      {canSeeEmployees && employeeRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Mitarbeiter — {formatDateCH(new Date())}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Seit</TableHead>
                  <TableHead className="text-right">Heute</TableHead>
                  <TableHead className="text-right">Woche</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/admin/employees/${r.id}`}
                        className="hover:underline"
                      >
                        <span className="font-medium">{r.name}</span>{" "}
                        <span className="text-muted-foreground text-xs">
                          #{r.number}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.sinceLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHours(r.todayWorkedMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHours(r.weekWorkedMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={
                          r.weekBalanceMin < 0
                            ? "text-habb-red"
                            : "text-habb-success"
                        }
                      >
                        {formatHours(r.weekBalanceMin, true)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Empty-State für Rollen ohne Sicht auf irgendwas ─────── */}
      {!canSeeFinance && !canSeeOrders && !canSeeQuotes && !canSeeEmployees && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Du hast aktuell keine Zugriffsrechte für die Dashboard-Ansicht.
            Wende dich an den Super-Admin.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function warningLabel(key: string): string {
  const labels: Record<string, string> = {
    missingClockOut: "Fehlende Ausstempelung",
    longWorkday: "Langer Arbeitstag",
    missingBreak: "Fehlende Pause",
    highOvertime: "Hohe Überstunden",
    highNegative: "Negativer Saldo",
  };
  return labels[key] ?? key;
}

function StatusBadge({
  status,
}: {
  status: "IN" | "OUT" | "BREAK" | "ABSENT";
}) {
  const map = {
    IN: { label: "Eingestempelt", variant: "success" as const },
    OUT: { label: "Ausgestempelt", variant: "secondary" as const },
    BREAK: { label: "In Pause", variant: "warning" as const },
    ABSENT: { label: "Abwesend", variant: "info" as const },
  }[status];
  return <Badge variant={map.variant}>{map.label}</Badge>;
}
