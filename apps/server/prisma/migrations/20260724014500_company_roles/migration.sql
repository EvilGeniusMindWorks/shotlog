-- Company + roles, and re-scope sync records from per-user to per-company.
-- Written by hand so existing data migrates in place (the auto-generated
-- diff would fail on NOT NULL adds against populated tables).

-- 1. Company table, with a default company for all existing data
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Company" ("id", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'Baystate Blasting, Inc.');

-- 2. User: add role/isActive/companyId; existing users become admins of the
--    default company (they were the bootstrap account)
ALTER TABLE "User"
    ADD COLUMN "companyId" TEXT,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "role" TEXT NOT NULL DEFAULT 'blaster';

UPDATE "User"
SET "companyId" = '00000000-0000-4000-8000-000000000001',
    "role" = 'admin';

ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;

CREATE INDEX "User_companyId_idx" ON "User"("companyId");

ALTER TABLE "User"
    ADD CONSTRAINT "User_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. SyncRecord: re-key from userId to companyId, backfilling through each
--    record's owner
ALTER TABLE "SyncRecord" DROP CONSTRAINT "SyncRecord_userId_fkey";
DROP INDEX "SyncRecord_userId_updatedAt_idx";

ALTER TABLE "SyncRecord" ADD COLUMN "companyId" TEXT;

UPDATE "SyncRecord" sr
SET "companyId" = u."companyId"
FROM "User" u
WHERE u."id" = sr."userId";

-- Orphans (owner deleted) attach to the default company rather than vanish
UPDATE "SyncRecord"
SET "companyId" = '00000000-0000-4000-8000-000000000001'
WHERE "companyId" IS NULL;

ALTER TABLE "SyncRecord" ALTER COLUMN "companyId" SET NOT NULL;

-- Two users of one company may have pushed the same record id: keep the
-- newest by the LWW clock before re-keying
DELETE FROM "SyncRecord" a
USING "SyncRecord" b
WHERE a."companyId" = b."companyId"
  AND a."tableName" = b."tableName"
  AND a."recordId" = b."recordId"
  AND (a."updatedAt" < b."updatedAt"
       OR (a."updatedAt" = b."updatedAt" AND a.ctid < b.ctid));

ALTER TABLE "SyncRecord" DROP CONSTRAINT "SyncRecord_pkey";
ALTER TABLE "SyncRecord" DROP COLUMN "userId";
ALTER TABLE "SyncRecord"
    ADD CONSTRAINT "SyncRecord_pkey" PRIMARY KEY ("companyId", "tableName", "recordId");

CREATE INDEX "SyncRecord_companyId_updatedAt_idx" ON "SyncRecord"("companyId", "updatedAt");

ALTER TABLE "SyncRecord"
    ADD CONSTRAINT "SyncRecord_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
