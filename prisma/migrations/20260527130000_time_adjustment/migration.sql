-- Manuelle Zeit-Korrektur (Gleitzeit-Anpassung) durch CEO/Sekretariat.
-- Signierte Minuten: + dazurechnen / − abziehen. Fliesst in den
-- kumulierten Saldo der Personalabrechnung ein. Auditierbar.
CREATE TABLE "TimeAdjustment" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "employeeId"    TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "minutes"       INTEGER NOT NULL,
  "reason"        TEXT NOT NULL,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TimeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimeAdjustment_employeeId_effectiveDate_idx"
  ON "TimeAdjustment"("employeeId", "effectiveDate");

CREATE INDEX "TimeAdjustment_companyId_idx"
  ON "TimeAdjustment"("companyId");

ALTER TABLE "TimeAdjustment"
  ADD CONSTRAINT "TimeAdjustment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeAdjustment"
  ADD CONSTRAINT "TimeAdjustment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
