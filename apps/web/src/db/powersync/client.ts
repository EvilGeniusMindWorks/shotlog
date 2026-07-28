// PowerSync client wiring: schema, backend connector, lazy singleton, and
// the SqlAdapter wrapper the facade runs on.
//
// Credentials and uploads go through the app's API (session-authed):
//   GET  /powersync/token  -> { token, endpoint }
//   POST /powersync/upload -> applies queued CRUD in order, company-scoped
import {
  AbstractPowerSyncDatabase,
  PowerSyncDatabase,
  Schema,
  Table,
  column,
  type PowerSyncBackendConnector,
} from '@powersync/web';
import { authedFetch, getSession } from '@/lib/session';
import { logSyncEvent } from '@/lib/syncLog';
import type { SqlAdapter } from './adapter';

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
    // Dev override so the web app can run against the spike stack without
    // an API server: VITE_POWERSYNC_TOKEN_URL + VITE_POWERSYNC_URL.
    const devTokenUrl = import.meta.env.VITE_POWERSYNC_TOKEN_URL;
    if (devTokenUrl) {
      const { token } = await fetch(devTokenUrl).then((r) => r.json());
      return { endpoint: import.meta.env.VITE_POWERSYNC_URL ?? 'http://localhost:8095', token };
    }
    try {
      const res = await authedFetch('/powersync/token');
      if (!res.ok) throw new Error(`powersync token failed (${res.status})`);
      const { token, endpoint } = (await res.json()) as { token: string; endpoint: string };
      return { endpoint: import.meta.env.VITE_POWERSYNC_URL ?? endpoint, token };
    } catch (err) {
      logSyncEvent(`token fetch failed: ${err instanceof Error ? err.message : 'error'}`);
      throw err;
    }
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;
    const ops = tx.crud.map((op) => ({ op: op.op, id: op.id, data: op.opData ?? {} }));
    const devUploadUrl = import.meta.env.VITE_POWERSYNC_UPLOAD_URL;
    const res = devUploadUrl
      ? await fetch(devUploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ops }),
        })
      : await authedFetch('/powersync/upload', {
          method: 'POST',
          body: JSON.stringify({ ops }),
        });
    // Throwing keeps the CRUD queue intact; PowerSync retries with backoff.
    if (!res.ok) {
      logSyncEvent(`upload failed (${res.status})`);
      throw new Error(`upload failed (${res.status})`);
    }
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
    // Connect only once a session (or dev override) exists — otherwise the
    // SDK would loop on credential failures behind the login screen.
    if (getSession().loggedIn || import.meta.env.VITE_POWERSYNC_TOKEN_URL) {
      void instance.connect(new ShotLogConnector());
    }
  }
  return instance;
}

/** Call after login: starts (or restarts) replication with fresh credentials. */
export async function connectPowerSync(): Promise<void> {
  await getPowerSync().connect(new ShotLogConnector());
}

// Debounce so a burst of online/visibility events triggers ONE reconnect
let lastReconnectAt = 0;

/**
 * Nudge the SDK to reconnect NOW (window 'online', app foregrounded, or the
 * panel's Reconnect button) instead of waiting out its internal backoff.
 * No-op when nobody is logged in or the stream is already up.
 */
export async function reconnectPowerSync(): Promise<void> {
  if (!getSession().loggedIn && !import.meta.env.VITE_POWERSYNC_TOKEN_URL) return;
  const ps = getPowerSync();
  if (ps.currentStatus?.connected) return;
  const now = Date.now();
  if (now - lastReconnectAt < 5000) return;
  lastReconnectAt = now;
  logSyncEvent('reconnect nudge');
  await ps.connect(new ShotLogConnector());
}

/**
 * Call on logout: stop replication and wipe the local replica so the next
 * account starts clean. Any unsynced writes are lost — callers must warn
 * when the queue is non-empty.
 */
export async function disconnectAndClearPowerSync(): Promise<void> {
  if (!instance) return;
  await instance.disconnectAndClear();
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
