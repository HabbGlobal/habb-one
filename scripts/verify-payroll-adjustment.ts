/**
 * Smoke-Test gegen Prod-DB: verifiziert, dass eine manuelle Zeit-Korrektur
 * im Payroll-Report korrekt einfliesst (cumulative + laufender Saldo) und
 * räumt am Ende auf. Read/Write, idempotent (löscht die Test-Korrektur).
 */

import { prisma } from "@/lib/prisma";
import { buildPayrollReport } from "@/lib/reports/payroll";
import { localMidnightUtc } from "@/lib/time/zone";

const YEAR = 2026;
const MONTH = 5; // Mai
const TEST_MINUTES = 120; // +2h

async function main() {
  console.log("──────────────────────────────────────────────");
  console.log("Payroll-Korrektur — Verifikation");
  console.log("──────────────────────────────────────────────\n");

  const emp = await prisma.employee.findFirst({
    where: { firstName: { contains: "Balakir", mode: "insensitive" } },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!emp) {
    console.log("Kein Test-Mitarbeiter.");
    return;
  }
  console.log(`Mitarbeiter: ${emp.firstName} ${emp.lastName}`);

  const before = await buildPayrollReport({
    companyId: emp.companyId,
    employeeId: emp.id,
    year: YEAR,
    month: MONTH,
  });
  console.log(
    `Vorher: adjustments=${before.adjustments.length}, adjMin=${before.totals.adjustmentMinutes}, cumulative=${before.totals.cumulativeBalanceMinutes}`,
  );

  let createdId: string | null = null;
  try {
    const created = await prisma.timeAdjustment.create({
      data: {
        companyId: emp.companyId,
        employeeId: emp.id,
        effectiveDate: localMidnightUtc(`${YEAR}-0${MONTH}-15`),
        minutes: TEST_MINUTES,
        reason: "SMOKE-TEST Überzeit-Korrektur",
        createdById: null,
      },
    });
    createdId = created.id;
    console.log(`✓ Test-Korrektur +${TEST_MINUTES}min angelegt`);

    const after = await buildPayrollReport({
      companyId: emp.companyId,
      employeeId: emp.id,
      year: YEAR,
      month: MONTH,
    });

    const expectedAdj = before.totals.adjustmentMinutes + TEST_MINUTES;
    const expectedCum = before.totals.cumulativeBalanceMinutes + TEST_MINUTES;

    console.log(
      `Nachher: adjustments=${after.adjustments.length}, adjMin=${after.totals.adjustmentMinutes}, cumulative=${after.totals.cumulativeBalanceMinutes}`,
    );

    if (after.totals.adjustmentMinutes !== expectedAdj) {
      throw new Error(`FEHLER: adjustmentMinutes ${after.totals.adjustmentMinutes} != erwartet ${expectedAdj}`);
    }
    console.log("✓ adjustmentMinutes korrekt erhöht");

    if (after.totals.cumulativeBalanceMinutes !== expectedCum) {
      throw new Error(`FEHLER: cumulative ${after.totals.cumulativeBalanceMinutes} != erwartet ${expectedCum}`);
    }
    console.log("✓ kumulierter Saldo enthält die Korrektur");

    const lastRunning = after.dayRunningBalanceMinutes.at(-1);
    if (lastRunning !== after.totals.cumulativeBalanceMinutes) {
      throw new Error(
        `FEHLER: letzter laufender Saldo ${lastRunning} != cumulative ${after.totals.cumulativeBalanceMinutes}`,
      );
    }
    console.log("✓ letzter laufender Saldo == kumulierter Saldo (konsistent)");

    const found = after.adjustments.find((a) => a.id === createdId);
    if (!found || found.minutes !== TEST_MINUTES) {
      throw new Error("FEHLER: Korrektur nicht in der Liste / falsche Minuten.");
    }
    console.log(`✓ Korrektur in der Liste: ${found.date} ${found.minutes}min "${found.reason}"`);
  } finally {
    if (createdId) {
      await prisma.timeAdjustment.delete({ where: { id: createdId } });
      console.log("\n✓ Test-Korrektur entfernt");
    }
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("✓ Alle Korrektur-Checks bestanden");
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("\n❌ FEHLGESCHLAGEN:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
