-- PowerSync system of record. IF NOT EXISTS because local dev may already
-- have the table from the spike's init.sql.
--
-- PRIMARY KEY is (company_id, id): record ids are only unique per company —
-- deterministic ids (the seed-* product catalog every fresh device creates)
-- collide across companies by design. A device only ever syncs its own
-- company's bucket, so ids stay unique client-side.
CREATE TABLE IF NOT EXISTS "records" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "table_name" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  CONSTRAINT "records_pkey" PRIMARY KEY ("company_id", "id")
);

-- Spike-era table had PRIMARY KEY (id) — upgrade it in place.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'records' AND tc.constraint_type = 'PRIMARY KEY'
    GROUP BY tc.constraint_name
    HAVING count(*) = 1
  ) THEN
    ALTER TABLE "records" DROP CONSTRAINT "records_pkey";
    ALTER TABLE "records" ADD CONSTRAINT "records_pkey" PRIMARY KEY ("company_id", "id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "records_company_id_idx" ON "records"("company_id");

-- The PowerSync replicator requires a publication. Scoped to the records
-- table only — the rest of the schema is not replicated to devices.
-- (Requires wal_level=logical; on managed Postgres run
--  ALTER SYSTEM SET wal_level = logical; and restart before deploying.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE "records";
  END IF;
END $$;
