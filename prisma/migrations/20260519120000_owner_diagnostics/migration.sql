-- Owner-Diagnostics / Security-Monitoring (Phase 1).
-- App-Layer-Autorisierung (requireOwner) statt RLS — konsistent mit
-- dem restlichen Repo. companyId-FKs onDelete:Cascade, damit der
-- bestehende Tenant-Hard-Delete diese Zeilen automatisch mitnimmt.

CREATE TABLE "TenantHealthSnapshot" (
  "id"                    TEXT NOT NULL,
  "companyId"             TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'unknown',
  "score"                 INTEGER NOT NULL DEFAULT 100,
  "lastCheckedAt"         TIMESTAMP(3),
  "openFindingsCount"     INTEGER NOT NULL DEFAULT 0,
  "criticalFindingsCount" INTEGER NOT NULL DEFAULT 0,
  "warningFindingsCount"  INTEGER NOT NULL DEFAULT 0,
  "securityEventsCount"   INTEGER NOT NULL DEFAULT 0,
  "avgResponseMs"         INTEGER,
  "metadata"              JSONB NOT NULL DEFAULT '{}',
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantHealthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantHealthSnapshot_companyId_key" ON "TenantHealthSnapshot"("companyId");

CREATE TABLE "DiagnosticRun" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "triggeredBy"   TEXT NOT NULL,
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"    TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'running',
  "durationMs"    INTEGER,
  "checksTotal"   INTEGER NOT NULL DEFAULT 0,
  "checksPassed"  INTEGER NOT NULL DEFAULT 0,
  "checksWarning" INTEGER NOT NULL DEFAULT 0,
  "checksFailed"  INTEGER NOT NULL DEFAULT 0,
  "summary"       TEXT,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiagnosticRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiagnosticRun_companyId_startedAt_idx" ON "DiagnosticRun"("companyId", "startedAt");

CREATE TABLE "DiagnosticFinding" (
  "id"               TEXT NOT NULL,
  "companyId"        TEXT NOT NULL,
  "runId"            TEXT,
  "category"         TEXT NOT NULL,
  "severity"         TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "message"          TEXT NOT NULL,
  "technicalDetails" JSONB NOT NULL DEFAULT '{}',
  "recommendation"   TEXT,
  "status"           TEXT NOT NULL DEFAULT 'open',
  "dedupeKey"        TEXT NOT NULL,
  "firstSeenAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiagnosticFinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiagnosticFinding_companyId_dedupeKey_key" ON "DiagnosticFinding"("companyId", "dedupeKey");
CREATE INDEX "DiagnosticFinding_companyId_status_severity_idx" ON "DiagnosticFinding"("companyId", "status", "severity");

CREATE TABLE "SecurityEvent" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT,
  "actorUserId"   TEXT,
  "eventType"     TEXT NOT NULL,
  "severity"      TEXT NOT NULL,
  "source"        TEXT NOT NULL,
  "ipHash"        TEXT,
  "userAgentHash" TEXT,
  "riskScore"     INTEGER NOT NULL DEFAULT 0,
  "message"       TEXT NOT NULL,
  "evidence"      JSONB NOT NULL DEFAULT '{}',
  "detectedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SecurityEvent_companyId_detectedAt_idx" ON "SecurityEvent"("companyId", "detectedAt");
CREATE INDEX "SecurityEvent_severity_detectedAt_idx" ON "SecurityEvent"("severity", "detectedAt");

CREATE TABLE "DiagnosticEmailNotification" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT,
  "runId"             TEXT,
  "findingId"         TEXT,
  "securityEventId"   TEXT,
  "recipientEmail"    TEXT NOT NULL,
  "subject"           TEXT NOT NULL,
  "severity"          TEXT NOT NULL,
  "notificationType"  TEXT NOT NULL,
  "dedupeKey"         TEXT,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "providerMessageId" TEXT,
  "errorMessage"      TEXT,
  "sentAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiagnosticEmailNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiagnosticEmailNotification_dedupeKey_createdAt_idx" ON "DiagnosticEmailNotification"("dedupeKey", "createdAt");
CREATE INDEX "DiagnosticEmailNotification_status_createdAt_idx" ON "DiagnosticEmailNotification"("status", "createdAt");

-- FKs
ALTER TABLE "TenantHealthSnapshot" ADD CONSTRAINT "TenantHealthSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosticRun" ADD CONSTRAINT "DiagnosticRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosticFinding" ADD CONSTRAINT "DiagnosticFinding_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosticFinding" ADD CONSTRAINT "DiagnosticFinding_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosticEmailNotification" ADD CONSTRAINT "DiagnosticEmailNotification_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosticEmailNotification" ADD CONSTRAINT "DiagnosticEmailNotification_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "DiagnosticRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosticEmailNotification" ADD CONSTRAINT "DiagnosticEmailNotification_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "DiagnosticFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosticEmailNotification" ADD CONSTRAINT "DiagnosticEmailNotification_securityEventId_fkey"
  FOREIGN KEY ("securityEventId") REFERENCES "SecurityEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
