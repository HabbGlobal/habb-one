// Backfill CH-Basis-Feiertage für bestehende Mandanten. Idempotent über die
// composite unique [companyId, date] — vorhandene Einträge werden NICHT
// überschrieben. Tschannen hat sein BE-Set schon aus dem alten seed.ts;
// dieser Skript ergänzt nur die fehlenden universellen Daten.
//
// Run:  tsx scripts/backfill-holidays.ts
//       tsx scripts/backfill-holidays.ts --year 2027   # nur 2027

import { PrismaClient } from "@prisma/client";
import { buildSwissHolidayRows } from "../lib/holidays/ch-defaults";
const prisma = new PrismaClient();

async function main() {
  // CLI-Option: --year <year>
  const yearArgIdx = process.argv.indexOf("--year");
  const years =
    yearArgIdx >= 0 && process.argv[yearArgIdx + 1]
      ? [Number(process.argv[yearArgIdx + 1])]
      : (() => {
          const y = new Date().getUTCFullYear();
          return [y, y + 1];
        })();

  console.log(`→ Backfill für Jahr(e): ${years.join(", ")}`);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`→ ${companies.length} Mandant(en) gefunden\n`);

  for (const c of companies) {
    const rows = buildSwissHolidayRows(c.id, years);
    // createMany mit skipDuplicates respektiert das @@unique([companyId, date]).
    const result = await prisma.holiday.createMany({
      data: rows,
      skipDuplicates: true,
    });
    console.log(
      `  ${c.name}: ${result.count} neue Feiertage angelegt ` +
        `(${rows.length - result.count} bereits vorhanden)`,
    );
  }

  // Zusammenfassung
  console.log("\nAktueller Stand pro Mandant:");
  const summary = await prisma.holiday.groupBy({
    by: ["companyId"],
    _count: { _all: true },
  });
  const idMap = new Map(companies.map((c) => [c.id, c.name]));
  for (const s of summary) {
    console.log(`  ${idMap.get(s.companyId) ?? s.companyId}: ${s._count._all} Feiertage total`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
