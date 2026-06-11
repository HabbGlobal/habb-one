-- Per-User-Permission-Overrides + zwei neue OwnerAuditAction-Werte.
--
-- UserPermission liegt ALS Layer ÜBER der RolePermission-Matrix:
--   • allowed = true  → zusätzliches Recht beyond role
--   • allowed = false → explizit entzogenes Recht (DENY wins)
-- Auflösung: SUPERADMIN-Bypass → Static Default → RolePermission (Tenant)
-- → UserPermission (User). Code-seitig in lib/permissions.ts.

CREATE TABLE "UserPermission" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "permission"  TEXT NOT NULL,
  "allowed"     BOOLEAN NOT NULL,
  "updatedById" TEXT,
  "updatedByOwnerAccountId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPermission_userId_permission_key"
  ON "UserPermission"("userId", "permission");

CREATE INDEX "UserPermission_companyId_idx"
  ON "UserPermission"("companyId");

CREATE INDEX "UserPermission_userId_idx"
  ON "UserPermission"("userId");

ALTER TABLE "UserPermission"
  ADD CONSTRAINT "UserPermission_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermission"
  ADD CONSTRAINT "UserPermission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- OwnerAuditAction-Enum erweitern. Postgres erlaubt nur ADD VALUE
-- ausserhalb einer Transaktion, aber Prisma migrate führt jede
-- migration.sql implizit in einer TX aus. Workaround: COMMIT zwischendurch
-- ist nicht möglich — daher splitten wir die statements: ALTER TYPE
-- vor allen Table-Ops ist ok, wenn die DDL-TX nichts danach mehr ändert
-- was diese Werte braucht. Hier brauchen wir die Werte erst zur Runtime
-- (nicht in der Migration selbst).
ALTER TYPE "OwnerAuditAction" ADD VALUE 'USER_PERMISSIONS_UPDATED';
ALTER TYPE "OwnerAuditAction" ADD VALUE 'TENANT_ROLE_MATRIX_UPDATED';
