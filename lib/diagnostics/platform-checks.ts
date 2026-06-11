/**
 * Plattform-weite Checks — laufen 1× pro Cron-Lauf VOR der pro-Tenant-
 * Iteration. Erkennen Probleme, die nicht an einen Mandanten gebunden
 * sind (z. B. RLS-Coverage auf DB-Ebene, Supabase-Konfig-Drift).
 *
 * Befunde landen als `SecurityEvent` mit `companyId = null` — die
 * Owner-Diagnose-UI zeigt sie als plattform-übergreifende Events.
 */

import { prisma } from "@/lib/prisma";

/**
 * Detect tables in the `public` schema whose Row-Level-Security is
 * deaktiviert. Supabase exponiert jede public-Tabelle automatisch
 * über PostgREST — ohne RLS kann jeder mit `anon`-Key sie lesen.
 *
 * Phase 1 (Migration `20260526140000_enable_rls_on_public`) hat alle
 * existierenden Tabellen RLS-enabled. Dieser Check schlägt nur dann
 * Alarm, wenn jemand künftig eine NEUE Tabelle ohne RLS hinzufügt
 * (Prisma macht das per Default — nicht vergessen!).
 */
export async function findRlsDisabledTables(): Promise<string[]> {
  type Row = { tablename: string };
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT t.tablename
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
      WHERE t.schemaname = 'public' AND c.relrowsecurity = false
      ORDER BY t.tablename`,
  );
  return rows.map((r) => r.tablename);
}

/**
 * Run all platform-level diagnostic checks once per cron-Lauf. Schreibt
 * gefundene Probleme als `SecurityEvent` (companyId=null). Dedupliziert
 * sich selbst: ein bereits offenes Event mit demselben dedupeKey wird
 * nur in `lastSeenAt` aktualisiert.
 */
export async function runPlatformChecks(): Promise<{
  checks: number;
  warnings: number;
}> {
  let warnings = 0;
  const ranAt = new Date();

  // RLS-Coverage-Check
  const rlsMissing = await findRlsDisabledTables();
  if (rlsMissing.length > 0) {
    warnings++;
    await prisma.securityEvent.create({
      data: {
        // Plattform-Event: companyId bleibt NULL.
        companyId: null,
        eventType: "platform.rls_disabled",
        severity: "critical",
        source: "database",
        riskScore: 90,
        message:
          `${rlsMissing.length} public-Tabelle(n) ohne RLS — anon-Key ` +
          `kann via PostgREST lesen/schreiben: ${rlsMissing.join(", ")}`,
        evidence: { tables: rlsMissing, schema: "public" },
        detectedAt: ranAt,
      },
    });
  }

  return { checks: 1, warnings };
}
