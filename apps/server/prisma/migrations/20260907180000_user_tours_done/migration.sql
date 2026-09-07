-- Round S7c: screen tours auto-run once per ACCOUNT per screen
ALTER TABLE "User" ADD COLUMN "toursDone" JSONB NOT NULL DEFAULT '[]';
