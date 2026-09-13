-- Round S11: crash reporting without a vendor (Matthew, Sep 13 2026)
ALTER TABLE "Feedback" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Feedback" ADD COLUMN "reportCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Feedback" ADD COLUMN "fingerprint" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Feedback" ADD COLUMN "crash" JSONB;
ALTER TABLE "Feedback" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "commit" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Feedback_fingerprint_idx" ON "Feedback"("fingerprint");
CREATE INDEX "Feedback_reportCode_idx" ON "Feedback"("reportCode");

CREATE TABLE "CrashGroup" (
  "fingerprint" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "side" TEXT NOT NULL DEFAULT 'web',
  "status" TEXT NOT NULL DEFAULT 'new',
  "fixedInBuild" TEXT,
  "note" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "people" JSONB NOT NULL DEFAULT '[]',
  "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastBuild" TEXT NOT NULL DEFAULT '',
  "sampleId" TEXT NOT NULL,
  "notifiedAt" TIMESTAMP(3),
  CONSTRAINT "CrashGroup_pkey" PRIMARY KEY ("fingerprint")
);
CREATE INDEX "CrashGroup_status_lastSeen_idx" ON "CrashGroup"("status", "lastSeen");

CREATE TABLE "SourceMap" (
  "id" TEXT NOT NULL,
  "buildId" TEXT NOT NULL,
  "file" TEXT NOT NULL,
  "map" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceMap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SourceMap_buildId_idx" ON "SourceMap"("buildId");
