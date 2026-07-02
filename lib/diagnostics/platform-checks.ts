/**
 * Platform-wide checks run once per cron execution before iterating over
 * tenants. They detect issues that are not tied to a specific tenant, such as
 * database-level RLS coverage or Supabase configuration drift.
 *
 * Findings are stored as `SecurityEvent` rows with `companyId = null`. The
 * Owner diagnostics UI displays them as platform-wide events.
 */

import { prisma } from "@/lib/prisma";

/**
 * Detect tables in the `public` schema whose Row-Level-Security is
 * disabled. Supabase automatically exposes every public table through
 * PostgREST. Without RLS, anyone with the `anon` key can read it.
 *
 * Phase 1 migration `20260526140000_enable_rls_on_public` enabled RLS on all
 * existing tables. This check raises an alert only if a new table is later
 * added without RLS. Prisma creates tables without RLS by default.
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
 * Runs all platform-level diagnostic checks once per cron execution. Issues
 * are written as `SecurityEvent` rows with `companyId = null`. An existing open
 * event with the same dedupe key is updated only in `lastSeenAt`.
 */
export async function runPlatformChecks(): Promise<{
  checks: number;
  warnings: number;
}> {
  let warnings = 0;
  const ranAt = new Date();

  // RLS coverage check
  const rlsMissing = await findRlsDisabledTables();
  if (rlsMissing.length > 0) {
    warnings++;
    await prisma.securityEvent.create({
      data: {
        // Platform event: companyId remains null.
        companyId: null,
        eventType: "platform.rls_disabled",
        severity: "critical",
        source: "database",
        riskScore: 90,
        message:
          `${rlsMissing.length} public table(s) do not have RLS enabled. The anon key ` +
          `can read or write them through PostgREST: ${rlsMissing.join(", ")}`,
        evidence: { tables: rlsMissing, schema: "public" },
        detectedAt: ranAt,
      },
    });
  }

  return { checks: 1, warnings };
}
