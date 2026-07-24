// ShotLog sync engine — push local changes, pull remote ones, LWW both ways.
// The server stores records as JSON documents; Blobs (signatures, map
// snapshots, printout photos) travel as base64 markers.

import { db } from '@/db';

/** Every synced table. Tombstones are pushed separately. */
const SYNC_TABLES = [
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
] as const;

const LS_KEYS = {
  serverUrl: 'shotlog-server-url',
  accessToken: 'shotlog-access-token',
  refreshToken: 'shotlog-refresh-token',
  userEmail: 'shotlog-user-email',
  lastPulledAt: 'shotlog-last-pulled-at',
};

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
  staleSkipped: number;
}

export function getSyncConfig() {
  return {
    serverUrl: localStorage.getItem(LS_KEYS.serverUrl) ?? '',
    email: localStorage.getItem(LS_KEYS.userEmail) ?? '',
    loggedIn: Boolean(localStorage.getItem(LS_KEYS.refreshToken)),
    lastPulledAt: localStorage.getItem(LS_KEYS.lastPulledAt),
  };
}

// ── Blob <-> base64 markers ────────────────────────────────────────────────

interface BlobMarker {
  __blob: string; // base64
  __type: string;
}

function isBlobMarker(v: unknown): v is BlobMarker {
  return typeof v === 'object' && v !== null && '__blob' in v;
}

async function blobToMarker(blob: Blob): Promise<BlobMarker> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { __blob: base64, __type: blob.type };
}

function markerToBlob(marker: BlobMarker): Blob {
  const bytes = Uint8Array.from(atob(marker.__blob), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: marker.__type });
}

/** Deep-walk a record: Blob → marker (serialize) or marker → Blob (revive) */
async function serializeValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return blobToMarker(value);
  if (Array.isArray(value)) return Promise.all(value.map(serializeValue));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await serializeValue(v);
    return out;
  }
  return value;
}

function reviveValue(value: unknown): unknown {
  if (isBlobMarker(value)) return markerToBlob(value);
  if (Array.isArray(value)) return value.map(reviveValue);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveValue(v);
    return out;
  }
  return value;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(serverUrl: string, email: string, password: string): Promise<void> {
  const url = serverUrl.replace(/\/$/, '');
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `login failed (${res.status})`);
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  localStorage.setItem(LS_KEYS.serverUrl, url);
  localStorage.setItem(LS_KEYS.userEmail, email);
  localStorage.setItem(LS_KEYS.accessToken, data.accessToken);
  localStorage.setItem(LS_KEYS.refreshToken, data.refreshToken);
}

