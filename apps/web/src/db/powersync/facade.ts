// Dexie-subset facade over the PowerSync `records` table.
//
// Document model (matches the spike and the migration plan): one SQLite row
// per record — id, table_name (the old Dexie table name), payload (the full
// record as JSON with Blobs as base64 markers), updated_at (informational;
// write ORDER is what the server honors, never timestamps).
//
// Known, deliberate divergences from Dexie:
// - add() on an existing id behaves like put() (the PowerSync view has no
//   enforced PK conflict). All ids are UUIDs; the app never relies on
//   add-throws-on-duplicate.
// - orderBy(key) includes records missing the key (sorted last) instead of
//   excluding them. Every synced record carries the keys we order by.
import type {
  FacadeCollection,
  FacadeTable,
  FacadeWhereClause,
  ShotLogDataAccess,
} from '../facade-types';
import type {
  CompanySettings,
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
} from '../schema';
import type { SqlAdapter, SqlRunner } from './adapter';
import { reviveValue, serializeValue } from './blobMarkers';

const RECORD_TABLES = [
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
  'companySettings',
  'tombstones',
] as const;

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function jsonPath(key: string): string {
  if (!KEY_RE.test(key)) throw new Error(`Invalid query key: ${key}`);
  return `$.${key}`;
}

/** Dexie-style ascending compare (numbers numeric, strings lexicographic). */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1; // missing keys sort last
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

interface PayloadRow {
  payload: string;
}

function parseRows<T>(rows: PayloadRow[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    try {
      out.push(reviveValue(JSON.parse(row.payload)) as T);
    } catch {
      // A malformed payload must not take down every list view with it.
      console.error('[facade] skipping malformed payload row');
    }
  }
  return out;
}

class Collection<T> implements FacadeCollection<T> {
  constructor(
    private readonly fetchAll: () => Promise<T[]>,
    private readonly filters: ((item: T) => boolean)[] = [],
    private readonly sortKey: string | null = null,
    private readonly reversed = false,
  ) {}

  private async resolve(): Promise<T[]> {
    let items = await this.fetchAll();
    for (const fn of this.filters) items = items.filter(fn);
    if (this.sortKey !== null) {
      const key = this.sortKey;
      items = [...items].sort((a, b) =>
        compareValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      );
    }
    return this.reversed ? items.reverse() : items;
  }

  toArray(): Promise<T[]> {
    return this.resolve();
  }

  async first(): Promise<T | undefined> {
    return (await this.resolve())[0];
  }

  async count(): Promise<number> {
    return (await this.resolve()).length;
  }

  async sortBy(key: string): Promise<T[]> {
    const items = await this.resolve();
    return [...items].sort((a, b) =>
      compareValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  reverse(): FacadeCollection<T> {
    return new Collection(this.fetchAll, this.filters, this.sortKey, !this.reversed);
  }

  filter(fn: (item: T) => boolean): FacadeCollection<T> {
    return new Collection(this.fetchAll, [...this.filters, fn], this.sortKey, this.reversed);
  }
}

/** Routes reads/writes through the open transaction when one is active. */
export interface FacadeContext {
  sql(): SqlRunner;
  adapter: SqlAdapter;
}

class PsTable<T extends { id: string }> implements FacadeTable<T> {
  constructor(
    private readonly ctx: FacadeContext,
    private readonly name: string,
  ) {}

  private async fetchWhere(clause: string, params: unknown[]): Promise<T[]> {
    const rows = await this.ctx
      .sql()
      .getAll<PayloadRow>(
        `SELECT payload FROM records WHERE table_name = ?${clause}`,
        [this.name, ...params],
      );
    return parseRows<T>(rows);
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.fetchWhere(' AND id = ?', [id]))[0];
  }

  async put(item: T): Promise<string> {
    const payload = JSON.stringify(await serializeValue(item));
    await this.ctx
      .sql()
      .execute(
        'INSERT OR REPLACE INTO records (id, table_name, payload, updated_at) VALUES (?, ?, ?, ?)',
        [item.id, this.name, payload, new Date().toISOString()],
      );
    return item.id;
  }

  add(item: T): Promise<string> {
    return this.put(item);
  }

  async update(id: string, changes: Record<string, unknown>): Promise<number> {
    const existing = await this.get(id);
    if (existing === undefined) return 0;
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(changes)) {
      if (key.includes('.')) {
        // Dexie keypath syntax: update(id, {'a.b': v}) sets nested field b
        const parts = key.split('.');
        let target = merged;
        for (const part of parts.slice(0, -1)) {
          const next = target[part];
          target[part] =
            typeof next === 'object' && next !== null ? { ...(next as object) } : {};
          target = target[part] as Record<string, unknown>;
        }
        target[parts[parts.length - 1]] = value;
      } else {
        merged[key] = value;
      }
    }
    await this.put(merged as T);
    return 1;
  }

