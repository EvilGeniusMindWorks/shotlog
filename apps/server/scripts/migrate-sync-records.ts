// One-time cutover migration: copy the old sync engine's SyncRecord
// documents into the PowerSync `records` table.
//
// - Tombstoned rows (deletedAt set) are skipped — deletion already happened.
// - Payload wire format is identical (JSON with base64 blob markers), so
//   rows copy verbatim.
// - Idempotent and non-destructive: existing `records` rows are NEVER
//   overwritten (once PowerSync is live it is the authority); SyncRecord
//   rows are left in place as the read-only safety net for one release.
//
// Run: npx tsx scripts/migrate-sync-records.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.syncRecord.findMany({ where: { deletedAt: null } });
  let copied = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.tableName === 'tombstones') {
      skipped++;
      continue;
    }
    const result = await prisma.$executeRaw`
      INSERT INTO "records" ("id", "company_id", "table_name", "payload", "updated_at")
      VALUES (${row.recordId}, ${row.companyId}, ${row.tableName},
              ${JSON.stringify(row.payload)}, ${row.updatedAt.toISOString()})
      ON CONFLICT ("company_id", "id") DO NOTHING`;
    if (result > 0) copied++;
    else skipped++;
  }
  console.log(`migrated ${copied} records, skipped ${skipped} (tombstones/already present)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
