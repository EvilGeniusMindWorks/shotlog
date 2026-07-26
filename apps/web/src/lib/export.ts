// Full local export — works entirely offline, no server involved.
import { db } from '@/db';
import { serializeValue } from '@/db/powersync/blobMarkers';

const EXPORT_TABLES = [
  'jobs',
  'blasterProfiles',
  'blastDays',
  'blastLogs',
  'shots',
  'seismoReadings',
  'explosiveUsages',
  'typicalColumns',
  'dailyReports',
  'workForceEntries',
  'equipmentEntries',
  'materialEntries',
  'subcontractorEntries',
  'crewMembers',
  'equipment',
  'productCatalog',
  'attachments',
] as const;

export async function exportAllData(): Promise<Blob> {
  const dump: Record<string, unknown[]> = {};
  for (const tableName of EXPORT_TABLES) {
    const rows = await db.table(tableName).toArray();
    dump[tableName] = (await Promise.all(rows.map((r) => serializeValue(r)))) as unknown[];
  }
  return new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, tables: dump }, null, 1)],
    { type: 'application/json' },
  );
}
