/**
 * Diagnose-Script: warum zeigt der Kiosk "Soll 0:00" bei Balakirishanth?
 *
 * Read-only — touch nichts an, druckt nur den Zustand.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  console.log("─────────────────────────────────────────");
  console.log("Diagnose: Wochenstunden / Kiosk-Soll");
  console.log("─────────────────────────────────────────\n");

  // Alle Employees mit "Balakir*"-Namen finden, sicherheitshalber breit.
  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { firstName: { contains: "Balakir", mode: "insensitive" } },
        { lastName: { contains: "Balakir", mode: "insensitive" } },
      ],
    },
    include: {
      scheduleDays: true,
      company: { select: { id: true, name: true } },
    },
  });

  if (employees.length === 0) {
    console.log("Keine Employees mit 'Balakir' im Namen gefunden.\n");
    console.log("Liste ALLE Tschannen-Mitarbeiter und ihre Schedule-Werte:");
    const tschannen = await prisma.company.findFirst({
      where: { name: { contains: "Tschannen", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!tschannen) {
      console.log("Tschannen-Mandant nicht gefunden.");
      return;
    }
    const all = await prisma.employee.findMany({
      where: { companyId: tschannen.id },
      include: { scheduleDays: true },
      orderBy: { lastName: "asc" },
    });
    for (const e of all) {
      const sum = e.scheduleDays.reduce((s, d) => s + d.targetHours, 0);
      console.log(
        `  ${e.firstName} ${e.lastName} (#${e.employeeNumber}) — weekly=${e.weeklyTargetHours ?? "null"}h, scheduleDays=${e.scheduleDays.length}, Σ=${sum}h`,
      );
    }
    return;
  }

  for (const e of employees) {
    console.log(`👤 ${e.firstName} ${e.lastName} (#${e.employeeNumber})`);
    console.log(`   Mandant: ${e.company.name}`);
    console.log(`   employmentType:        ${e.employmentType}`);
    console.log(`   workloadPercent:       ${e.workloadPercent ?? "null"}`);
    console.log(`   weeklyTargetHours:     ${e.weeklyTargetHours ?? "null"} (Scalar-Feld)`);
    console.log(`   annualVacationDays:    ${e.annualVacationDays}`);
    console.log(`   initialVacationDays:   ${e.initialVacationDays}`);
    console.log(`   scheduleDays rows:     ${e.scheduleDays.length}`);
    if (e.scheduleDays.length > 0) {
      for (const d of e.scheduleDays.sort((a, b) =>
        a.weekday.localeCompare(b.weekday),
      )) {
        console.log(`     ${d.weekday}: ${d.targetHours}h`);
      }
      const sum = e.scheduleDays.reduce((s, d) => s + d.targetHours, 0);
      console.log(`     ─── Σ Wochenstunden gemäss scheduleDays: ${sum}h`);
    } else {
      console.log("     ⚠️  KEINE scheduleDays → Kiosk-Soll wird 0:00 sein!");
    }
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error("FEHLER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
