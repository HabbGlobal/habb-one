-- Owner-Notfall-Recovery via TOTP (Authenticator-App). Passkey bleibt
-- Pflicht; ein gültiger TOTP-Code schaltet NUR den Passkey-Enroll frei.
-- Additive Spalten (alle nullable bzw. mit Default) — kein Backfill.

ALTER TABLE "OwnerAccount" ADD COLUMN "totpSecretEnc" TEXT;
ALTER TABLE "OwnerAccount" ADD COLUMN "totpEnrolledAt" TIMESTAMP(3);
ALTER TABLE "OwnerAccount" ADD COLUMN "totpFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OwnerAccount" ADD COLUMN "totpLockedUntil" TIMESTAMP(3);

-- Neue Audit-Actions. Werden in diesem Migrationsfile NICHT verwendet,
-- daher unkritisch im selben Lauf (Postgres >= 12 / Supabase).
ALTER TYPE "OwnerAuditAction" ADD VALUE 'OWNER_2FA_TOTP_ENROLLED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'OWNER_2FA_TOTP_DISABLED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'OWNER_2FA_RECOVERY_USED';
