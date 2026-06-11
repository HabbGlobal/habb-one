// Kalkulations-Genauigkeit-Report.
//
// Pro Auftrag (oder Zeitraum-Aggregat): vergleicht
//   • estimatedMinutes (Schätzung beim Erfassen)
//   • actualMinutes (Ist aus QR-Scans)
//   • effectiveBilledMinutes (CEO-Auswahl pro Schritt)
//
// Liefert Abweichungen in Min, % und CHF (anhand Standard-Stundensatz).
//
// Pure Logic — Caller (Page/API-Route) hängt es an Prisma + Excel.

import { effectiveBilledMinutes } from "@/lib/order/step-time";
import type { SystemParameterMap } from "@/lib/domain/parameters/store";
import type {
  Order,
  OrderItem,
  ProcessStep,
  Customer,
  Contact,
} from "@prisma/client";

export interface CalcAccuracyRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: Order["status"];
  promisedAt: Date;
  itemCount: number;
  /** Σ estimatedMinutes × quantity über alle Schritte. */
  estimatedMinutes: number;
  /** Σ actualMinutes × quantity, nur wo schon Scan-End vorhanden. */
  actualMinutes: number | null;
  /** Σ effectiveBilledMinutes × quantity. */
  billedMinutes: number;
  /**
   * Abweichung Ist vs. Schätzung in % (negativ = schneller, positiv = länger).
   * Null wenn actualMinutes fehlt.
   */
  deviationActualVsEstimatedPct: number | null;
  /** Selbe Sache aber Verrechnet vs. Schätzung. */
  deviationBilledVsEstimatedPct: number;
  /** Verrechneter Wert in CHF (Standard-Mitarbeitersatz × billedMinutes). */
  billedCHF: number;
  /** Schätz-Wert in CHF (zur Vergleichsgrundlage). */
  estimatedCHF: number;
}

export interface CalcAccuracyTotals {
  estimatedMinutes: number;
  actualMinutes: number | null;
  billedMinutes: number;
  estimatedCHF: number;
  billedCHF: number;
  /** Σ-Abweichung Verrechnet vs. Schätzung in % (gewichtet nach estimated). */
  weightedDeviationPct: number;
}

export interface CalcAccuracyReport {
  company: { name: string };
  period: { from: Date; to: Date };
  rows: CalcAccuracyRow[];
  totals: CalcAccuracyTotals;
}

type OrderRow = Order & {
  customer: Customer & { contacts?: Contact[] };
  items: (OrderItem & { processSteps: ProcessStep[] })[];
};

/**
 * Baut den Report aus geladenen Order-Rows. Caller muss die Aufträge
 * vorher anhand der Periode filtern (z. B. `promisedAt` zwischen from/to).
 */
export function buildCalculationAccuracy(args: {
  company: { name: string };
  period: { from: Date; to: Date };
  orders: OrderRow[];
  /** Aktueller Mitarbeiter-Stundensatz für CHF-Bewertung. */
  laborRateCHF: number;
}): CalcAccuracyReport {
  const rows: CalcAccuracyRow[] = args.orders.map((o) => {
    let estimated = 0;
    let actual = 0;
    let billed = 0;
    let allStepsDone = true;
    for (const it of o.items) {
      let runEst = 0;
      let runAct = 0;
      let runBill = 0;
      for (const st of it.processSteps) {
        runEst += st.estimatedMinutes;
        runBill += effectiveBilledMinutes({
          estimatedMinutes: st.estimatedMinutes,
          actualMinutes: st.actualMinutes,
          billedMinutes: st.billedMinutes,
          billingTimeSource: st.billingTimeSource,
        });
        if (st.actualMinutes == null) allStepsDone = false;
        else runAct += st.actualMinutes;
      }
      estimated += runEst * it.quantity;
      billed += runBill * it.quantity;
      actual += runAct * it.quantity;
    }
    const actualOrNull = allStepsDone ? actual : null;
    const devActVsEst =
      actualOrNull == null || estimated === 0
        ? null
        : ((actualOrNull - estimated) / estimated) * 100;
    const devBillVsEst = estimated === 0 ? 0 : ((billed - estimated) / estimated) * 100;
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName:
        o.customer.companyName ??
        `${o.customer.contacts?.[0]?.firstName ?? ""} ${o.customer.contacts?.[0]?.lastName ?? ""}`.trim() ??
        "—",
      status: o.status,
      promisedAt: o.promisedAt,
      itemCount: o.items.length,
      estimatedMinutes: estimated,
      actualMinutes: actualOrNull,
      billedMinutes: billed,
      deviationActualVsEstimatedPct: devActVsEst,
      deviationBilledVsEstimatedPct: devBillVsEst,
      billedCHF: round2((billed / 60) * args.laborRateCHF),
      estimatedCHF: round2((estimated / 60) * args.laborRateCHF),
    };
  });

  // Totals
  const sumEst = rows.reduce((s, r) => s + r.estimatedMinutes, 0);
  const sumAct = rows.every((r) => r.actualMinutes != null)
    ? rows.reduce((s, r) => s + (r.actualMinutes ?? 0), 0)
    : null;
  const sumBilled = rows.reduce((s, r) => s + r.billedMinutes, 0);
  const sumEstCHF = round2(rows.reduce((s, r) => s + r.estimatedCHF, 0));
  const sumBilledCHF = round2(rows.reduce((s, r) => s + r.billedCHF, 0));
  const weightedDev = sumEst === 0 ? 0 : ((sumBilled - sumEst) / sumEst) * 100;

  return {
    company: args.company,
    period: args.period,
    rows,
    totals: {
      estimatedMinutes: sumEst,
      actualMinutes: sumAct,
      billedMinutes: sumBilled,
      estimatedCHF: sumEstCHF,
      billedCHF: sumBilledCHF,
      weightedDeviationPct: weightedDev,
    },
  };
}

/**
 * Bequemes Wrapper: lädt aus Prisma (für Server Components / API-Routes).
 * `params` für den laborRateCHF wird aus den SystemParametern gelesen.
 */
export async function loadCalculationAccuracy(args: {
  prisma: import("@prisma/client").PrismaClient;
  companyId: string;
  from: Date;
  to: Date;
  params: SystemParameterMap;
}): Promise<CalcAccuracyReport> {
  const { prisma, companyId, from, to, params } = args;

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true },
  });
  const orders = await prisma.order.findMany({
    where: {
      companyId,
      archivedAt: null,
      deletedAt: null,
      // Aufträge die in der Periode beendet/geliefert/in arbeit sind
      OR: [
        { promisedAt: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
        { deliveredAt: { gte: from, lte: to } },
      ],
    },
    include: {
      customer: { include: { contacts: { take: 1 } } },
      items: { include: { processSteps: true } },
    },
    orderBy: { promisedAt: "asc" },
  });

  const laborRate = params.tryGetNumber("pricing.rate.labor.standard") ?? 90;

  return buildCalculationAccuracy({
    company,
    period: { from, to },
    orders,
    laborRateCHF: laborRate,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
