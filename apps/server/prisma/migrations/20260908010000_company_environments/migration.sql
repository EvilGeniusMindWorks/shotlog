-- Round S8c: Alpha / Beta / Production companies + platform-admin twins
ALTER TABLE "Company" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';
ALTER TABLE "User" ADD COLUMN "platformRootId" TEXT;
CREATE INDEX "User_platformRootId_idx" ON "User"("platformRootId");
UPDATE "Company" SET "environment" = 'sandbox' WHERE "name" = 'ShotLog Sandbox';
