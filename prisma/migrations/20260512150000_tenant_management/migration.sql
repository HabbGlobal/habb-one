-- Owner-Portal PR 2: tenant lifecycle + entitlements UI prerequisites.
-- Adds plan + suspension state + internal owner notes to Company.

CREATE TYPE "TenantPlan" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE');

ALTER TABLE "Company"
  ADD COLUMN "plan"            "TenantPlan" NOT NULL DEFAULT 'STARTER',
  ADD COLUMN "suspendedAt"     TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT,
  ADD COLUMN "internalNotes"   TEXT;
