import Dexie, { type EntityTable } from 'dexie';
import type {
  Tombstone,
  Job,
  BlasterProfile,
  BlastDay,
  BlastLog,
  Shot,
  SeismoReading,
  ExplosiveUsage,
  TypicalColumn,
  DailyReport,
  WorkForceEntry,
  EquipmentEntry,
  MaterialEntry,
  SubcontractorEntry,
  CrewMember,
  Equipment,
  ProductCatalogItem,
  Attachment,
} from './schema';

/**
 * SCHEMA MIGRATION RULES — read before touching any version() block.
 *
 * Field devices hold real blast records that only exist locally until sync
 * ships. A botched migration is unrecoverable data loss. Therefore:
 *
 * 1. NEVER edit or delete an existing this.version(n) block once it has been
 *    released — not even to add an index. Past versions are frozen history.
 * 2. To change the schema, ADD a new block:
 *      this.version(n + 1).stores({ ...only tables whose indexes changed... })
 *    and, if records need reshaping, chain .upgrade(async (tx) => { ... }).
 *    Dexie applies upgrades sequentially, so a device that skipped several
 *    app updates still walks every step.
 * 3. stores() lists INDEXED fields only — adding a plain (non-queried) field
 *    to a record type needs no schema bump at all. Only bump for new tables,
 *    new indexes, or data reshaping.
 * 4. Upgrade functions must be idempotent and must not throw on records that
 *    are already in the new shape (sync may deliver new-shape records early).
 * 5. Test every migration against a populated old-version DB before release
 *    (export a fixture via the browser devtools, load it, upgrade, verify).
 */
class ShotLogDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  blasterProfiles!: EntityTable<BlasterProfile, 'id'>;
  blastDays!: EntityTable<BlastDay, 'id'>;
  blastLogs!: EntityTable<BlastLog, 'id'>;
  shots!: EntityTable<Shot, 'id'>;
  seismoReadings!: EntityTable<SeismoReading, 'id'>;
  explosiveUsages!: EntityTable<ExplosiveUsage, 'id'>;
  typicalColumns!: EntityTable<TypicalColumn, 'id'>;
  dailyReports!: EntityTable<DailyReport, 'id'>;
  workForceEntries!: EntityTable<WorkForceEntry, 'id'>;
  equipmentEntries!: EntityTable<EquipmentEntry, 'id'>;
  materialEntries!: EntityTable<MaterialEntry, 'id'>;
  subcontractorEntries!: EntityTable<SubcontractorEntry, 'id'>;
  crewMembers!: EntityTable<CrewMember, 'id'>;
  equipment!: EntityTable<Equipment, 'id'>;
  productCatalog!: EntityTable<ProductCatalogItem, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  tombstones!: EntityTable<Tombstone, 'id'>;

  constructor() {
    super('ShotLogDB');

    this.version(1).stores({
      jobs: 'id, name, customer, state, isActive, createdAt, updatedAt, syncStatus',
      blasterProfiles: 'id, name, isCurrentUser, isActive, syncStatus',
      blastDays: 'id, date, jobId, status, createdAt, updatedAt, syncStatus',
      blastLogs: 'id, blastDayId, syncStatus',
      shots: 'id, blastLogId, shotNumber, syncStatus',
      seismoReadings: 'id, shotId, graphNumber, syncStatus',
      explosiveUsages: 'id, blastLogId, syncStatus',
      typicalColumns: 'id, shotId, syncStatus',
      dailyReports: 'id, blastDayId, syncStatus',
      workForceEntries: 'id, dailyReportId, rowNumber, syncStatus',
      equipmentEntries: 'id, dailyReportId, category, syncStatus',
      materialEntries: 'id, dailyReportId, syncStatus',
      subcontractorEntries: 'id, dailyReportId, syncStatus',
      crewMembers: 'id, name, isActive, syncStatus',
      equipment: 'id, assetNumber, category, isActive, syncStatus',
      productCatalog: 'id, manufacturer, productName, category, isActive, syncStatus',
      attachments: 'id, parentId, parentType, syncStatus',
    });

    // v2: tombstones — deletions must survive sync or the server copy
    // resurrects deleted records on the next pull
    this.version(2).stores({
      tombstones: 'id, syncStatus',
    });
  }
}

/**
 * Delete a record AND leave a tombstone so the deletion syncs.
 * Use this instead of table.delete() for any synced table.
 */
export async function deleteWithTombstone(tableName: string, recordId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', [db.table(tableName), db.tombstones], async () => {
    await db.table(tableName).delete(recordId);
    await db.tombstones.put({
      id: `${tableName}:${recordId}`,
      tableName,
      recordId,
      deletedAt: now,
      syncStatus: 'local',
    });
  });
}

export const db = new ShotLogDB();
