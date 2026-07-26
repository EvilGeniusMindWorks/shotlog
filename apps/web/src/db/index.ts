// Data-access entry point for ALL app code.
//
// Two interchangeable backends behind one Dexie-subset contract
// (facade-types.ts):
//   - PowerSync-managed SQLite replica of Postgres (the default)
//   - Dexie/IndexedDB (legacy; kept one release as a read-only safety net —
//     the old device data stays in IndexedDB untouched)
//
// VITE_POWERSYNC=0 falls back to Dexie in an emergency. Everything must
// import from here — including useLiveQuery, so live queries follow the
// active backend.
import { useLiveQuery as dexieUseLiveQuery } from 'dexie-react-hooks';
import type { ShotLogDataAccess, UseLiveQueryFn } from './facade-types';
import { db as dexieDb, deleteWithTombstone as dexieDeleteWithTombstone } from './database';
import { PowerSyncFacade } from './powersync/facade';
import { createPowerSyncAdapter } from './powersync/client';
import { useLiveQuery as psUseLiveQuery } from './powersync/useLiveQuery';

export const POWERSYNC_ENABLED = import.meta.env.VITE_POWERSYNC !== '0';

let activeDb: ShotLogDataAccess;
let activeDelete: (tableName: string, recordId: string) => Promise<void>;
let activeUseLiveQuery: UseLiveQueryFn;

if (POWERSYNC_ENABLED) {
  // Constructing the facade does NOT start PowerSync — the worker, wasm,
  // and websocket spin up lazily on first query.
  const psDb = new PowerSyncFacade(createPowerSyncAdapter());
  activeDb = psDb;
  // PowerSync captures DELETEs in its CRUD queue — deletions sync by
  // construction, so no tombstone row is needed.
  activeDelete = async (tableName, recordId) => {
    await psDb.table(tableName).delete(recordId);
  };
  activeUseLiveQuery = psUseLiveQuery;
} else {
  // The Dexie db satisfies the facade contract structurally, but its
  // generics (UpdateSpec, PromiseExtended, overloads) don't line up with
  // the plain subset types — hence the cast. The subset is what UI code
  // type-checks against either way.
  activeDb = dexieDb as unknown as ShotLogDataAccess;
  activeDelete = dexieDeleteWithTombstone;
  activeUseLiveQuery = dexieUseLiveQuery as UseLiveQueryFn;
}

export const db: ShotLogDataAccess = activeDb;
export const deleteWithTombstone = activeDelete;
export const useLiveQuery = activeUseLiveQuery;
export type * from './schema';
export type { ShotLogDataAccess, FacadeTable, FacadeCollection } from './facade-types';
