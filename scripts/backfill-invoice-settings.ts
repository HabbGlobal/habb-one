// Backfill für bestehende Companies, deren Invoice-Settings nach
// `prisma db push` nicht gesetzt wurden. Idempotent.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Companies mit fehlenden / ungültigen Defaults reparieren
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      qrIban: true,
      invoicePaymentTerms: true,
      invoiceDefaultVatRate: true,
    },
  });

  let fixed = 0;
  for (const c of companies) {
    const needsTerms =
      c.invoicePaymentTerms == null || c.invoicePaymentTerms === 0;
    const needsVat =
      c.invoiceDefaultVatRate == null ||
      Number(c.invoiceDefaultVatRate) === 0;
    if (!needsTerms && !needsVat) continue;
    await prisma.company.update({
      where: { id: c.id },
      data: {
        ...(needsTerms ? { invoicePaymentTerms: 30 } : {}),
        ...(needsVat ? { invoiceDefaultVatRate: 8.1 } : {}),
      },
    });
    fixed++;
    console.log(
      `  → ${c.name}: terms=${needsTerms ? 30 : c.invoicePaymentTerms}, vat=${needsVat ? 8.1 : c.invoiceDefaultVatRate}`,
    );
  }
  console.log(`✓ ${fixed} companies repariert.`);

  // Aktuellen State zeigen
  console.log("\nAktueller Stand:");
  const all = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      qrIban: true,
      invoicePaymentTerms: true,
      invoiceDefaultVatRate: true,
      vatNumber: true,
    },
  });
  for (const c of all) {
    console.log(
      `  ${c.name}: ` +
        `qrIban=${c.qrIban ?? "—"}, ` +
        `vatNr=${c.vatNumber ?? "—"}, ` +
        `terms=${c.invoicePaymentTerms}, ` +
        `vat=${c.invoiceDefaultVatRate}`,
    );
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
