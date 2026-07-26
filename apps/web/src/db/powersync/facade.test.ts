import { describe, expect, it } from 'vitest';
import { PowerSyncFacade } from './facade';
import { createTestAdapter } from './testAdapter';

interface Rec {
  id: string;
  name?: string;
  jobId?: string;
  shotNumber?: number;
  isActive?: boolean;
  date?: string;
  nested?: { a?: number; b?: number };
}

function make() {
  const adapter = createTestAdapter();
  return { db: new PowerSyncFacade(adapter), adapter };
}

const t = (db: PowerSyncFacade) => db.table('jobs') as unknown as {
  get(id: string): Promise<Rec | undefined>;
  add(item: Rec): Promise<string>;
  put(item: Rec): Promise<string>;
  update(id: string, changes: Record<string, unknown>): Promise<number>;
  delete(id: string): Promise<void>;
  bulkAdd(items: Rec[]): Promise<string>;
  toArray(): Promise<Rec[]>;
  count(): Promise<number>;
  filter(fn: (item: Rec) => boolean): ReturnType<PowerSyncFacade['jobs']['filter']>;
  orderBy(key: string): ReturnType<PowerSyncFacade['jobs']['orderBy']>;
  where(key: string): ReturnType<PowerSyncFacade['jobs']['where']>;
};

describe('facade CRUD', () => {
  it('put/get roundtrips a record', async () => {
    const { db } = make();
    await t(db).put({ id: 'a', name: 'Ledge Rd', shotNumber: 3, isActive: true });
    const got = await t(db).get('a');
    expect(got).toEqual({ id: 'a', name: 'Ledge Rd', shotNumber: 3, isActive: true });
  });

  it('get scopes by logical table, not just id', async () => {
    const { db } = make();
    await db.table('jobs').put({ id: 'x', name: 'job' });
    expect(await db.table('shots').get('x')).toBeUndefined();
  });

  it('update shallow-merges and reports 1; missing id reports 0', async () => {
    const { db } = make();
    await t(db).put({ id: 'a', name: 'old', isActive: true });
    expect(await t(db).update('a', { name: 'new' })).toBe(1);
    expect(await t(db).get('a')).toEqual({ id: 'a', name: 'new', isActive: true });
    expect(await t(db).update('ghost', { name: 'x' })).toBe(0);
  });

  it('update supports Dexie dotted keypaths', async () => {
    const { db } = make();
    await t(db).put({ id: 'a', nested: { a: 1, b: 2 } });
    await t(db).update('a', { 'nested.b': 9 });
    expect((await t(db).get('a'))?.nested).toEqual({ a: 1, b: 9 });
  });

  it('delete removes only the targeted record', async () => {
    const { db } = make();
    await t(db).bulkAdd([{ id: 'a' }, { id: 'b' }]);
    await t(db).delete('a');
    expect(await t(db).toArray()).toEqual([{ id: 'b' }]);
  });

  it('count counts per logical table', async () => {
    const { db } = make();
    await t(db).bulkAdd([{ id: 'a' }, { id: 'b' }]);
    await db.table('shots').put({ id: 'c' });
    expect(await t(db).count()).toBe(2);
  });
});

