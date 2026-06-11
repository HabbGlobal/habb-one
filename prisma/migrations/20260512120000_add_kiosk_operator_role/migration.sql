-- Add KIOSK_OPERATOR to UserRole enum.
-- Used by workshop-tablet accounts: log in via /login, land directly on the
-- time-tracking kiosk (employee tiles), have no admin/backoffice access.

ALTER TYPE "UserRole" ADD VALUE 'KIOSK_OPERATOR';
