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
  WASQLiteVFS,
  column,
  type PowerSyncBackendConnector,
} from '@powersync/web';
import { authedFetch, getSession, sessionCompanyId } from '@/lib/session';
import { logSyncEvent } from '@/lib/syncLog';
import { defaultEngineFor, type StorageEngine as PolicyEngine } from '@/lib/storageEnginePolicy';
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

// ONE database per page, held on globalThis rather than in this module:
// Vite's HMR can leave two copies of this module alive (the app's
// '?t=…'-versioned import and a harness's plain import), and two
// PowerSyncDatabase instances on one file hang WebKit (no shared worker
// there) — seen 2026-09-07 while measuring storage engines.
type PsGlobal = typeof globalThis & { __shotlogPowerSync?: PowerSyncDatabase | null; __shotlogPowerSyncOpenedAt?: number };
const g = globalThis as PsGlobal;
let instance: PowerSyncDatabase | null = g.__shotlogPowerSync ?? null;

// ── Storage engine (measurement, 2026-09-07) ────────────────────────────
// The SDK's default keeps the SQLite file in IndexedDB (IDBBatchAtomicVFS),
// which is slow at big writes on phones. OPFS (a real file in the browser's
// origin-private file system) is the faster path where supported. Opt-in
// per device via Settings › Data & device; the default stays IndexedDB
// until the measurement says otherwise.
export type StorageEngine = PolicyEngine;
const ENGINE_KEY = 'shotlog-storage-engine';

/** The engine this device SHOULD use per the policy (Apple WebKit → OPFS) */
export function preferredEngine(): StorageEngine {
  try {
    return defaultEngineFor(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0, opfsSupported());
  } catch {
    return 'idb';
  }
}

export function opfsSupported(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.storage) &&
      typeof navigator.storage.getDirectory === 'function' &&
      typeof Worker !== 'undefined'
    );
  } catch {
    return false;
  }
}

/** The engine this device is set to (falls back to IndexedDB when OPFS is unavailable) */
export function storageEngine(): StorageEngine {
  try {
    return localStorage.getItem(ENGINE_KEY) === 'opfs' && opfsSupported() ? 'opfs' : 'idb';
  } catch {
    return 'idb';
  }
}

export function setStorageEngine(engine: StorageEngine): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* private mode */
  }
}

/** Log the first completed download on this device (how long, how many)
 *  — attached at open time so it never depends on which screen is mounted */
function watchFirstSync(ps: PowerSyncDatabase, engine: StorageEngine): void {
  let sawUnsynced = ps.currentStatus?.hasSynced === false;
  const dispose = ps.registerListener({
    statusChanged: (status) => {
      if (status.hasSynced === false) sawUnsynced = true;
      if (status.hasSynced === true && sawUnsynced) {
        dispose();
        void ps
          .getAll<{ n: number }>('SELECT count(*) AS n FROM records')
          .then((rows) => {
            const secs = ((performance.now() - openedAt) / 1000).toFixed(1);
            logSyncEvent(`first sync done: ${rows[0]?.n ?? 0} records in ${secs}s · ${engine === 'opfs' ? 'OPFS' : 'IndexedDB'}`);
          })
          .catch(() => undefined);
      }
    },
  });
}

/**
 * Call ONCE at boot before anything opens PowerSync. A device set to OPFS
 * whose browser cannot actually open the origin-private file system (seen
 * on WebKit builds: getDirectory() throws UnknownError) would otherwise
 * fail to open its database at all — so the setting falls back to
 * IndexedDB, with a line in the sync log saying why.
 */
