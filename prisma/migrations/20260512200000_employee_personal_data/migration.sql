-- Personalstammdaten-Erweiterung für Employee + neue EmployeeSkill-Tabelle.

ALTER TABLE "Employee"
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "address"     TEXT,
  ADD COLUMN "ahvNumber"   TEXT;

CREATE TABLE "EmployeeSkill" (
  "employeeId"     TEXT NOT NULL,
  "skillCode"      "SkillCode" NOT NULL,
  "level"          "SkillLevel" NOT NULL,
  "certifiedUntil" TIMESTAMP(3),
  CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("employeeId", "skillCode")
);

CREATE INDEX "EmployeeSkill_skillCode_idx" ON "EmployeeSkill"("skillCode");

ALTER TABLE "EmployeeSkill"
  ADD CONSTRAINT "EmployeeSkill_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
