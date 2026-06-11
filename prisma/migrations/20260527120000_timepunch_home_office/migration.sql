-- Home-Office-Markierung auf TimePunch.
--
-- Wird auf die CLOCK_IN/CLOCK_OUT-Punches einer Arbeits-Spanne gesetzt,
-- wenn diese als Home Office erfasst wurde. Rechnerisch identisch zu
-- normaler Arbeit (zählt als Arbeitszeit) — dient nur der Unterscheidung
-- in Ansicht/Auswertung. DEFAULT false → bestehende Punches + Kiosk
-- bleiben "Vor-Ort-Arbeit", keine Daten-Migration nötig.
ALTER TABLE "TimePunch"
  ADD COLUMN "isHomeOffice" BOOLEAN NOT NULL DEFAULT false;
