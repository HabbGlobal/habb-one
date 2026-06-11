-- Repair migration: brings the database in line with the Prisma schema.
-- On the legacy Singapore Supabase project, these columns were added via
-- `prisma db push` ad-hoc without producing migration files. On a freshly
-- migrated database (e.g. Zurich project) they are therefore missing.

-- Application area (Indoor/Outdoor) for spray-shop process planning.
CREATE TYPE "ApplicationArea" AS ENUM ('INDOOR', 'OUTDOOR', 'BOTH');

-- Per-company kiosk password hash + uploaded logo (PNG/JPEG bytes).
ALTER TABLE "Company"
  ADD COLUMN "kioskPasswordHash" TEXT,
  ADD COLUMN "logoData"          BYTEA,
  ADD COLUMN "logoMimeType"      TEXT;

-- Application area on order and quote items.
ALTER TABLE "OrderItem"  ADD COLUMN "applicationArea" "ApplicationArea";
ALTER TABLE "QuoteItem"  ADD COLUMN "applicationArea" "ApplicationArea";
