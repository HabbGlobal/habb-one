// Dashboard-KPI-Aggregator. Liest die wichtigsten Geschäfts-Kennzahlen aus
// der DB. Alle Queries werden parallel gefahren — die Page-Komponente
// `await Promise.all(...)`-t sie und rendert dann.
//
// Status-Logik:
//   - Umsatz: Rechnungen mit Status SENT/PAID/OVERDUE im Zeitraum nach
//     `issuedAt`. CANCELLED/DRAFT zählen NICHT.
//   - Offene Forderungen: Rechnungen mit Status SENT oder OVERDUE
//     (PAID = bezahlt, also nicht mehr offen).
//   - Aktive Aufträge: CONFIRMED + IN_PROGRESS (DRAFT noch nicht aktiv,
//     COMPLETED/DELIVERED/INVOICED/CANCELLED nicht mehr aktiv).
//   - Offerten im Umlauf: SENT (nicht ACCEPTED/REJECTED/EXPIRED/DRAFT).
//
// Zeitzonen-Hinweis: Monatsgrenzen sind UTC-basiert; das genügt für
// Übersichts-KPIs. Für taggenaue Reports nutzt der Code Europe/Zurich
// via `localDateString` (siehe lib/time/zone.ts).

import { prisma } from "@/lib/prisma";
import { customerDisplayName } from "@/lib/dto/customer";

export interface DashboardKPIs {
  /** Aktueller-Monat-Umsatz (Netto CHF aus SENT/PAID/OVERDUE Rechnungen). */
  revenueThisMonthNet: number;
  /** Vormonat-Umsatz (gleiche Logik) — für Trend %. */
  revenuePrevMonthNet: number;
  /** Trend in Prozent gegenüber Vormonat. null wenn Vormonat 0. */
  revenueTrendPct: number | null;

  /** Offene Forderungen (SENT + OVERDUE), Brutto-Summe in CHF. */
  outstandingGrossCHF: number;
  /** Anzahl offener Rechnungen total. */
  outstandingCount: number;
  /** Davon überfällig (Status OVERDUE). */
  overdueCount: number;
  /** Brutto-Summe der überfälligen Rechnungen. */
  overdueGrossCHF: number;

  /** Aktive Aufträge (CONFIRMED + IN_PROGRESS). */
  activeOrdersCount: number;
  activeOrdersConfirmed: number;
  activeOrdersInProgress: number;

  /** Offerten im Umlauf (Status SENT). */
  openQuotesCount: number;
  openQuotesNetCHF: number;

  /** Aufträge, die diesen Monat angenommen wurden (createdAt). */
  ordersThisMonth: number;
  /** Vormonats-Vergleich für Aufträge. */
  ordersPrevMonth: number;
}

export interface RecentInvoice {
  id: string;
  number: string;
  customerName: string;
  status: string;
  totalGrossCHF: number;
  issuedAt: Date;
  dueAt: Date;
}

