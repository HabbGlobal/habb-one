/**
 * Backfill SystemParameter pro Mandant. Idempotent: bestehende Rows pro
 * (companyId, key) bleiben unverändert (currentValue), nur die Metadaten
 * werden aktualisiert. Neue Parameter-Keys aus PARAMETER_SEEDS werden
 * für JEDEN aktiven Mandanten ergänzt.
 *
 * Run:  tsx scripts/backfill-system-params.ts
 *       tsx scripts/backfill-system-params.ts --tenant <name>   # gezielt
 */

import { PrismaClient } from "@prisma/client";
import { PARAMETER_SEEDS } from "../lib/domain/parameters/seeds";

const prisma = new PrismaClient();

async function main() {
  const tenantArgIdx = process.argv.indexOf("--tenant");
  const tenantFilter =
    tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : null;

  const companies = await prisma.company.findMany({
    where: {
      registrationStatus: "ACTIVE",
      suspendedAt: null,
      ...(tenantFilter
        ? { name: { contains: tenantFilter, mode: "insensitive" as const } }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (companies.length === 0) {
    console.error("✗ Keine aktiven Mandanten gefunden.");
    process.exit(1);
  }

  console.log(`→ ${companies.length} Mandant(en), ${PARAMETER_SEEDS.length} Parameter pro Tenant\n`);

  for (const company of companies) {
    // SUPERADMIN oder irgendeinen aktiven User dieses Mandanten als
    // Initial-"Updater" — Pflicht-FK.
    const updater =
      (await prisma.user.findFirst({
        where: {
          companyId: company.id,
          role: "SUPERADMIN",
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })) ??
      (await prisma.user.findFirst({
        where: { companyId: company.id, isActive: true, deletedAt: null },
        select: { id: true },
      }));

    if (!updater) {
      console.log(`  ${company.name}: kein User vorhanden — übersprungen`);
      continue;
    }

    let created = 0;
    let updated = 0;
    for (const seed of PARAMETER_SEEDS) {
      const valueAsString = String(seed.defaultValue);
      const existed = await prisma.systemParameter.findUnique({
        where: { companyId_key: { companyId: company.id, key: seed.key } },
        select: { companyId: true },
      });
      await prisma.systemParameter.upsert({
        where: { companyId_key: { companyId: company.id, key: seed.key } },
        create: {
          companyId: company.id,
          key: seed.key,
          category: seed.category,
          subCategory: seed.subCategory ?? null,
          label: seed.label,
          description: seed.description ?? null,
          valueType: seed.valueType,
          currentValue: valueAsString,
          defaultValue: valueAsString,
          unit: seed.unit ?? null,
          minValue: seed.minValue ?? null,
          maxValue: seed.maxValue ?? null,
          step: seed.step ?? null,
          affectsFormula: seed.affectsFormula ?? null,
          updatedById: updater.id,
        },
        // Re-Run: Metadaten ziehen, currentValue NICHT überschreiben.
        update: {
          category: seed.category,
          subCategory: seed.subCategory ?? null,
          label: seed.label,
          description: seed.description ?? null,
          valueType: seed.valueType,
          defaultValue: valueAsString,
          unit: seed.unit ?? null,
          minValue: seed.minValue ?? null,
          maxValue: seed.maxValue ?? null,
          step: seed.step ?? null,
          affectsFormula: seed.affectsFormula ?? null,
        },
      });
      if (existed) updated++;
      else created++;
    }
    console.log(`  ${company.name}: ${created} neu, ${updated} aktualisiert`);
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
