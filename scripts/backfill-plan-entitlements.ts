/**
 * One-Shot-Backfill: bestehende Mandanten auf den gewünschten Plan
 * setzen UND die Modul-Entitlements daraus ableiten (explizite Zeilen),
 * damit die Durchsetzung (Nav + Route-Guard) sofort greift.
 *
 * Run: node_modules/.bin/tsx scripts/backfill-plan-entitlements.ts
 *
 * Idempotent — beliebig oft ausführbar.
 */
import { PrismaClient, type TenantPlan } from "@prisma/client";
import { syncEntitlementsToPlan, PLAN_MODULES } from "../lib/entitlements/modules";

const prisma = new PrismaClient();

const TARGETS: { match: string; plan: TenantPlan }[] = [
  { match: "habb global", plan: "ENTERPRISE" },
  { match: "VSK Motors", plan: "TRIAL" },
  { match: "HABB Switzerland", plan: "STARTER" },
];

async function main() {
  for (const t of TARGETS) {
    const company = await prisma.company.findFirst({
      where: { name: { contains: t.match, mode: "insensitive" } },
      select: { id: true, name: true, plan: true },
    });
    if (!company) {
      console.log(`! Kein Mandant gefunden für "${t.match}" — übersprungen`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: { plan: t.plan },
      });
      await syncEntitlementsToPlan(tx, company.id, t.plan);
    });
    console.log(
      `✓ ${company.name}: ${company.plan} → ${t.plan} | Module: ${PLAN_MODULES[
        t.plan
      ].join(", ")}`,
    );
  }

  console.log("\nVerifikation:");
  const all = await prisma.company.findMany({
    select: {
      name: true,
      plan: true,
      entitlements: {
        where: { enabled: true },
        select: { module: true },
        orderBy: { module: "asc" },
      },
    },
  });
  for (const c of all) {
    console.log(
      `  ${c.name} [${c.plan}] aktiv: ${c.entitlements.map((e) => e.module).join(", ") || "—"}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
