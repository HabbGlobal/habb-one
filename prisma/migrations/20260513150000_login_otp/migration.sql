-- Login-2FA per E-Mail-OTP. Jeder Tenant-User außer KIOSK_OPERATOR
-- bekommt bei jedem Login einen 6-stelligen Code. Klartext nur in Mail,
-- bcrypt-Hash hier.

CREATE TABLE "LoginOtpToken" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "codeHash"    TEXT NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "consumedAt"  TIMESTAMP(3),
  "ipAddress"   TEXT,
  "userAgent"   TEXT,

  CONSTRAINT "LoginOtpToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginOtpToken_userId_expiresAt_idx"
  ON "LoginOtpToken"("userId", "expiresAt");

ALTER TABLE "LoginOtpToken"
  ADD CONSTRAINT "LoginOtpToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
