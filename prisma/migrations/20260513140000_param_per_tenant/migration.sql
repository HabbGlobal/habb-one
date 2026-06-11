-- SystemParameter pro Mandant — bisher war die Tabelle global geteilt.
--
-- Datenstrategie: 71 globale Parameter-Rows existieren bereits (vom
-- Backfill-Skript). Beim Wechsel auf Composite-PK clonen wir sie für
-- JEDEN aktiven Mandanten, sodass nach der Migration jeder Tenant seine
-- eigene Kopie hat — initial mit denselben Werten. Anpassungen im
-- Owner-/Admin-UI laufen ab dann pro-Mandant.
--
-- ParameterChangeLog ist aktuell leer (Params wurden gerade erst neu
-- gesetzt, keine User-Edits) — wir löschen vorhandene Rows sicher mit
-- TRUNCATE und passen das Schema an.

-- ─── 1) Snapshot der globalen Param-Rows in temporärer Tabelle ─────
CREATE TEMP TABLE "_param_globals" AS
  SELECT key, category, "subCategory", label, description, "valueType",
         "currentValue", "defaultValue", unit, "minValue", "maxValue",
         step, "affectsFormula", "updatedById"
  FROM "SystemParameter";

-- ─── 2) ChangeLog leeren (FK wäre sonst dirty) + FK fallen lassen ──
TRUNCATE TABLE "ParameterChangeLog";
ALTER TABLE "ParameterChangeLog"
  DROP CONSTRAINT IF EXISTS "ParameterChangeLog_parameterKey_fkey";

-- ─── 3) Alte SystemParameter-Tabelle leeren + Schema umbauen ───────
TRUNCATE TABLE "SystemParameter";
ALTER TABLE "SystemParameter" DROP CONSTRAINT IF EXISTS "SystemParameter_pkey";

ALTER TABLE "SystemParameter" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SystemParameter"
  ADD CONSTRAINT "SystemParameter_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;

-- ─── 4) Param-Rows pro Mandant aus dem Snapshot wiederherstellen ───
INSERT INTO "SystemParameter" (
  "companyId", key, category, "subCategory", label, description,
  "valueType", "currentValue", "defaultValue", unit, "minValue",
  "maxValue", step, "affectsFormula", "updatedById", "updatedAt"
)
SELECT c.id, g.key, g.category, g."subCategory", g.label, g.description,
       g."valueType", g."currentValue", g."defaultValue", g.unit, g."minValue",
       g."maxValue", g.step, g."affectsFormula", g."updatedById", NOW()
FROM "Company" c
CROSS JOIN "_param_globals" g
WHERE c."registrationStatus" = 'ACTIVE'
  AND c."suspendedAt" IS NULL;

-- ─── 5) Composite PK + Indizes ─────────────────────────────────────
ALTER TABLE "SystemParameter" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SystemParameter"
  ADD CONSTRAINT "SystemParameter_pkey" PRIMARY KEY ("companyId", "key");

DROP INDEX IF EXISTS "SystemParameter_category_idx";
DROP INDEX IF EXISTS "SystemParameter_subCategory_idx";
CREATE INDEX "SystemParameter_companyId_category_idx"
  ON "SystemParameter"("companyId", category);
CREATE INDEX "SystemParameter_companyId_subCategory_idx"
  ON "SystemParameter"("companyId", "subCategory");

-- ─── 6) ParameterChangeLog: parameterCompanyId-Spalte + Composite-FK ─
ALTER TABLE "ParameterChangeLog" ADD COLUMN "parameterCompanyId" TEXT NOT NULL;

DROP INDEX IF EXISTS "ParameterChangeLog_parameterKey_effectiveAt_idx";
CREATE INDEX "ParameterChangeLog_param_idx"
  ON "ParameterChangeLog"("parameterCompanyId", "parameterKey", "effectiveAt");

ALTER TABLE "ParameterChangeLog"
  ADD CONSTRAINT "ParameterChangeLog_parameter_fkey"
  FOREIGN KEY ("parameterCompanyId", "parameterKey")
  REFERENCES "SystemParameter"("companyId", "key") ON DELETE CASCADE;
