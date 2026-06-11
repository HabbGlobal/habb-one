/**
 * Idempotent Backfill: erzeugt `WorkScheduleDay`-Rows für Mitarbeiter,
 * die `weeklyTargetHours > 0` haben, aber keine Tagesverteilung —
 * typischer Zustand nach einem ODS-Bulk-Import, der nur das
 * Scalar-Feld befüllt hat.
 *
 * Verteilung: Mo-Fr (5 Tage), perDay = weeklyTargetHours / 5.
 *
 * Idempotent: Mitarbeiter, die bereits scheduleDays mit Σ > 0 haben,
 * werden NICHT überschrieben. Wiederholtes Ausführen ist sicher.
 *
 * Touch ONLY Mitarbeiter, deren `scheduleDays` komplett leer oder
 * Σ = 0 sind (Lücken-Symptom). Bestehende explizite Verteilungen
 * bleiben unangetastet.
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_WORKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;

async function main() {
  console.log("Backfill: WorkScheduleDay für Mitarbeiter mit Soll-Lücke\n");

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      deletedAt: null,
      weeklyTargetHours: { gt: 0 },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      weeklyTargetHours: true,
      companyId: true,
      scheduleDays: {
        select: { weekday: true, targetHours: true },
      },
      company: { select: { name: true } },
    },
  });

  let fixed = 0;
  let skipped = 0;

  for (const e of employees) {
    const sum = e.scheduleDays.reduce((s, d) => s + d.targetHours, 0);
    if (sum > 0) {
      skipped++;
      continue;
    }
    if (!e.weeklyTargetHours || e.weeklyTargetHours <= 0) {
      skipped++;
      continue;
    }

    const perDay = e.weeklyTargetHours / DEFAULT_WORKDAYS.length;

    await prisma.$transaction(async (tx) => {
      // Sauber: vorhandene Null-Rows wegräumen, dann frisch erstellen.
      await tx.workScheduleDay.deleteMany({ where: { employeeId: e.id } });
      await tx.workScheduleDay.createMany({
        data: DEFAULT_WORKDAYS.map((weekday) => ({
          employeeId: e.id,
          weekday,
          targetHours: perDay,
        })),
      });
    });

    console.log(
      `✓ ${e.company.name} — ${e.firstName} ${e.lastName} (#${e.employeeNumber}): ${e.weeklyTargetHours}h → Mo-Fr je ${perDay.toFixed(2)}h`,
    );
    fixed++;
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`Gefixt:       ${fixed}`);
  console.log(`Übersprungen: ${skipped} (bereits korrekt oder ohne weeklyTargetHours)`);
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
