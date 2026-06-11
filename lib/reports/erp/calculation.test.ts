import { describe, expect, it } from "vitest";
import { buildCalculationAccuracy } from "./calculation";

const company = { name: "Test AG" };
const period = { from: new Date("2026-04-01"), to: new Date("2026-04-30") };

function mkOrder(args: {
  id: string;
  number: string;
  customerName: string;
  steps: Array<{
    estimated: number;
    actual: number | null;
    billed: number | null;
    source: "ACTUAL" | "ESTIMATED" | "MANUAL";
    qty?: number;
  }>;
  status?: "DRAFT" | "CONFIRMED" | "IN_PROGRESS" | "DELIVERED";
}): Parameters<typeof buildCalculationAccuracy>[0]["orders"][number] {
  // Items: ein Item pro Test, alle Steps darin, quantity vom ersten Schritt
  const qty = args.steps[0]?.qty ?? 1;
  return {
    id: args.id,
    orderNumber: args.number,
    companyId: "c",
    customerId: "cust",
    status: args.status ?? "DELIVERED",
    priority: "NORMAL",
    receivedAt: new Date("2026-04-01"),
    promisedAt: new Date("2026-04-15"),
    internalDeadline: null,
    startedAt: null,
    completedAt: null,
    deliveredAt: null,
    contactPersonId: null,
    shippingAddressId: null,
    billingAddressId: null,
    notes: null,
    customerNotes: null,
    trackingId: "t",
    trackingToken: "tok",
    qrCodePdfPath: null,
    totalNetCHF: null,
    bexioOrderId: null,
    abacusOrderId: null,
    parameterSnapshot: null,
    customerInitiated: false,
    createdById: "u",
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: "cust",
      companyId: "c",
      customerNumber: "K",
      type: "BUSINESS",
      companyName: args.customerName,
      vatNumber: null,
      language: "DE",
      paymentTerms: 30,
      defaultDiscount: null,
      creditLimit: null,
      notes: null,
      isActive: true,
      bexioContactId: null,
      abacusCustomerId: null,
      portalEnabled: false,
      portalSlug: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      contacts: [],
    },
    items: [
      {
        id: "i",
        orderId: args.id,
        position: 10,
        description: "Test",
        quantity: qty,
        surfaceM2: 1 as unknown as never,
        weightKg: null,
        thicknessMm: null,
        material: "STEEL_S235",
        complexity: "NORMAL",
        colorCode: null,
        colorSystem: null,
        glossLevel: null,
        applicationArea: null,
        unitPriceCHF: null,
        notes: null,
        processSteps: args.steps.map((s, i) => ({
          id: `s${i}`,
          orderItemId: "i",
          sequence: (i + 1) * 10,
          processCode: "MASKING",
          machineTypeRequired: null,
          skillRequired: "PREP",
          estimatedMinutes: s.estimated,
          actualMinutes: s.actual,
          billedMinutes: s.billed,
          billingTimeSource: s.source,
          waitMinutesAfter: 0,
          status: "PENDING",
          predecessorId: null,
          notes: null,
        })),
      },
    ],
  };
}

describe("buildCalculationAccuracy", () => {
  it("vollständig finalisierter Auftrag — Schätzung 60, Ist 70, Verrechnet via ACTUAL = 70", () => {
    const r = buildCalculationAccuracy({
      company,
      period,
      laborRateCHF: 90,
      orders: [
        mkOrder({
          id: "o1",
          number: "AUF-1",
          customerName: "Wyss AG",
          steps: [{ estimated: 60, actual: 70, billed: null, source: "ACTUAL" }],
        }),
      ],
    });
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.estimatedMinutes).toBe(60);
    expect(row.actualMinutes).toBe(70);
    expect(row.billedMinutes).toBe(70);
    expect(row.deviationActualVsEstimatedPct).toBeCloseTo(16.67, 1);
    expect(row.deviationBilledVsEstimatedPct).toBeCloseTo(16.67, 1);
    // CHF: 70/60 × 90 = 105.00
    expect(row.billedCHF).toBe(105);
    expect(row.estimatedCHF).toBe(90);
  });

  it("Mehrere Steps mit Quantity — multipliziert korrekt", () => {
    const r = buildCalculationAccuracy({
      company,
      period,
      laborRateCHF: 60,
      orders: [
        mkOrder({
          id: "o1",
          number: "AUF-1",
          customerName: "X",
          steps: [
            { estimated: 30, actual: 30, billed: null, source: "ACTUAL", qty: 5 },
            { estimated: 15, actual: 20, billed: null, source: "ACTUAL", qty: 5 },
          ],
        }),
      ],
    });
    const row = r.rows[0];
    // 5 Stk × (30+15) = 225 estimated; 5 × (30+20) = 250 actual
    expect(row.estimatedMinutes).toBe(225);
    expect(row.actualMinutes).toBe(250);
    expect(row.billedMinutes).toBe(250);
  });

  it("ACTUAL fehlt → Fallback auf estimated", () => {
    const r = buildCalculationAccuracy({
      company,
      period,
      laborRateCHF: 90,
      orders: [
        mkOrder({
          id: "o1",
          number: "AUF-1",
          customerName: "X",
          steps: [{ estimated: 60, actual: null, billed: null, source: "ACTUAL" }],
        }),
      ],
    });
    expect(r.rows[0].billedMinutes).toBe(60);
    expect(r.rows[0].actualMinutes).toBeNull();
    expect(r.rows[0].deviationActualVsEstimatedPct).toBeNull();
    expect(r.rows[0].deviationBilledVsEstimatedPct).toBe(0);
  });

  it("MANUAL Override gewinnt", () => {
    const r = buildCalculationAccuracy({
      company,
      period,
      laborRateCHF: 90,
      orders: [
        mkOrder({
          id: "o1",
          number: "AUF-1",
          customerName: "X",
          steps: [{ estimated: 60, actual: 70, billed: 50, source: "MANUAL" }],
        }),
      ],
    });
    expect(r.rows[0].billedMinutes).toBe(50);
    // Trotz Manual: actualMinutes-Spalte zeigt das Ist
    expect(r.rows[0].actualMinutes).toBe(70);
  });

  it("Totals: gewichtete Abweichung wird korrekt berechnet", () => {
    const r = buildCalculationAccuracy({
      company,
      period,
      laborRateCHF: 90,
      orders: [
        mkOrder({
          id: "o1",
          number: "AUF-1",
          customerName: "A",
          steps: [{ estimated: 100, actual: 120, billed: null, source: "ACTUAL" }],
        }),
        mkOrder({
          id: "o2",
          number: "AUF-2",
          customerName: "B",
          steps: [{ estimated: 50, actual: 50, billed: null, source: "ACTUAL" }],
        }),
      ],
    });
    expect(r.totals.estimatedMinutes).toBe(150);
    expect(r.totals.actualMinutes).toBe(170);
    expect(r.totals.billedMinutes).toBe(170);
    // gewichtet: (170 − 150) / 150 = 13.33%
    expect(r.totals.weightedDeviationPct).toBeCloseTo(13.33, 1);
  });
});
