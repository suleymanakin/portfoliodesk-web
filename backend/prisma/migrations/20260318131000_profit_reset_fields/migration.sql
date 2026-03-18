-- Add profit reset tracking to investors

BEGIN;

ALTER TABLE "investors"
  ADD COLUMN IF NOT EXISTS "realizedProfit" DECIMAL(20,10) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "profitResetDate" DATE;

COMMIT;

