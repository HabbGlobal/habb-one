/**
 * Generiert ein Payroll-PDF + XLSX für einen echten Mitarbeiter (read-only)
 * und schreibt sie nach /tmp zum visuellen Review. Touch nichts in der DB.
 */

import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { buildPayrollReport } from "@/lib/reports/payroll";
import { payrollPdf } from "@/lib/reports/payroll-pdf";
import { payrollXlsx } from "@/lib/reports/payroll-xlsx";

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { firstName: { contains: "Balakir", mode: "insensitive" } },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!emp) {
    console.log("Kein Test-Mitarbeiter.");
    return;
  }

  // Mai 2026 — der Monat mit erfassten Zeiten + ggf. Absenzen.
  const report = await buildPayrollReport({
    companyId: emp.companyId,
    employeeId: emp.id,
    year: 2026,
    month: 5,
  });

  console.log(`Report: ${emp.firstName} ${emp.lastName}, Mai 2026`);
  console.log(
    `  Tage: ${report.days.length}, Soll ${report.totals.targetMinutes}min, Ist ${report.totals.workedMinutes}min`,
  );
  console.log(
    `  Saldo kum.: ${report.totals.cumulativeBalanceMinutes}min, letzter Tages-Run: ${report.dayRunningBalanceMinutes.at(-1)}min`,
  );
  console.log(
    `  Konsistenz-Check letzter Run == kum.: ${report.dayRunningBalanceMinutes.at(-1) === report.totals.cumulativeBalanceMinutes ? "OK" : "MISMATCH"}`,
  );

  const pdf = await payrollPdf(report, "smoke-test@habb.ch");
  writeFileSync("/tmp/payroll-test.pdf", Buffer.from(pdf));
  console.log(`  ✓ PDF: /tmp/payroll-test.pdf (${pdf.length} bytes)`);

  const xlsx = payrollXlsx(report, "smoke-test@habb.ch");
  writeFileSync("/tmp/payroll-test.xlsx", xlsx);
  console.log(`  ✓ XLSX: /tmp/payroll-test.xlsx (${xlsx.length} bytes)`);
}

main()
  .catch((e) => {
    console.error("FEHLER:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
