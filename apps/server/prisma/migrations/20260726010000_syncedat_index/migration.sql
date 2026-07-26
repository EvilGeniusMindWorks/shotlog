-- Pull now filters on server receive time (syncedAt), not client updatedAt
CREATE INDEX "SyncRecord_companyId_syncedAt_idx" ON "SyncRecord"("companyId", "syncedAt");