export async function logout(): Promise<void> {
  const { serverUrl } = getSyncConfig();
  const refreshToken = localStorage.getItem(LS_KEYS.refreshToken);
  if (serverUrl && refreshToken) {
    await fetch(`${serverUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  localStorage.removeItem(LS_KEYS.accessToken);
  localStorage.removeItem(LS_KEYS.refreshToken);
  localStorage.removeItem(LS_KEYS.userEmail);
}

/** Fetch with bearer token; on 401 tries one refresh-and-retry */
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { serverUrl } = getSyncConfig();
  if (!serverUrl) throw new Error('sync not configured');
  const attempt = () =>
    fetch(`${serverUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem(LS_KEYS.accessToken) ?? ''}`,
      },
    });
  let res = await attempt();
  if (res.status === 401) {
    const refreshToken = localStorage.getItem(LS_KEYS.refreshToken);
    if (!refreshToken) throw new Error('not logged in');
    const refresh = await fetch(`${serverUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!refresh.ok) {
      await logout();
      throw new Error('session expired — log in again');
    }
    const tokens = (await refresh.json()) as { accessToken: string; refreshToken: string };
    localStorage.setItem(LS_KEYS.accessToken, tokens.accessToken);
    localStorage.setItem(LS_KEYS.refreshToken, tokens.refreshToken);
    res = await attempt();
  }
  return res;
}

// ── Sync ───────────────────────────────────────────────────────────────────

let syncing = false;

export async function syncNow(): Promise<SyncResult> {
  if (syncing) throw new Error('sync already in progress');
  syncing = true;
  try {
    const result: SyncResult = { pushed: 0, pulled: 0, deleted: 0, staleSkipped: 0 };

    // 1. PUSH — all records still marked local, in batches
    type PushRecord = {
      tableName: string;
      recordId: string;
      updatedAt: string;
      deletedAt?: string | null;
      payload: unknown;
    };
    const outbox: PushRecord[] = [];
    for (const tableName of SYNC_TABLES) {
      const rows = await db.table(tableName).where('syncStatus').equals('local').toArray();
      for (const row of rows) {
        outbox.push({
          tableName,
          recordId: row.id,
          updatedAt: row.updatedAt ?? new Date().toISOString(),
          payload: await serializeValue({ ...row, syncStatus: 'synced' }),
        });
      }
    }
    const tombstones = await db.tombstones.where('syncStatus').equals('local').toArray();
    for (const t of tombstones) {
      outbox.push({
        tableName: t.tableName,
        recordId: t.recordId,
        updatedAt: t.deletedAt,
        deletedAt: t.deletedAt,
        payload: null,
      });
    }

    for (let i = 0; i < outbox.length; i += 200) {
      const batch = outbox.slice(i, i + 200);
      const res = await authedFetch('/sync/push', {
        method: 'POST',
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) throw new Error(`push failed (${res.status})`);
      const body = (await res.json()) as {
        accepted: { tableName: string; recordId: string }[];
        stale: { tableName: string; recordId: string }[];
      };
      result.pushed += body.accepted.length;
      result.staleSkipped += body.stale.length;
      // Mark accepted rows synced (stale ones stay local; pull below resolves)
      for (const a of body.accepted) {
        const record = batch.find((b) => b.tableName === a.tableName && b.recordId === a.recordId);
        if (!record) continue;
        if (record.deletedAt) {
          await db.tombstones.update(`${a.tableName}:${a.recordId}`, { syncStatus: 'synced' });
        } else {
          await db
            .table(a.tableName)
            .where('id')
            .equals(a.recordId)
            .modify({ syncStatus: 'synced' });
        }
      }
    }

    // 2. PULL — changes since our last pull, LWW against local copies
    const since = localStorage.getItem(LS_KEYS.lastPulledAt);
    const res = await authedFetch(`/sync/changes${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    if (!res.ok) throw new Error(`pull failed (${res.status})`);
    const body = (await res.json()) as {
      records: {
        tableName: string;
        recordId: string;
        updatedAt: string;
        deletedAt: string | null;
        payload: unknown;
      }[];
      serverTime: string;
    };
    for (const remote of body.records) {
      if (!SYNC_TABLES.includes(remote.tableName as (typeof SYNC_TABLES)[number])) continue;
      const table = db.table(remote.tableName);
      const local = await table.get(remote.recordId);
      // Local unsynced edits that are newer win; they'll push next round
      if (local?.syncStatus === 'local' && local.updatedAt && local.updatedAt > remote.updatedAt) {
        continue;
      }
      if (remote.deletedAt) {
        if (local) await table.delete(remote.recordId);
        result.deleted += 1;
        continue;
      }
      const revived = reviveValue(remote.payload) as Record<string, unknown> | null;
      if (!revived || typeof revived !== 'object') continue; // malformed payload — skip
      // recordId is authoritative — payloads must never land without a key
      await table.put({ ...revived, id: remote.recordId, syncStatus: 'synced' });
      result.pulled += 1;
    }
    localStorage.setItem(LS_KEYS.lastPulledAt, body.serverTime);

    return result;
  } finally {
    syncing = false;
  }
}

/** Count of records (and tombstones) waiting to sync */
export async function pendingCount(): Promise<number> {
  let count = 0;
  for (const tableName of SYNC_TABLES) {
    count += await db.table(tableName).where('syncStatus').equals('local').count();
  }
  count += await db.tombstones.where('syncStatus').equals('local').count();
  return count;
}

// ── Full export (works without any server) ────────────────────────────────

export async function exportAllData(): Promise<Blob> {
  const dump: Record<string, unknown[]> = {};
  for (const tableName of SYNC_TABLES) {
    const rows = await db.table(tableName).toArray();
    dump[tableName] = (await Promise.all(rows.map((r) => serializeValue(r)))) as unknown[];
  }
  return new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, tables: dump }, null, 1)],
    { type: 'application/json' },
  );
}
