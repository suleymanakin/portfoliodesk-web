-- Manual migration: enums + indexes (shadow DB permission workaround)

BEGIN;

DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM ('admin', 'investor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MovementType" AS ENUM ('deposit', 'withdraw');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Convert role/type columns to enums
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::"UserRole";

ALTER TABLE "capital_movements"
  ALTER COLUMN "type" TYPE "MovementType"
  USING "type"::"MovementType";

-- Replace capital_movements indexes with composite index
DROP INDEX IF EXISTS capital_movements_date_idx;
DROP INDEX IF EXISTS "capital_movements_investorId_idx";
CREATE INDEX IF NOT EXISTS "capital_movements_investorId_date_id_idx"
  ON "capital_movements" ("investorId", "date", "id");

-- investor_history: single-column indexes are redundant for our queries; keep the unique (investorId, date)
DROP INDEX IF EXISTS investor_history_date_idx;
DROP INDEX IF EXISTS "investor_history_investorId_idx";

COMMIT;