export async function preflightStorageEngine(): Promise<void> {
  let wanted: string | null = null;
  try {
    wanted = localStorage.getItem(ENGINE_KEY);
  } catch {
    return;
  }
  // No choice recorded yet: a fresh Apple device starts on OPFS (25 s → 1.4 s
  // on Matthew's iPhone); a device that already holds an IndexedDB copy is
  // handed over later by scheduleEngineHandover(), once its queue is empty
  if (wanted === null && preferredEngine() === 'opfs') {
    let existing = false;
    try {
      existing = ((await indexedDB.databases?.().catch(() => [])) ?? []).some((d) => d.name === DB_FILENAME);
    } catch {
      existing = false;
    }
    if (!existing) {
      setStorageEngine('opfs');
      wanted = 'opfs';
      logSyncEvent('storage engine: OPFS chosen for this device (Apple WebKit)');
    }
  }
  if (wanted !== 'opfs') return;
  try {
    if (!opfsSupported()) throw new Error('no OPFS API');
    const root = await navigator.storage.getDirectory();
    const probe = await root.getFileHandle('shotlog-opfs-probe', { create: true });
    void probe;
    await root.removeEntry('shotlog-opfs-probe').catch(() => undefined);
  } catch (err) {
    setStorageEngine('idb');
    logSyncEvent(`OPFS unavailable in this browser (${err instanceof Error ? err.message : 'error'}) — using IndexedDB`);
  }
}

/**
 * A device that already holds an IndexedDB copy but should be on OPFS
 * (Apple WebKit) switches at its NEXT launch — recorded only once nothing
 * is waiting to upload, so no local write can be lost. The boot reset then
 * deletes the IndexedDB copy and the first sync on OPFS takes seconds.
 */
function scheduleEngineHandover(ps: PowerSyncDatabase): void {
  let decided = false;
  let flag: string | null = null;
  try {
    flag = localStorage.getItem(ENGINE_KEY);
  } catch {
    return;
  }
  if (flag !== null || preferredEngine() !== 'opfs') return;
  const dispose = ps.registerListener({
    statusChanged: (status) => {
      if (decided || !status.connected || status.hasSynced !== true) return;
      decided = true;
      void ps
        .getAll<{ n: number }>('SELECT count(*) AS n FROM ps_crud')
        .then((rows) => {
          if ((rows[0]?.n ?? 0) > 0) {
            decided = false; // try again on a later status change
            return;
          }
          dispose();
          setStorageEngine('opfs');
          try {
            localStorage.setItem(RESET_FLAG, '1');
          } catch {
            /* ignore */
          }
          logSyncEvent('switching to faster storage (OPFS) at next launch — the company downloads again once, in seconds');
        })
        .catch(() => {
          decided = false;
        });
    },
  });
}

/** performance.now() when the database was opened — first-sync timing */
let openedAt = 0;
export function powerSyncOpenedAt(): number {
  return g.__shotlogPowerSyncOpenedAt ?? openedAt;
}

export function getPowerSync(): PowerSyncDatabase {
  if (!instance && g.__shotlogPowerSync) instance = g.__shotlogPowerSync;
  if (!instance) {
    const engine = storageEngine();
    openedAt = performance.now();
    g.__shotlogPowerSyncOpenedAt = openedAt;
    instance = new PowerSyncDatabase({
      schema,
      database:
        engine === 'opfs'
          ? { dbFilename: DB_FILENAME, vfs: WASQLiteVFS.OPFSCoopSyncVFS }
          : { dbFilename: DB_FILENAME },
    });
    g.__shotlogPowerSync = instance;
    logSyncEvent(`storage engine: ${engine === 'opfs' ? 'OPFS' : 'IndexedDB'}`);
    watchFirstSync(instance, engine);
    if (engine === 'idb') scheduleEngineHandover(instance);
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
  noteReplicaCompany();
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

/** The IndexedDB database the SDK's default VFS (IDBBatchAtomicVFS) keeps
 *  the replica in — the same name as dbFilename. */
const DB_FILENAME = 'shotlog.db';
const RESET_FLAG = 'shotlog-replica-reset-pending';
// Which company's copy this device holds (2026-09-07): sign-out no longer
// wipes it — the same company signing back in reuses it (instant), only a
// DIFFERENT company triggers a reset. Sync buckets are per company, so a
// colleague sees exactly what they would have downloaded anyway.
const REPLICA_CID_KEY = 'shotlog-replica-cid';

export function noteReplicaCompany(): void {
  const cid = sessionCompanyId();
  if (!cid) return;
  try {
    localStorage.setItem(REPLICA_CID_KEY, cid);
  } catch {
    /* private mode */
  }
}

/** True when the device's copy belongs to another company than the session */
export function replicaCompanyMismatch(): boolean {
  try {
    const held = localStorage.getItem(REPLICA_CID_KEY);
    const cid = sessionCompanyId();
    return Boolean(held && cid && held !== cid);
  } catch {
    return false;
  }
}

export function forgetReplicaCompany(): void {
  try {
    localStorage.removeItem(REPLICA_CID_KEY);
  } catch {
    /* ignore */
  }
}

const timeout = (ms: number) =>
  new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), ms));