describe('facade queries', () => {
  it('where().equals matches strings and numbers via json_extract', async () => {
    const { db } = make();
    await t(db).bulkAdd([
      { id: '1', jobId: 'j1', shotNumber: 1 },
      { id: '2', jobId: 'j1', shotNumber: 2 },
      { id: '3', jobId: 'j2', shotNumber: 2 },
    ]);
    expect(await t(db).where('jobId').equals('j1').count()).toBe(2);
    expect((await t(db).where('shotNumber').equals(2).toArray()).map((r) => r.id).sort()).toEqual([
      '2',
      '3',
    ]);
    expect(await t(db).where('jobId').equals('j2').first()).toMatchObject({ id: '3' });
  });

  it('where().anyOf matches sets; empty set matches nothing', async () => {
    const { db } = make();
    await t(db).bulkAdd([{ id: '1', jobId: 'a' }, { id: '2', jobId: 'b' }, { id: '3', jobId: 'c' }]);
    const hits = await t(db).where('jobId').anyOf(['a', 'c']).toArray();
    expect(hits.map((r) => r.id).sort()).toEqual(['1', '3']);
    expect(await t(db).where('jobId').anyOf([]).toArray()).toEqual([]);
  });

  it('collection sortBy sorts ascending', async () => {
    const { db } = make();
    await t(db).bulkAdd([
      { id: '1', jobId: 'j', shotNumber: 10 },
      { id: '2', jobId: 'j', shotNumber: 2 },
    ]);
    const sorted = await t(db).where('jobId').equals('j').sortBy('shotNumber');
    expect(sorted.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('filter().toArray/first/count apply the predicate', async () => {
    const { db } = make();
    await t(db).bulkAdd([
      { id: '1', isActive: true },
      { id: '2', isActive: false },
      { id: '3', isActive: true },
    ]);
    expect(await t(db).filter((r) => r.isActive === true).count()).toBe(2);
    expect(await t(db).filter((r) => !r.isActive).first()).toMatchObject({ id: '2' });
  });

  it('orderBy().reverse().toArray sorts descending, e.g. blast days by date', async () => {
    const { db } = make();
    await t(db).bulkAdd([
      { id: '1', date: '2026-07-01' },
      { id: '2', date: '2026-07-20' },
      { id: '3', date: '2026-07-10' },
    ]);
    const days = await t(db).orderBy('date').reverse().toArray();
    expect(days.map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('rejects hostile query keys', async () => {
    const { db } = make();
    expect(() => t(db).where("x') OR 1=1 --")).toThrow(/Invalid query key/);
  });
});

describe('blobs', () => {
  it('roundtrips a Blob through the marker wire format', async () => {
    const { db, adapter } = make();
    const bytes = new Uint8Array([1, 2, 3, 250]);
    await db.table('attachments').put({
      id: 'att1',
      data: new Blob([bytes], { type: 'image/png' }),
    } as never);

    // Wire format matches the old sync engine so server payloads migrate as-is
    const rows = await adapter.getAll<{ payload: string }>(
      'SELECT payload FROM records WHERE id = ?',
      ['att1'],
    );
    const stored = JSON.parse(rows[0].payload);
    expect(stored.data.__type).toBe('image/png');
    expect(typeof stored.data.__blob).toBe('string');

    const revived = (await db.table('attachments').get('att1')) as { data: Blob } | undefined;
    expect(revived?.data).toBeInstanceOf(Blob);
    expect(new Uint8Array(await revived!.data.arrayBuffer())).toEqual(bytes);
  });
});

describe('transactions', () => {
  it('commits multi-table writes atomically', async () => {
    const { db } = make();
    await db.transaction('rw', [db.blastDays, db.blastLogs], async () => {
      await db.table('blastDays').put({ id: 'day1' });
      await db.table('blastLogs').put({ id: 'log1' });
    });
    expect(await db.table('blastDays').get('day1')).toBeDefined();
    expect(await db.table('blastLogs').get('log1')).toBeDefined();
  });

  it('rolls back every write when the callback throws', async () => {
    const { db } = make();
    await db.table('jobs').put({ id: 'keep' });
    await expect(
      db.transaction('rw', [db.jobs], async () => {
        await db.table('jobs').put({ id: 'doomed' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.table('jobs').get('doomed')).toBeUndefined();
    expect(await db.table('jobs').get('keep')).toBeDefined();
  });

  it('serializes concurrent transactions and recovers after a rejection', async () => {
    const { db } = make();
    const first = db
      .transaction('rw', [db.jobs], async () => {
        throw new Error('first fails');
      })
      .catch(() => 'failed');
    const second = db.transaction('rw', [db.jobs], async () => {
      await db.table('jobs').put({ id: 'after' });
    });
    expect(await first).toBe('failed');
    await second;
    expect(await db.table('jobs').get('after')).toBeDefined();
  });
});

describe('resilience', () => {
  it('skips malformed payload rows instead of failing the whole query', async () => {
    const { db, adapter } = make();
    await db.table('jobs').put({ id: 'good', name: 'ok' });
    await adapter.execute(
      'INSERT INTO records (id, table_name, payload, updated_at) VALUES (?, ?, ?, ?)',
      ['bad', 'jobs', '{not json', '2026-01-01T00:00:00Z'],
    );
    const all = await db.table('jobs').toArray();
    expect(all).toEqual([{ id: 'good', name: 'ok' }]);
  });
});
