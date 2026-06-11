-- Neues Abo-Paket "Zeiterfassung" (TIME_ONLY): nur das TIME_KIOSK-Modul,
-- CHF 29.-/Mt. Reiner Enum-Wert — rückwärtskompatibel, keine Daten-Migration.
-- ADD VALUE wird in keiner Transaktion VERWENDET, nur hinzugefügt (PG-safe).
ALTER TYPE "TenantPlan" ADD VALUE IF NOT EXISTS 'TIME_ONLY' BEFORE 'STARTER';
