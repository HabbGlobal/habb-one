-- Owner-Portal: gelöschte User können wieder freigeschaltet werden.
-- ENUM-Erweiterung um eigene Audit-Action für die Restore-Operation.
ALTER TYPE "OwnerAuditAction" ADD VALUE 'USER_RESTORED';
