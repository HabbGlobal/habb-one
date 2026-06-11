-- Öffentliches Tracking-Token pro Auftrag (UUID v4, kryptografisch
-- zufällig, global eindeutig). Verhindert strukturell, dass Mandanten
-- im Tracking kollidieren oder vertauscht werden — der Mandant wird
-- IMMER aus dem aufgelösten Auftrag abgeleitet, nie aus der URL.
--
-- Reihenfolge: Spalte nullable anlegen → bestehende Zeilen mit
-- gen_random_uuid() backfillen → NOT NULL erzwingen → Unique-Index.
-- gen_random_uuid() ist in PostgreSQL >= 13 (Supabase) eingebaut.

ALTER TABLE "Order" ADD COLUMN "trackingToken" TEXT;

UPDATE "Order"
  SET "trackingToken" = gen_random_uuid()::text
  WHERE "trackingToken" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "trackingToken" SET NOT NULL;

CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");