/**
 * Hard reset of the local replica for a full account switch or a stuck
 * download. Tries the SDK's own clear first (bounded); if that does not
 * finish cleanly, marks the database for deletion AT THE NEXT BOOT — while
 * the page is up, the SDK's shared worker holds the database open and
 * IndexedDB silently defers a delete, so deleting here would do nothing
 * (2026-09-07: Matthew's browser). Callers always reload afterwards.
 * Never leaves a half-cleared replica behind: that state "connects"
 * forever without ever reaching a checkpoint.
 */
export async function resetLocalReplica(): Promise<void> {
  forgetReplicaCompany();
  let clean = false;
  if (instance) {
    try {
      const result = await Promise.race([instance.disconnectAndClear().then(() => 'ok' as const), timeout(15_000)]);
      clean = result === 'ok';
    } catch {
      clean = false;
    }
    try {
      await Promise.race([instance.close(), timeout(3_000)]);
    } catch {
      /* a wedged instance may refuse to close — the boot delete is the backstop */
    }
    instance = null;
    g.__shotlogPowerSync = null;
  }
  if (!clean) {
    logSyncEvent('local replica clear did not finish — database will be deleted at next boot');
    try {
      localStorage.setItem(RESET_FLAG, '1');
    } catch {
      /* private mode: the reload alone still helps */
    }
  }
}

/**
 * Call ONCE at boot, before anything opens PowerSync: if a reset is
 * pending, delete the replica database outright. Nothing holds it open
 * yet, so the delete completes; a delete that is still blocked after 10s
 * (another tab) is left pending for the next boot.
 */
export async function runPendingReplicaReset(): Promise<void> {
  let pending = false;
  try {
    pending = localStorage.getItem(RESET_FLAG) === '1';
    // A copy that belongs to another company must not be reused
    if (!pending && getSession().loggedIn && replicaCompanyMismatch()) {
      pending = true;
      logSyncEvent('device held another company\'s copy — clearing it');
    }
    // Devices from before the marker existed: the copy is this session's
    if (getSession().loggedIn && !localStorage.getItem(REPLICA_CID_KEY)) noteReplicaCompany();
  } catch {
    return;
  }
  if (!pending) return;
  // OPFS engine: the replica is a file (plus lock/journal siblings) in the
  // origin-private file system — remove everything named after it
  if (opfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const gone: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const [name] of (root as any).entries() as AsyncIterable<[string, unknown]>) {
        if (name.includes(DB_FILENAME)) gone.push(name);
      }
      for (const name of gone) await root.removeEntry(name, { recursive: true }).catch(() => undefined);
    } catch {
      /* no OPFS here — IndexedDB path below */
    }
  }
  const names = ((await indexedDB.databases?.().catch(() => [])) ?? [])
    .map((d) => d.name)
    .filter((n): n is string => Boolean(n) && n === DB_FILENAME);
  let allGone = true;
  for (const name of names.length ? names : [DB_FILENAME]) {
    const outcome = await Promise.race([
      new Promise<'ok' | 'error'>((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve('ok');
        req.onerror = () => resolve('error');
        // onblocked fires while another connection holds it; the request
        // still completes once that connection closes — keep waiting
      }),
      timeout(10_000),
    ]);
    if (outcome !== 'ok') allGone = false;
  }
  if (allGone) {
    forgetReplicaCompany();
    try {
      localStorage.removeItem(RESET_FLAG);
    } catch {
      /* ignore */
    }
    logSyncEvent('local database deleted at boot — downloading fresh');
  } else {
    logSyncEvent('local database still held open — will retry at next boot (close other ShotLog tabs)');
  }
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
