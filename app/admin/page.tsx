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
import {
  detectLongWorkday,
  detectMissingBreak,
  detectMissingClockOut,
} from "@/lib/time/calc";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { formatTimeLocal, localDateString } from "@/lib/time/zone";
import { formatHours } from "@/lib/utils";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getCompanyLocale } from "@/lib/company-context";
import { formatCurrencyLarge } from "@/lib/format-currency";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  RecentInvoicesCard,
  RecentOrdersCard,
} from "@/components/dashboard/RecentLists";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  Clock,
  FileText,
  Plus,
  Receipt,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Currency formatter is now dynamic — see `companyLocale` below.

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
  const companyLocale = await getCompanyLocale(companyId);
  const fmtLarge = (n: number) => formatCurrencyLarge(n, companyLocale.currency, companyLocale.locale);

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
      select: {
        name: true,
        maxDailyHours: true,
        highOvertimeHours: true,
      },
    }),
  ]);

  let employeeRows: EmployeeRow[] = [];
  let presentNow: EmployeeRow[] = [];
  let onBreak: EmployeeRow[] = [];
  let allWarnings: { name: string; key: string; employeeId: string }[] = [];

  if (canSeeEmployees) {
    const employees = await prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [{ firstName: "asc" }],
    });

    const todayDateStr = localDateString(new Date(), companyLocale.timezone);

    employeeRows = await Promise.all(
      employees.map(async (e) => {
        const summary = await getEmployeeKioskSummary(e.id, undefined, {
          expectedCompanyId: companyId,
        });

        const todayStat = summary.today;

        let status: EmployeeRow["status"] = "OUT";

        if (todayStat?.absence) {
          status = "ABSENT";
        } else if (todayStat?.isOnBreak) {
          status = "BREAK";
        } else if (todayStat?.isOpen) {
          status = "IN";
        }

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
          sinceLabel = formatTimeLocal(todayEntry.firstIn, companyLocale.timezone);
        } else if (todayEntry?.lastOut && status === "OUT") {
          sinceLabel = `until ${formatTimeLocal(todayEntry.lastOut, companyLocale.timezone)}`;
        }

        const warnings: string[] = [];

        const yesterdayStart = new Date();
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const yPunches = await prisma.timePunch.findMany({
          where: {
            employeeId: e.id,
            occurredAt: {
              gte: yesterdayStart,
              lt: todayStart,
            },
          },
          orderBy: { occurredAt: "asc" },
        });

        if (
          detectMissingClockOut(
            yPunches.map((p) => ({
              type: p.type,
              occurredAt: p.occurredAt,
            })),
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
      r.warnings.map((w) => ({
        name: r.name,
        key: w,
        employeeId: r.id,
      })),
    );
  }

  const refreshedAt = formatTimeLocal(new Date(), companyLocale.timezone);

  return (
    <div className="space-y-7">
      <AutoRefresh intervalMs={15_000} />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-habb-ink dark:text-white">
            {company?.name ?? "Dashboard"}
          </h1>

          <div className="mt-2 flex items-center gap-2 text-xs text-habb-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            <span>
              Live · As of {refreshedAt} ({companyLocale.timezone}) · Auto-refresh 15s
            </span>
          </div>
        </div>
      </header>

      {(canSeeQuotes ||
        canSeeOrders ||
        canSeeFinance ||
        hasPermission(role, "customers.write")) && (
        <div className="flex flex-wrap items-center gap-2">
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
            <QuickAction
              href="/admin/customers/new"
              label="New Customer"
              primary
            />
          )}
        </div>
      )}

      {canSeeEmployees && employeeRows.length > 0 && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-xl border border-habb-line bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-habb-muted">
                Workshop today
              </h2>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <WorkshopStat
                label="Clocked in"
                value={String(presentNow.length)}
              />

              <WorkshopStat
                label="On break"
                value={String(onBreak.length)}
              />

              <WorkshopStat
                label="Total team"
                value={String(employeeRows.length)}
              />

              <WorkshopStat
                label="Hours today"
                value={formatHours(
                  employeeRows.reduce(
                    (sum, r) => sum + r.todayWorkedMin,
                    0,
                  ),
                )}
              />
            </div>
          </div>

          <div
            className={`rounded-xl border p-5 shadow-sm ${
              allWarnings.length > 0
                ? "border-orange-200 bg-orange-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              {allWarnings.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-orange-700" />
              ) : (
                <Zap className="h-4 w-4 text-emerald-700" />
              )}

              <h2
                className={`text-sm font-semibold ${
                  allWarnings.length > 0
                    ? "text-orange-800"
                    : "text-emerald-800"
                }`}
              >
                Warnings — {allWarnings.length}
              </h2>
            </div>

            <p
              className={`text-3xl font-bold tabular-nums ${
                allWarnings.length > 0
                  ? "text-orange-800"
                  : "text-emerald-800"
              }`}
            >
              {allWarnings.length}
            </p>

            {allWarnings.length === 0 ? (
              <p className="mt-2 text-xs text-emerald-700">
                All good — no issues
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {allWarnings.slice(0, 4).map((w, i) => (
                  <Link
                    key={`${w.employeeId}-${w.key}-${i}`}
                    href={`/admin/attendance/${w.employeeId}/sheet`}
                    className="flex items-center justify-between gap-3 text-xs text-orange-800 hover:underline"
                  >
                    <span className="font-semibold">{w.name}</span>
                    <span>{warningLabel(w.key)}</span>
                  </Link>
                ))}

                {allWarnings.length > 4 && (
                  <p className="text-xs text-orange-700">
                    +{allWarnings.length - 4} more
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {kpis && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-habb-muted">
            Business overview
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canSeeFinance && (
              <KpiCard
                label="Revenue this month"
                value={fmtLarge(kpis.revenueThisMonthNet)}
                icon={Banknote}
                tone="emerald"
                trendPct={kpis.revenueTrendPct}
                subline={
                  kpis.revenueTrendPct != null
                    ? `vs. ${fmtLarge(kpis.revenuePrevMonthNet)} last month`
                    : "No previous month comparison"
                }
              />
            )}

            {canSeeFinance && (
              <KpiCard
                label="Open receivables"
                value={fmtLarge(kpis.outstandingGrossCHF)}
                icon={Receipt}
                tone={kpis.overdueCount > 0 ? "rose" : "blue"}
                badgeLabel={
                  kpis.outstandingCount === 0
                    ? "✓ Paid"
                    : kpis.overdueCount > 0
                      ? `${kpis.overdueCount} overdue`
                      : `${kpis.outstandingCount} open`
                }
                badgeTone={
                  kpis.outstandingCount === 0
                    ? "success"
                    : kpis.overdueCount > 0
                      ? "danger"
                      : "neutral"
                }
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
                trendPct={
                  kpis.ordersPrevMonth > 0
                    ? ((kpis.ordersThisMonth - kpis.ordersPrevMonth) /
                        kpis.ordersPrevMonth) *
                      100
                    : null
                }
                subline={
                  kpis.activeOrdersCount === 0
                    ? "No active orders"
                    : `${kpis.activeOrdersInProgress} in progress · ${kpis.activeOrdersConfirmed} confirmed`
                }
              />
            )}

            {canSeeQuotes && (
              <KpiCard
                label="Open quotes"
                value={String(kpis.openQuotesCount)}
                icon={FileText}
                tone="purple"
                badgeLabel="—"
                subline={
                  kpis.openQuotesCount === 0
                    ? "No open quotes"
                    : `Total value ${fmtLarge(kpis.openQuotesNetCHF)}`
                }
              />
            )}
          </div>
        </section>
      )}

      {(canSeeOrders || canSeeFinance) && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-habb-muted">
            Recent activity
          </h2>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {canSeeOrders && <RecentOrdersCard rows={recentOrders} currency={companyLocale.currency} locale={companyLocale.locale} />}

            {canSeeFinance && <RecentInvoicesCard rows={recentInvoices} currency={companyLocale.currency} locale={companyLocale.locale} />}
          </div>
        </section>
      )}

      {!canSeeFinance && !canSeeOrders && !canSeeQuotes && !canSeeEmployees && (
        <div className="rounded-xl border border-habb-line bg-white p-12 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-habb-paper dark:bg-neutral-900">
            <Clock className="h-6 w-6 text-habb-muted" />
          </div>

          <p className="text-sm text-habb-muted">
            You currently have no access rights for the dashboard view. Contact
            the super-admin.
          </p>
        </div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center gap-1.5 rounded-lg bg-habb-red px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-habb-red-dark"
          : "inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-habb-ink transition-colors hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
      }
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function WorkshopStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xl font-bold leading-none tracking-tight text-habb-ink tabular-nums dark:text-white">
        {value}
      </p>

      <p className="mt-2 text-xs text-habb-muted">{label}</p>
    </div>
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