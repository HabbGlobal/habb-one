-- Owner-Portal Stammdaten-Edit: ergänze OwnerAuditAction um Wert für
-- Mandanten-Stammdaten-Änderungen.
ALTER TYPE "OwnerAuditAction" ADD VALUE 'TENANT_STAMMDATEN_UPDATED';
