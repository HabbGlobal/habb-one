-- Owner-Portal PR 3: per-user lifecycle (lock, soft-delete, force password
-- change, session invalidation) + magic-link password reset.

ALTER TABLE "User"
  ADD COLUMN "lockedAt"           TIMESTAMP(3),
  ADD COLUMN "lockedReason"       TEXT,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sessionEpoch"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletedAt"          TIMESTAMP(3);

CREATE TABLE "PasswordResetToken" (
  "id"                        TEXT NOT NULL,
  "userId"                    TEXT NOT NULL,
  "tokenHash"                 TEXT NOT NULL,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"                 TIMESTAMP(3) NOT NULL,
  "consumedAt"                TIMESTAMP(3),
  "initiatedByOwnerAccountId" TEXT,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