  async delete(id: string): Promise<void> {
    await this.ctx
      .sql()
      .execute('DELETE FROM records WHERE table_name = ? AND id = ?', [this.name, id]);
  }

  async bulkAdd(items: T[]): Promise<string> {
    for (const item of items) await this.put(item);
    return items.length ? items[items.length - 1].id : '';
  }

  toArray(): Promise<T[]> {
    return this.fetchWhere('', []);
  }

  async count(): Promise<number> {
    const rows = await this.ctx
      .sql()
      .getAll<{ c: number }>('SELECT COUNT(*) AS c FROM records WHERE table_name = ?', [
        this.name,
      ]);
    return rows[0]?.c ?? 0;
  }

  filter(fn: (item: T) => boolean): FacadeCollection<T> {
    return new Collection(() => this.toArray(), [fn]);
  }

  orderBy(key: string): FacadeCollection<T> {
    jsonPath(key); // validate
    return new Collection(() => this.toArray(), [], key);
  }

  where(key: string): FacadeWhereClause<T> {
    const path = jsonPath(key);
    return {
      equals: (value: string | number) =>
        new Collection<T>(() =>
          this.fetchWhere(` AND json_extract(payload, '${path}') = ?`, [value]),
        ),
      anyOf: (values: readonly (string | number)[]) => {
        if (values.length === 0) return new Collection<T>(() => Promise.resolve([]));
        const marks = values.map(() => '?').join(', ');
        return new Collection<T>(() =>
          this.fetchWhere(` AND json_extract(payload, '${path}') IN (${marks})`, [...values]),
        );
      },
    };
  }
}

export class PowerSyncFacade implements ShotLogDataAccess {
  jobs!: FacadeTable<Job>;
  blasterProfiles!: FacadeTable<BlasterProfile>;
  blastDays!: FacadeTable<BlastDay>;
  blastLogs!: FacadeTable<BlastLog>;
  shots!: FacadeTable<Shot>;
  seismoReadings!: FacadeTable<SeismoReading>;
  explosiveUsages!: FacadeTable<ExplosiveUsage>;
  typicalColumns!: FacadeTable<TypicalColumn>;
  dailyReports!: FacadeTable<DailyReport>;
  workForceEntries!: FacadeTable<WorkForceEntry>;
  equipmentEntries!: FacadeTable<EquipmentEntry>;
  materialEntries!: FacadeTable<MaterialEntry>;
  subcontractorEntries!: FacadeTable<SubcontractorEntry>;
  crewMembers!: FacadeTable<CrewMember>;
  equipment!: FacadeTable<Equipment>;
  productCatalog!: FacadeTable<ProductCatalogItem>;
  attachments!: FacadeTable<Attachment>;
  companySettings!: FacadeTable<CompanySettings>;
  tombstones!: FacadeTable<Tombstone>;

  private currentTx: SqlRunner | null = null;
  private txQueue: Promise<unknown> = Promise.resolve();
  private readonly tables = new Map<string, PsTable<{ id: string }>>();
  private readonly ctx: FacadeContext;

  constructor(adapter: SqlAdapter) {
    this.ctx = { adapter, sql: () => this.currentTx ?? adapter };
    for (const name of RECORD_TABLES) {
      const table = new PsTable<{ id: string }>(this.ctx, name);
      this.tables.set(name, table);
      (this as Record<string, unknown>)[name] = table;
    }
  }

  table(name: string): FacadeTable<Record<string, unknown> & { id: string }> {
    const existing = this.tables.get(name);
    if (existing) return existing as FacadeTable<Record<string, unknown> & { id: string }>;
    const table = new PsTable<Record<string, unknown> & { id: string }>(this.ctx, name);
    this.tables.set(name, table as PsTable<{ id: string }>);
    return table;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous table list
  transaction(_mode: 'rw', _tables: FacadeTable<any>[], fn: () => Promise<unknown>) {
    // Serialize transactions so two concurrent callers can't interleave
    // inside one SQLite write lock.
    const run = this.txQueue.then(() =>
      this.ctx.adapter.writeTransaction(async (tx) => {
        this.currentTx = tx;
        try {
          return await fn();
        } finally {
          this.currentTx = null;
        }
      }),
    );
    // Keep the queue alive even when a transaction rejects.
    this.txQueue = run.catch(() => undefined);
    return run;
  }
}
