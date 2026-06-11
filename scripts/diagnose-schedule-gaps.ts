/**
 * Diagnose: wie viele aktive Mitarbeiter haben `weeklyTargetHours > 0`
 * aber leere/Null-Stunden-`WorkScheduleDay`-Rows? (Kiosk-Soll = 0:00)
 *
 * Read-only.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log("Übersicht: Mitarbeiter mit Soll-Lücke pro Mandant\n");

  let totalAffected = 0;
  let totalActive = 0;

  for (const c of companies) {
    const employees = await prisma.employee.findMany({
      where: {
        companyId: c.id,
        isActive: true,
        archivedAt: null,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        weeklyTargetHours: true,
        scheduleDays: { select: { targetHours: true } },
      },
    });

    const affected = employees.filter((e) => {
      const hasWeekly = (e.weeklyTargetHours ?? 0) > 0;
      const scheduleSum = e.scheduleDays.reduce(
        (s, d) => s + d.targetHours,
        0,
      );
      return hasWeekly && scheduleSum === 0;
    });

    totalAffected += affected.length;
    totalActive += employees.length;

    console.log(
      `📁 ${c.name} — ${affected.length}/${employees.length} betroffen`,
    );
    for (const a of affected) {
      console.log(
        `   • ${a.firstName} ${a.lastName} (#${a.employeeNumber}) — weeklyTargetHours=${a.weeklyTargetHours}h, scheduleDays-Σ=0h`,
      );
    }
    console.log("");
  }

  console.log("─────────────────────────────────────────────");
  console.log(`Total: ${totalAffected} / ${totalActive} aktive Mitarbeiter betroffen`);
  console.log("─────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("FEHLER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
