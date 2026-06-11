-- Kiosk-Lock-Timeout pro Mandant.
--
-- 0 = niemals automatisch ausloggen (Default für Werkstatt-Tablet, das
-- physisch im Betrieb hängt). > 0 = nach so vielen Minuten Inaktivität
-- fällt das Tablet zurück auf den Passwort-Screen.
--
-- DEFAULT 0 backfillt bestehende Mandanten implizit auf "nie ausloggen"
-- — das war die explizite Anforderung des Users ("Werkstatt-Tablet soll
-- sich nie automatisch ausloggen, bei allen bestehenden und zukünftigen
-- Mandanten").
ALTER TABLE "Company"
  ADD COLUMN "kioskLockTimeoutMinutes" INTEGER NOT NULL DEFAULT 0;
