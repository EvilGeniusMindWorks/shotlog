-- Personal blasting licenses on the user account (one per state)
ALTER TABLE "User" ADD COLUMN "licenses" JSONB NOT NULL DEFAULT '[]';
