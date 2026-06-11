-- CreateEnum
CREATE TYPE "OwnerRole" AS ENUM ('OWNER_ROOT', 'OWNER_ADMIN', 'OWNER_SUPPORT');

-- CreateEnum
CREATE TYPE "OwnerAuditAction" AS ENUM ('OWNER_LOGIN_OK', 'OWNER_LOGIN_FAILED', 'OWNER_LOGOUT', 'OWNER_2FA_ENROLLED', 'OWNER_2FA_RESET', 'OWNER_SUDO_GRANTED', 'TENANT_VIEWED', 'TENANT_USER_LIST_VIEWED', 'TENANT_AUDIT_VIEWED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_NOTES_UPDATED', 'TENANT_DATA_EXPORTED', 'TENANT_SOFT_DELETED', 'TENANT_HARD_DELETED', 'ENTITLEMENT_TOGGLED', 'ENTITLEMENT_LIMIT_CHANGED', 'USER_PASSWORD_RESET_LINK_SENT', 'USER_TEMP_PASSWORD_SET', 'USER_SESSIONS_INVALIDATED', 'USER_2FA_RESET', 'USER_ROLE_CHANGED', 'USER_LOCKED', 'USER_UNLOCKED', 'USER_SOFT_DELETED', 'IMPERSONATION_REQUESTED', 'IMPERSONATION_OTP_VERIFIED', 'IMPERSONATION_OTP_FAILED', 'IMPERSONATION_OTP_EXPIRED', 'IMPERSONATION_CANCELLED', 'IMPERSONATION_STARTED', 'IMPERSONATION_ENDED', 'OWNER_ACCOUNT_CREATED', 'OWNER_ACCOUNT_ROLE_CHANGED', 'OWNER_ACCOUNT_DISABLED');

-- CreateEnum
CREATE TYPE "TenantModule" AS ENUM ('CRM', 'ORDERS_QUOTES', 'INVOICES_QR', 'WORKSHOP_PLAN', 'STAFF_PLAN', 'TIME_KIOSK', 'API_ACCESS', 'WHITELABEL');

-- CreateEnum
CREATE TYPE "ImpersonationScope" AS ENUM ('READONLY', 'FULL');

-- CreateEnum
CREATE TYPE "ImpersonationEmailStatus" AS ENUM ('PENDING', 'SENT', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImpersonationEndReason" AS ENUM ('EXIT_BY_OWNER', 'EXPIRED', 'FORCED_END');

-- CreateTable
CREATE TABLE "OwnerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "OwnerRole" NOT NULL DEFAULT 'OWNER_SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webauthnEnrolledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerWebAuthnCredential" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerWebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSession" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sudoUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerAuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerAccountId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "action" "OwnerAuditAction" NOT NULL,
    "targetCompanyId" TEXT,
    "targetUserId" TEXT,
    "reason" TEXT,
    "ticketRef" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "payloadBefore" JSONB,
    "payloadAfter" JSONB,
    "consentTokenId" TEXT,

    CONSTRAINT "OwnerAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEntitlement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "module" "TenantModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyLimit" INTEGER,
    "updatedByOwnerAccountId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationConsentToken" (
    "id" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "ticketRef" TEXT,
    "scope" "ImpersonationScope" NOT NULL,
    "requestedDurationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailDeliveryStatus" "ImpersonationEmailStatus" NOT NULL DEFAULT 'PENDING',
    "ipRequestedFrom" TEXT,
    "userAgentRequestedFrom" TEXT,

    CONSTRAINT "ImpersonationConsentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "consentTokenId" TEXT NOT NULL,
    "ownerAccountId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "scope" "ImpersonationScope" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" "ImpersonationEndReason",
    "mutationsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerAccount_email_key" ON "OwnerAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerWebAuthnCredential_credentialId_key" ON "OwnerWebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "OwnerWebAuthnCredential_ownerAccountId_idx" ON "OwnerWebAuthnCredential"("ownerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSession_tokenHash_key" ON "OwnerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OwnerSession_ownerAccountId_expiresAt_idx" ON "OwnerSession"("ownerAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "OwnerAuditLog_ownerAccountId_timestamp_idx" ON "OwnerAuditLog"("ownerAccountId", "timestamp");

-- CreateIndex
CREATE INDEX "OwnerAuditLog_targetCompanyId_timestamp_idx" ON "OwnerAuditLog"("targetCompanyId", "timestamp");

-- CreateIndex
CREATE INDEX "OwnerAuditLog_action_timestamp_idx" ON "OwnerAuditLog"("action", "timestamp");

-- CreateIndex
CREATE INDEX "TenantEntitlement_companyId_idx" ON "TenantEntitlement"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantEntitlement_companyId_module_key" ON "TenantEntitlement"("companyId", "module");

-- CreateIndex
CREATE INDEX "ImpersonationConsentToken_ownerAccountId_expiresAt_idx" ON "ImpersonationConsentToken"("ownerAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "ImpersonationConsentToken_targetUserId_expiresAt_idx" ON "ImpersonationConsentToken"("targetUserId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImpersonationSession_consentTokenId_key" ON "ImpersonationSession"("consentTokenId");

-- CreateIndex
CREATE INDEX "ImpersonationSession_ownerAccountId_startedAt_idx" ON "ImpersonationSession"("ownerAccountId", "startedAt");

-- CreateIndex
CREATE INDEX "ImpersonationSession_targetCompanyId_startedAt_idx" ON "ImpersonationSession"("targetCompanyId", "startedAt");

-- AddForeignKey
ALTER TABLE "OwnerWebAuthnCredential" ADD CONSTRAINT "OwnerWebAuthnCredential_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "OwnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerSession" ADD CONSTRAINT "OwnerSession_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "OwnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerAuditLog" ADD CONSTRAINT "OwnerAuditLog_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "OwnerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerAuditLog" ADD CONSTRAINT "OwnerAuditLog_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerAuditLog" ADD CONSTRAINT "OwnerAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEntitlement" ADD CONSTRAINT "TenantEntitlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationConsentToken" ADD CONSTRAINT "ImpersonationConsentToken_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "OwnerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationConsentToken" ADD CONSTRAINT "ImpersonationConsentToken_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationConsentToken" ADD CONSTRAINT "ImpersonationConsentToken_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_consentTokenId_fkey" FOREIGN KEY ("consentTokenId") REFERENCES "ImpersonationConsentToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_ownerAccountId_fkey" FOREIGN KEY ("ownerAccountId") REFERENCES "OwnerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpersonationSession" ADD CONSTRAINT "ImpersonationSession_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
