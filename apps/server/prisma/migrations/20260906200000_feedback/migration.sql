-- Round S3: in-app feedback + crash reports (platform-level, never synced)
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '',
    "buildId" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "viewport" TEXT NOT NULL DEFAULT '',
    "online" BOOLEAN NOT NULL DEFAULT true,
    "standalone" BOOLEAN NOT NULL DEFAULT false,
    "syncLogTail" JSONB NOT NULL DEFAULT '[]',
    "errorLog" JSONB NOT NULL DEFAULT '[]',
    "screenshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "replyNote" TEXT,
    "notified" TEXT NOT NULL DEFAULT 'email-off',
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Feedback_companyId_status_idx" ON "Feedback"("companyId", "status");
CREATE INDEX "Feedback_receivedAt_idx" ON "Feedback"("receivedAt");
