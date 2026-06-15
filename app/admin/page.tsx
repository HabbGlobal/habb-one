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
  Plus,
  ArrowUpRight,
  Clock,
  Zap,
} from "lucide-react";

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

  const canSeeFinance = hasPermission(role, "invoices.read");
  const canSeeOrders = hasPermission(role, "orders.read");
  const canSeeQuotes = hasPermission(role, "quotes.read");
  const canSeeEmployees = hasPermission(role, "employees.read");

  const [kpis, recentOrders, recentInvoices, company] = await Promise.all([
    canSeeFinance || canSeeOrders || canSeeQuotes
      ? loadDashboardKPIs(companyId)
      : null,
    canSeeOrders ? loadRecentOrders(companyId, 5) : Promise.resolve([]),
    canSeeFinance ? loadRecentInvoices(companyId, 5) : Promise.resolve([]),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, maxDailyHours: true, highOvertimeHours: true },
    }),
  ]);

  // Workshop live data
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
          sinceLabel = `until ${formatTimeLocal(todayEntry.lastOut)}`;
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
        if (detectMissingClockOut(yPunches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })))) {
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
        if (summary.weekTotals.balanceMinutes <= -((company?.highOvertimeHours ?? 40) * 60)) {
          warnings.push("highNegative");
        }
        if (summary.weekTotals.balanceMinutes >= (company?.highOvertimeHours ?? 40) * 60) {
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

  return (
    <div className="space-y-8">
      <AutoRefresh intervalMs={15_000} />

      {/* ── Header with Quick Actions ───────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {company?.name ?? "Dashboard"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <p className="text-sm text-muted-foreground">
              Live · As of {refreshedAt} ({ZONE}) · Auto-refresh 15s
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canSeeQuotes && hasPermission(role, "quotes.write") && (
            <QuickAction href="/admin/quotes/new" label="New Quote" />
          )}
          {canSeeOrders && hasPermission(role, "orders.write") && (
            <QuickAction href="/admin/orders/new" label="New Order" />
          )}
          {canSeeFinance && hasPermission(role, "invoices.write") && (
            <QuickAction href="/admin/invoices/new" label="New Invoice" />
          )}
          {hasPermission(role, "customers.write") && (
            <QuickAction href="/admin/customers/new" label="New Customer" />
          )}
        </div>
      </header>

      {/* ── Top Row: Workshop Live + Warnings ──────────────────── */}
      {canSeeEmployees && employeeRows.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Workshop Today — Hero Card */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Workshop Today</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-3xl font-bold tabular-nums">{presentNow.length}</p>
                  <p className="text-sm text-slate-400 mt-1">Clocked in</p>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums">{onBreak.length}</p>
                  <p className="text-sm text-slate-400 mt-1">On break</p>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums">{employeeRows.length}</p>
                  <p className="text-sm text-slate-400 mt-1">Total team</p>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums">
                    {formatHours(employeeRows.reduce((sum, r) => sum + r.todayWorkedMin, 0))}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">Hours today</p>
                </div>
              </div>
            </div>
          </div>

          {/* Warnings Card */}
          <div className={`rounded-2xl p-6 shadow-sm ${
            allWarnings.length > 0
              ? "bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200"
              : "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200"
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-xl ${allWarnings.length > 0 ? "bg-rose-100" : "bg-emerald-100"}`}>
                {allWarnings.length > 0
                  ? <AlertTriangle className="h-5 w-5 text-rose-600" />
                  : <Zap className="h-5 w-5 text-emerald-600" />
                }
              </div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Warnings</h2>
            </div>
            <p className={`text-4xl font-bold ${allWarnings.length > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {allWarnings.length}
            </p>
            <p className={`text-sm mt-2 ${allWarnings.length > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {allWarnings.length === 0 ? "All good — no issues" : "Check details below"}
            </p>
            {allWarnings.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {allWarnings.slice(0, 4).map((w, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-rose-700">
                    <span className="h-1 w-1 rounded-full bg-rose-400" />
                    <span className="font-medium">{w.name}:</span>
                    <span>{warningLabel(w.key)}</span>
                  </li>
                ))}
                {allWarnings.length > 4 && (
                  <li className="text-xs text-rose-500">+{allWarnings.length - 4} more</li>
                )}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ── Business KPIs ──────────────────────────────────────── */}
      {kpis && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">
            Business Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {canSeeFinance && (
              <KpiCard
                label="Revenue this month"
                value={CHF_LARGE(kpis.revenueThisMonthNet)}
                icon={Banknote}
                tone="emerald"
                trendPct={kpis.revenueTrendPct}
                subline={
                  kpis.revenueTrendPct != null
                    ? `vs. ${CHF_LARGE(kpis.revenuePrevMonthNet)} last month`
                    : "no previous month comparison"
                }
              />
            )}
            {canSeeFinance && (
              <KpiCard
                label="Open receivables"
                value={CHF_LARGE(kpis.outstandingGrossCHF)}
                icon={Receipt}
                tone={kpis.overdueCount > 0 ? "rose" : "blue"}
                subline={
                  kpis.outstandingCount === 0
                    ? "All paid"
                    : kpis.overdueCount > 0
                      ? `${kpis.outstandingCount} open, ${kpis.overdueCount} overdue`
                      : `${kpis.outstandingCount} open`
                }
              />
            )}
            {canSeeOrders && (
              <KpiCard
                label="Active orders"
                value={String(kpis.activeOrdersCount)}
                icon={ClipboardList}
                tone="blue"
                subline={
                  kpis.activeOrdersCount === 0
                    ? "No active orders"
                    : `${kpis.activeOrdersInProgress} in progress · ${kpis.activeOrdersConfirmed} confirmed`
                }
                trendPct={
                  kpis.ordersPrevMonth > 0
                    ? ((kpis.ordersThisMonth - kpis.ordersPrevMonth) / kpis.ordersPrevMonth) * 100
                    : null
                }
              />
            )}
            {canSeeQuotes && (
              <KpiCard
                label="Open quotes"
                value={String(kpis.openQuotesCount)}
                icon={FileText}
                tone="purple"
                subline={
                  kpis.openQuotesCount === 0
                    ? "No open quotes"
                    : `Total value ${CHF_LARGE(kpis.openQuotesNetCHF)}`
                }
              />
            )}
          </div>
        </section>
      )}

      {/* ── Recent Activity ────────────────────────────────────── */}
      {(canSeeOrders || canSeeFinance) && (
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">
            Recent Activity
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {canSeeOrders && <RecentOrdersCard rows={recentOrders} />}
            {canSeeFinance && <RecentInvoicesCard rows={recentInvoices} />}
          </div>
        </section>
      )}

      {/* ── Employee Table ─────────────────────────────────────── */}
      {canSeeEmployees && employeeRows.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Employees — {formatDateCH(new Date())}
            </h2>
            <Link
              href="/admin/attendance"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              Attendance <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-2xl border-0 bg-white/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Since</TableHead>
                  <TableHead className="text-right font-semibold">Today</TableHead>
                  <TableHead className="text-right font-semibold">Week</TableHead>
                  <TableHead className="text-right font-semibold">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeRows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      <Link href={`/admin/attendance/${r.id}/sheet`} className="hover:underline">
                        <span className="font-medium">{r.name}</span>{" "}
                        <span className="text-muted-foreground text-xs">#{r.number}</span>
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {r.sinceLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatHours(r.todayWorkedMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatHours(r.weekWorkedMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={r.weekBalanceMin < 0 ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"}>
                        {formatHours(r.weekBalanceMin, true)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!canSeeFinance && !canSeeOrders && !canSeeQuotes && !canSeeEmployees && (
        <div className="rounded-2xl bg-white/80 backdrop-blur-sm shadow-sm p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            You currently have no access rights for the dashboard view. Contact the super-admin.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs font-medium shadow-sm hover:bg-foreground/90 transition-colors"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function warningLabel(key: string): string {
  const labels: Record<string, string> = {
    missingClockOut: "Missing clock-out",
    longWorkday: "Long workday",
    missingBreak: "Missing break",
    highOvertime: "High overtime",
    highNegative: "Negative balance",
  };
  return labels[key] ?? key;
}

function StatusBadge({ status }: { status: "IN" | "OUT" | "BREAK" | "ABSENT" }) {
  const styles = {
    IN: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    OUT: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
    BREAK: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    ABSENT: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  }[status];

  const labels = {
    IN: "Clocked In",
    OUT: "Clocked Out",
    BREAK: "On Break",
    ABSENT: "Absent",
  }[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {status === "IN" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {labels}
    </span>
  );
}
