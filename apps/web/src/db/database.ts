import Dexie, { type EntityTable } from 'dexie';
import type {
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
  }
}

export const db = new ShotLogDB();
