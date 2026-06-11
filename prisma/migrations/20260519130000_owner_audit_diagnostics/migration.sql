-- Audit-Actions für Owner-Diagnostics-Aktionen (manuelle Diagnose,
-- Finding-Statuswechsel, Test-E-Mail). Werte werden hier NICHT
-- verwendet → unkritisch im selben Lauf (Postgres >= 12 / Supabase).

ALTER TYPE "OwnerAuditAction" ADD VALUE 'DIAGNOSTICS_RUN_MANUAL';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'DIAGNOSTICS_FINDING_UPDATED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'DIAGNOSTICS_TEST_EMAIL';
