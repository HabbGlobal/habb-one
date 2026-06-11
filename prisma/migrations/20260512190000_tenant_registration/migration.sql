-- Owner-Portal PR 5: Public tenant self-registration + manual Owner-create.
-- Adds Company lifecycle columns + EmailVerificationToken + 3 audit actions.

-- Lifecycle für Mandanten-Registrierung.
CREATE TYPE "TenantRegistrationStatus" AS ENUM (
  'ACTIVE',
  'PENDING_EMAIL_VERIFICATION',
  'PENDING_APPROVAL',
  'REJECTED'
);

-- Audit-Actions für Tenant-Lifecycle.
ALTER TYPE "OwnerAuditAction" ADD VALUE 'TENANT_CREATED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'TENANT_REGISTRATION_APPROVED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'TENANT_REGISTRATION_REJECTED';

-- Company-Erweiterungen. Bestands-Mandanten bekommen Default 'ACTIVE'
-- und behalten alle existierenden Daten unverändert.
ALTER TABLE "Company"
  ADD COLUMN "phone"                                   TEXT,
  ADD COLUMN "registrationStatus"                      "TenantRegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "registrationSubmittedAt"                 TIMESTAMP(3),
  ADD COLUMN "registrationEmailVerifiedAt"             TIMESTAMP(3),
  ADD COLUMN "registrationApprovedAt"                  TIMESTAMP(3),
  ADD COLUMN "registrationApprovedByOwnerAccountId"    TEXT,
  ADD COLUMN "registrationRejectedAt"                  TIMESTAMP(3),
  ADD COLUMN "registrationRejectedByOwnerAccountId"    TEXT,
  ADD COLUMN "registrationRejectionReason"             TEXT;

-- User: emailVerifiedAt. Bestands-User werden als verifiziert markiert
-- (Owner hat sie ja vorher angelegt) → ihre createdAt als Verify-Zeit.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE "EmailVerificationToken" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key"      ON "EmailVerificationToken"("tokenHash");
CREATE INDEX        "EmailVerificationToken_userId_expiresAt"   ON "EmailVerificationToken"("userId", "expiresAt");
CREATE INDEX        "EmailVerificationToken_expiresAt_idx"      ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
