// PowerSync client wiring: schema, backend connector, lazy singleton, and
// the SqlAdapter wrapper the facade runs on.
//
// Endpoints default to the local spike stack (infra/powersync). Phase 3
// replaces them with the real API (/powersync/token, /powersync/upload)
// via VITE_POWERSYNC_* env vars — the shape here does not change.
import {
  AbstractPowerSyncDatabase,
  PowerSyncDatabase,
  Schema,
  Table,
  column,
  type PowerSyncBackendConnector,
} from '@powersync/web';
import type { SqlAdapter } from './adapter';

const ENDPOINT = import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8095';
const TOKEN_URL = import.meta.env.VITE_POWERSYNC_TOKEN_URL ?? 'http://localhost:4100/token';
const UPLOAD_URL = import.meta.env.VITE_POWERSYNC_UPLOAD_URL ?? 'http://localhost:4100/upload';

const schema = new Schema({
  records: new Table(
    {
      table_name: column.text,
      payload: column.text,
      updated_at: column.text,
    },
    { indexes: { by_table: ['table_name'] } },
  ),
});

class ShotLogConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { token } = await fetch(TOKEN_URL).then((r) => r.json());
    return { endpoint: ENDPOINT, token };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;
    const ops = tx.crud.map((op) => ({ op: op.op, id: op.id, data: op.opData ?? {} }));
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    // Throwing keeps the CRUD queue intact; PowerSync retries with backoff.
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    await tx.complete();
  }
}

let instance: PowerSyncDatabase | null = null;

export function getPowerSync(): PowerSyncDatabase {
  if (!instance) {
    instance = new PowerSyncDatabase({
      schema,
      database: { dbFilename: 'shotlog.db' },
    });
    void instance.connect(new ShotLogConnector());
  }
  return instance;
}

/** Wrap the PowerSync database in the facade's minimal SQL surface. */
export function createPowerSyncAdapter(): SqlAdapter {
  return {
    async execute(sql, params) {
      await getPowerSync().execute(sql, params as unknown[]);
    },
    getAll<R>(sql: string, params?: unknown[]) {
      return getPowerSync().getAll<R>(sql, params as unknown[]);
    },
    writeTransaction<T>(fn: (tx: SqlAdapter) => Promise<T>) {
      return getPowerSync().writeTransaction(async (tx) => {
        return fn({
          async execute(sql, params) {
            await tx.execute(sql, params as unknown[]);
          },
          getAll<R>(sql: string, params?: unknown[]) {
            return tx.getAll<R>(sql, params as unknown[]);
          },
          writeTransaction() {
            return Promise.reject(new Error('nested transactions are not supported'));
          },
        });
      });
    },
  };
}
