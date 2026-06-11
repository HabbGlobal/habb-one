/**
 * Read-only Pre-Check: bestätigt vor der RLS-Migration, dass unsere
 * Prisma-Connection als BYPASSRLS-Rolle läuft — sonst würde die App
 * nach RLS-Aktivierung blockiert.
 *
 * Druckt zusätzlich, welche Tabellen aktuell RLS aktiviert haben.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  // 1. Aktuelle DB-Rolle + BYPASSRLS-Attribut
  const roleInfo = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; bypassrls: boolean | null }>
  >(
    `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`,
  );
  console.log("DB-Rolle:", roleInfo[0]);

  // 2. RLS-Status pro public-Tabelle
  const tables = await prisma.$queryRawUnsafe<
    Array<{ tablename: string; rowsecurity: boolean; n_policies: bigint }>
  >(
    `SELECT
       t.tablename,
       c.relrowsecurity AS rowsecurity,
       (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS n_policies
     FROM pg_tables t
     JOIN pg_class c ON c.relname = t.tablename
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
     WHERE t.schemaname = 'public'
     ORDER BY rowsecurity ASC, t.tablename`,
  );

  const off = tables.filter((t) => !t.rowsecurity);
  const on = tables.filter((t) => t.rowsecurity);

  console.log(
    `\nRLS-Status: ${on.length} aktiv · ${off.length} INAKTIV (kritisch wenn > 0)\n`,
  );

  if (off.length > 0) {
    console.log("Tabellen OHNE RLS:");
    for (const t of off) console.log(`  ✗ ${t.tablename}`);
  }
  if (on.length > 0) {
    console.log("\nTabellen MIT RLS:");
    for (const t of on)
      console.log(`  ✓ ${t.tablename} (${t.n_policies} Policies)`);
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
