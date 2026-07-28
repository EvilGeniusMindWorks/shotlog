-- Append-only audit trail (who / when / what changed, field-level).
CREATE TABLE IF NOT EXISTS "AuditEntry" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "recordId"  TEXT NOT NULL,
  "op"        TEXT NOT NULL,
  "actorId"   TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changes"   JSONB NOT NULL DEFAULT '[]',
  "reason"    TEXT,

  CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditEntry_companyId_at_idx" ON "AuditEntry"("companyId", "at");
CREATE INDEX IF NOT EXISTS "AuditEntry_companyId_recordId_at_idx" ON "AuditEntry"("companyId", "recordId", "at");
CREATE INDEX IF NOT EXISTS "AuditEntry_companyId_actorId_at_idx" ON "AuditEntry"("companyId", "actorId", "at");
