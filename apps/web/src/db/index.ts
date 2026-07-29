// Data-access entry point for ALL app code.
//
// One backend: a PowerSync-managed SQLite replica of Postgres behind a
// Dexie-subset contract (facade-types.ts). The legacy Dexie/IndexedDB
// fallback was removed after the PowerSync release proved out — any old
// device data still sitting in IndexedDB is untouched but no longer read.
import type { ShotLogDataAccess } from './facade-types';
import { PowerSyncFacade } from './powersync/facade';
import { createPowerSyncAdapter } from './powersync/client';
import { useLiveQuery as psUseLiveQuery } from './powersync/useLiveQuery';

// Constructing the facade does NOT start PowerSync — the worker, wasm,
// and websocket spin up lazily on first query.
const psDb = new PowerSyncFacade(createPowerSyncAdapter());

export const db: ShotLogDataAccess = psDb;

// PowerSync captures DELETEs in its CRUD queue — deletions sync by
// construction, so no tombstone row is needed.
export const deleteWithTombstone = async (tableName: string, recordId: string): Promise<void> => {
  await psDb.table(tableName).delete(recordId);
};

export const useLiveQuery = psUseLiveQuery;
export type * from './schema';
export type { ShotLogDataAccess, FacadeTable, FacadeCollection } from './facade-types';
