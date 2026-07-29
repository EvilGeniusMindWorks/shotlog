// The data-access contract shared by both backends (Dexie today, PowerSync
// after cutover). It is the EXACT Dexie subset the UI uses — nothing more.
// UI code must type-check against this interface, so any new Dexie feature
// creeping in fails the build instead of silently breaking the facade.
import type {
  CompanySettings,
  DrillChecklist,
  DrillLog,
  DrillPlanRecord,
  DrillLogHole,
  Incident,
  Submission,
  RepairTicket,
  Manufacturer,
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

export interface FacadeCollection<T> {
  toArray(): Promise<T[]>;
  first(): Promise<T | undefined>;
  count(): Promise<number>;
  sortBy(key: string): Promise<T[]>;
  reverse(): FacadeCollection<T>;
  filter(fn: (item: T) => boolean): FacadeCollection<T>;
}

export interface FacadeWhereClause<T> {
  equals(value: string | number): FacadeCollection<T>;
  anyOf(values: readonly (string | number)[]): FacadeCollection<T>;
}

export interface FacadeTable<T> {
  get(id: string): Promise<T | undefined>;
  add(item: T): Promise<string>;
  put(item: T): Promise<string>;
  update(id: string, changes: Record<string, unknown>): Promise<number>;
  delete(id: string): Promise<void>;
  bulkAdd(items: T[]): Promise<string>;
  toArray(): Promise<T[]>;
  count(): Promise<number>;
  filter(fn: (item: T) => boolean): FacadeCollection<T>;
  orderBy(key: string): FacadeCollection<T>;
  where(key: string): FacadeWhereClause<T>;
}

export interface ShotLogDataAccess {
  jobs: FacadeTable<Job>;
  blasterProfiles: FacadeTable<BlasterProfile>;
  blastDays: FacadeTable<BlastDay>;
  blastLogs: FacadeTable<BlastLog>;
  shots: FacadeTable<Shot>;
  seismoReadings: FacadeTable<SeismoReading>;
  explosiveUsages: FacadeTable<ExplosiveUsage>;
  typicalColumns: FacadeTable<TypicalColumn>;
  dailyReports: FacadeTable<DailyReport>;
  workForceEntries: FacadeTable<WorkForceEntry>;
  equipmentEntries: FacadeTable<EquipmentEntry>;
  materialEntries: FacadeTable<MaterialEntry>;
  subcontractorEntries: FacadeTable<SubcontractorEntry>;
  crewMembers: FacadeTable<CrewMember>;
  equipment: FacadeTable<Equipment>;
  productCatalog: FacadeTable<ProductCatalogItem>;
  attachments: FacadeTable<Attachment>;
  companySettings: FacadeTable<CompanySettings>;
  manufacturers: FacadeTable<Manufacturer>;
  drillPlans: FacadeTable<DrillPlanRecord>;
  drillLogs: FacadeTable<DrillLog>;
  drillLogHoles: FacadeTable<DrillLogHole>;
  drillChecklists: FacadeTable<DrillChecklist>;
  repairTickets: FacadeTable<RepairTicket>;
  incidents: FacadeTable<Incident>;
  submissions: FacadeTable<Submission>;
  tombstones: FacadeTable<Tombstone>;

  table(name: string): FacadeTable<Record<string, unknown> & { id: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous table list
  transaction(mode: 'rw', tables: FacadeTable<any>[], fn: () => Promise<unknown>): Promise<unknown>;
}

export type UseLiveQueryFn = <T>(
  querier: () => Promise<T> | T,
  deps?: unknown[],
  defaultResult?: T,
) => T | undefined;