export interface RecentOrder {
  id: string;
  number: string;
  customerName: string;
  status: string;
  totalNetCHF: number | null;
  receivedAt: Date;
  promisedAt: Date;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfNextMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export async function loadDashboardKPIs(companyId: string): Promise<DashboardKPIs> {
  const now = new Date();
  const monthStart = startOfMonthUTC(now);
  const nextMonthStart = startOfNextMonthUTC(now);
  const prevMonthStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1),
  );

  const [
    revenueThisMonth,
    revenuePrevMonth,
    outstandingAll,
    overdueOnly,
    activeConfirmed,
    activeInProgress,
    openQuotes,
    ordersThisMonth,
    ordersPrevMonth,
  ] = await Promise.all([
    // 1) Umsatz aktueller Monat — Netto, weil Brutto je nach MwSt-Satz variiert
    prisma.invoice.aggregate({
      where: {
        companyId,
        status: { in: ["SENT", "PAID", "OVERDUE"] },
        issuedAt: { gte: monthStart, lt: nextMonthStart },
        deletedAt: null,
      },
      _sum: { totalNetCHF: true },
    }),
    // 2) Umsatz Vormonat
    prisma.invoice.aggregate({
      where: {
        companyId,
        status: { in: ["SENT", "PAID", "OVERDUE"] },
        issuedAt: { gte: prevMonthStart, lt: monthStart },
        deletedAt: null,
      },
      _sum: { totalNetCHF: true },
    }),
    // 3) Offene Forderungen (SENT + OVERDUE) — Brutto interessiert für Liquidität
    prisma.invoice.aggregate({
      where: {
        companyId,
        status: { in: ["SENT", "OVERDUE"] },
        deletedAt: null,
      },
      _sum: { totalGrossCHF: true },
      _count: { _all: true },
    }),
    // 4) Davon überfällig
    prisma.invoice.aggregate({
      where: {
        companyId,
        status: "OVERDUE",
        deletedAt: null,
      },
      _sum: { totalGrossCHF: true },
      _count: { _all: true },
    }),
    // 5) Aktive Aufträge (split nach Status)
    prisma.order.count({
      where: { companyId, status: "CONFIRMED", deletedAt: null },
    }),
    prisma.order.count({
      where: { companyId, status: "IN_PROGRESS", deletedAt: null },
    }),
    // 6) Offene Offerten (SENT). Quote hat KEIN deletedAt-Feld.
    prisma.quote.aggregate({
      where: { companyId, status: "SENT" },
      _sum: { totalNetCHF: true },
      _count: { _all: true },
    }),
    // 7) Aufträge eingegangen diesen Monat
    prisma.order.count({
      where: {
        companyId,
        receivedAt: { gte: monthStart, lt: nextMonthStart },
        deletedAt: null,
      },
    }),
    // 8) Aufträge eingegangen Vormonat
    prisma.order.count({
      where: {
        companyId,
        receivedAt: { gte: prevMonthStart, lt: monthStart },
        deletedAt: null,
      },
    }),
  ]);

  const revenueThisMonthNet = Number(revenueThisMonth._sum.totalNetCHF ?? 0);
  const revenuePrevMonthNet = Number(revenuePrevMonth._sum.totalNetCHF ?? 0);
  const revenueTrendPct =
    revenuePrevMonthNet > 0
      ? ((revenueThisMonthNet - revenuePrevMonthNet) / revenuePrevMonthNet) * 100
      : null;

  return {
    revenueThisMonthNet,
    revenuePrevMonthNet,
    revenueTrendPct,
    outstandingGrossCHF: Number(outstandingAll._sum.totalGrossCHF ?? 0),
    outstandingCount: outstandingAll._count._all,
    overdueCount: overdueOnly._count._all,
    overdueGrossCHF: Number(overdueOnly._sum.totalGrossCHF ?? 0),
    activeOrdersCount: activeConfirmed + activeInProgress,
    activeOrdersConfirmed: activeConfirmed,
    activeOrdersInProgress: activeInProgress,
    openQuotesCount: openQuotes._count._all,
    openQuotesNetCHF: Number(openQuotes._sum?.totalNetCHF ?? 0),
    ordersThisMonth,
    ordersPrevMonth,
  };
}

export async function loadRecentInvoices(
  companyId: string,
  take = 5,
): Promise<RecentInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { issuedAt: "desc" },
    take,
    include: {
      customer: { include: { contacts: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.invoiceNumber,
    customerName: customerDisplayName(r.customer),
    status: r.status,
    totalGrossCHF: Number(r.totalGrossCHF),
    issuedAt: r.issuedAt,
    dueAt: r.dueAt,
  }));
}

export async function loadRecentOrders(
  companyId: string,
  take = 5,
): Promise<RecentOrder[]> {
  const rows = await prisma.order.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { receivedAt: "desc" },
    take,
    include: {
      customer: { include: { contacts: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.orderNumber,
    customerName: customerDisplayName(r.customer),
    status: r.status,
    totalNetCHF: r.totalNetCHF != null ? Number(r.totalNetCHF) : null,
    receivedAt: r.receivedAt,
    promisedAt: r.promisedAt,
  }));
}
