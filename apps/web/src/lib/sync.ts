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
  userInfo: 'shotlog-user-info',
  lastPulledAt: 'shotlog-last-pulled-at',
  lastSyncError: 'shotlog-last-sync-error',
};

/** The most recent sync failure message, if the last pass had one */
export function getLastSyncError(): string | null {
  return localStorage.getItem(LS_KEYS.lastSyncError);
}

/** Production sync server — pre-filled on the login screen */
export const DEFAULT_SERVER_URL = 'https://shotlogserver-production.up.railway.app';

export interface UserLicense {
  state: string;
  licenseNumber: string;
  expirationDate: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company: string;
  licenses?: UserLicense[];
  /** Signature on file — PNG data URL */
  signature?: string | null;
  /** Offline unlock PIN (salted SHA-256) — follows the account */
  pinHash?: string | null;
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.userInfo);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

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

function markerToBlob(marker: BlobMarker): Blob | null {
  try {
    const bytes = Uint8Array.from(atob(marker.__blob), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? new Blob([bytes], { type: marker.__type }) : null;
  } catch {
    return null; // corrupted base64 — treat as absent rather than storing junk
  }
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
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
  };
  localStorage.setItem(LS_KEYS.serverUrl, url);
  localStorage.setItem(LS_KEYS.userEmail, email);
  localStorage.setItem(LS_KEYS.accessToken, data.accessToken);
  localStorage.setItem(LS_KEYS.refreshToken, data.refreshToken);
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(data.user));
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
  localStorage.removeItem(LS_KEYS.userInfo);
  // Logging back in should behave like a fresh device: full pull
  localStorage.removeItem(LS_KEYS.lastPulledAt);
}

export interface ServerStats {
  tables: { tableName: string; count: number; lastReceived: string | null }[];
  serverTime: string;
}

/** What the server currently holds for this company — field diagnostics */
export async function fetchServerStats(): Promise<ServerStats> {
  const res = await authedFetch('/sync/stats');
  if (!res.ok) throw new Error(`stats failed (${res.status})`);
  return (await res.json()) as ServerStats;
}

/** Refresh the cached session user (name, role, licenses) from the server */
export async function refreshSessionUser(): Promise<SessionUser | null> {
  try {
    const res = await authedFetch('/auth/me');
    if (!res.ok) return getSessionUser();
    const body = (await res.json()) as { user: SessionUser };
    localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(body.user));
    return body.user;
  } catch {
    return getSessionUser(); // offline — cached copy is authoritative
  }
}

/** Replace the signed-in user's licenses (one per state). Needs a connection. */
export async function updateMyLicenses(licenses: UserLicense[]): Promise<SessionUser> {
  const res = await authedFetch('/auth/me/licenses', {
    method: 'PUT',
    body: JSON.stringify({ licenses }),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; licenses?: UserLicense[]; error?: string }
    | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to save licenses');
  const user = { ...getSessionUser()!, licenses: body?.licenses ?? licenses };
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(user));
  return user;
}

/** Save (or clear) the signed-in user's signature on file. Needs a connection. */
export async function updateMySignature(signature: string | null): Promise<SessionUser> {
  const res = await authedFetch('/auth/me/signature', {
    method: 'PUT',
    body: JSON.stringify({ signature }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to save signature');
  const user = { ...getSessionUser()!, signature };
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(user));
  return user;
}

/** Save the (client-hashed) unlock PIN to the account. Needs a connection. */
export async function updateMyPin(pinHash: string): Promise<void> {
  const res = await authedFetch('/auth/me/pin', {
    method: 'PUT',
    body: JSON.stringify({ pinHash }),
  });
  if (!res.ok) throw new Error('failed to save PIN');
  const user = getSessionUser();
  if (user) localStorage.setItem(LS_KEYS.userInfo, JSON.stringify({ ...user, pinHash }));
}

/** Change the signed-in user's password. Other sessions are signed out. */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await authedFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to change password');
}

// Single-flight token refresh: refresh tokens rotate server-side, so two
// concurrent 401s must NOT both hit /auth/refresh — the loser would send an
// already-rotated token, get rejected, and log the user out.
let refreshInFlight: Promise<void> | null = null;

async function refreshTokens(serverUrl: string): Promise<void> {
  refreshInFlight ??= (async () => {
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
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Fetch with bearer token; on 401 tries one refresh-and-retry */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
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
    await refreshTokens(serverUrl);
    res = await attempt();
  }
  return res;
}

// ── Sync ───────────────────────────────────────────────────────────────────

let syncing = false;

// True ONLY while the sync engine itself writes to Dexie (applying pulled
// records, marking pushed rows synced). The auto-sync hooks check this — NOT
// `syncing` — so a user keystroke landing mid-pass still gets re-marked
// 'local' and pushed next round instead of being clobbered by the pull.
let engineWriting = false;

async function engineWrite<T>(fn: () => Promise<T>): Promise<T> {
  engineWriting = true;
  try {
    return await fn();
  } finally {
    engineWriting = false;
  }
}

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

    // Batch by SERIALIZED SIZE, not count — records carry base64 images (map
    // snapshots, printout photos) and a fixed count can build a huge request.
    // One failing batch must not brick the pass: record the error, keep going,
    // surface it at the end. A stuck batch otherwise blocks every later
    // record from ever reaching the server.
    const MAX_BATCH_BYTES = 4_000_000;
    const batches: PushRecord[][] = [];
    {
      let current: PushRecord[] = [];
      let size = 0;
      for (const rec of outbox) {
        const recSize = JSON.stringify(rec).length;
        if (current.length > 0 && (size + recSize > MAX_BATCH_BYTES || current.length >= 200)) {
          batches.push(current);
          current = [];
          size = 0;
        }
        current.push(rec);
        size += recSize;
      }
      if (current.length > 0) batches.push(current);
    }

    let pushError: Error | null = null;
    for (const batch of batches) {
      let body: {
        accepted: { tableName: string; recordId: string }[];
        stale: { tableName: string; recordId: string; serverUpdatedAt: string }[];
      };
      try {
        const res = await authedFetch('/sync/push', {
          method: 'POST',
          body: JSON.stringify({ records: batch }),
        });
        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(`push failed (${res.status}${detail?.error ? ` — ${detail.error}` : ''})`);
        }
        body = (await res.json()) as typeof body;
      } catch (err) {
        pushError ??= err instanceof Error ? err : new Error('push failed');
        continue; // isolate: later batches still get their shot
      }
      result.pushed += body.accepted.length;
      result.staleSkipped += body.stale.length;
      // Stale = the server copy carries a LATER stamp than this deliberate
      // local edit — almost always another device's fast clock, not a real
      // newer edit. The blaster's edit must win: re-stamp it just past the
      // server's copy so the next pass pushes it successfully. (True
      // concurrent edits resolve last-pusher-wins — same LWW semantics.)
      for (const s of body.stale) {
        const bumped = new Date(new Date(s.serverUpdatedAt).getTime() + 1).toISOString();
        await db
          .table(s.tableName)
          .where('id')
          .equals(s.recordId)
          .modify((row: { updatedAt?: string; syncStatus?: string }) => {
            if (row.syncStatus === 'local') row.updatedAt = bumped;
          });
      }
      // Mark accepted rows synced (stale ones stay local; pull below resolves)
      for (const a of body.accepted) {
        const record = batch.find((b) => b.tableName === a.tableName && b.recordId === a.recordId);
        if (!record) continue;
        if (record.deletedAt) {
          await engineWrite(() =>
            db.tombstones.update(`${a.tableName}:${a.recordId}`, { syncStatus: 'synced' }),
          );
        } else {
          // Only mark synced if the row hasn't been edited since we read it —
          // a keystroke mid-push must stay 'local' and go out next round
          await engineWrite(() =>
            db
              .table(a.tableName)
              .where('id')
              .equals(a.recordId)
              .modify((row: { updatedAt?: string; syncStatus?: string }) => {
                if (row.updatedAt === record.updatedAt) row.syncStatus = 'synced';
              }),
          );
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
      // Anything local that is as new or newer wins — covers the echo of our
      // own push in the same pass
      if (!remote.deletedAt && local?.updatedAt && local.updatedAt >= remote.updatedAt) {
        continue;
      }
      // A record with UNSYNCED local edits is never overwritten by pull,
      // even when the remote stamp is later (fast-clock devices produce
      // future stamps): the push/stale-recovery path arbitrates it, and the
      // blaster's deliberate edit must not vanish mid-typing
      if (!remote.deletedAt && local?.syncStatus === 'local') {
        continue;
      }
      if (remote.deletedAt) {
        // A local resurrection newer than the deletion wins
        if (local?.syncStatus === 'local' && local.updatedAt && local.updatedAt > remote.updatedAt) {
          continue;
        }
        if (local) await engineWrite(() => table.delete(remote.recordId));
        result.deleted += 1;
        continue;
      }
      const revived = reviveValue(remote.payload) as Record<string, unknown> | null;
      if (!revived || typeof revived !== 'object') continue; // malformed payload — skip
      // recordId is authoritative — payloads must never land without a key
      await engineWrite(() =>
        table.put({ ...revived, id: remote.recordId, syncStatus: 'synced' }),
      );
      result.pulled += 1;
    }
    localStorage.setItem(LS_KEYS.lastPulledAt, body.serverTime);

    // Push problems surface AFTER the pull so a bad batch can't block
    // receiving data — but they must surface: silent push failure is how a
    // device quietly stops backing up
    if (pushError) {
      localStorage.setItem(LS_KEYS.lastSyncError, pushError.message);
      throw pushError;
    }
    localStorage.removeItem(LS_KEYS.lastSyncError);

    return result;
  } finally {
    syncing = false;
  }
}

// ── Auto-sync ──────────────────────────────────────────────────────────────
// Local writes debounce into a push; connectivity returning, the app coming
// back to the foreground, and a periodic tick each trigger a full pass. The
// blaster should never have to think about Sync Now.

const AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
const WRITE_DEBOUNCE_MS = 8_000;

export type AutoSyncListener = (state: 'syncing' | 'synced' | 'offline' | 'error') => void;
const autoSyncListeners = new Set<AutoSyncListener>();

export function onAutoSync(listener: AutoSyncListener): () => void {
  autoSyncListeners.add(listener);
  return () => autoSyncListeners.delete(listener);
}

let autoSyncStarted = false;

async function autoSyncPass(): Promise<void> {
  if (syncing) return;
  if (!getSyncConfig().loggedIn) return;
  if (!navigator.onLine) {
    autoSyncListeners.forEach((l) => l('offline'));
    return;
  }
  autoSyncListeners.forEach((l) => l('syncing'));
  try {
    await syncNow();
    autoSyncListeners.forEach((l) => l('synced'));
  } catch {
    // Transient (server unreachable, token refresh mid-flight) — the next
    // trigger retries; local data is safe either way
    autoSyncListeners.forEach((l) => l('error'));
  }
}

export function startAutoSync(): void {
  if (autoSyncStarted) return;
  autoSyncStarted = true;

  // One-time re-baseline: the old pull filter could permanently miss records
  // that reached the server after this device's marker had advanced. Clear
  // the marker once so the next pass does a full pull; LWW keeps any newer
  // local edits intact.
  const PULL_RESET_KEY = 'shotlog-pull-reset-20260726';
  if (!localStorage.getItem(PULL_RESET_KEY)) {
    localStorage.removeItem(LS_KEYS.lastPulledAt);
    localStorage.setItem(PULL_RESET_KEY, '1');
  }

  const kick = () => void autoSyncPass();
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  window.setInterval(kick, AUTO_SYNC_INTERVAL_MS);

  // Any local write (except those made by sync itself) schedules a push.
  // The updating hook ALSO re-marks the record 'local': app code edits
  // records without touching syncStatus, and a synced record that isn't
  // re-marked would never push again.
  let writeTimer: number | undefined;
  const scheduleAfterWrite = () => {
    window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(kick, WRITE_DEBOUNCE_MS);
  };
  for (const table of db.tables) {
    table.hook('creating', function (_pk, obj) {
      if (engineWriting) return; // pull-applied writes keep their payload status
      (obj as { syncStatus?: string }).syncStatus ??= 'local';
      scheduleAfterWrite();
    });
    table.hook('updating', function (mods, _pk, obj) {
      if (engineWriting) return;
      scheduleAfterWrite();
      const m = mods as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      if (!('syncStatus' in m)) out.syncStatus = 'local';
      // Monotonic LWW clock: an edit must supersede the copy it was based
      // on even when that copy was stamped by a device with a fast clock —
      // otherwise the edit loses every sync and visibly reverts
      const base = (obj as { updatedAt?: string }).updatedAt;
      const provided = typeof m.updatedAt === 'string' ? m.updatedAt : undefined;
      if (base && (provided === undefined || provided <= base)) {
        out.updatedAt = new Date(new Date(base).getTime() + 1).toISOString();
      }
      if (Object.keys(out).length > 0) return out;
    });
    table.hook('deleting', function () {
      if (!engineWriting) scheduleAfterWrite();
    });
  }

  kick(); // catch up immediately on app start
}

// ── Deep check & repair ────────────────────────────────────────────────────

export interface DeepCheckRow {
  tableName: string;
  recordId: string;
  state: 'never-pushed' | 'device-newer' | 'server-newer';
}

export interface DeepCheckResult {
  rows: DeepCheckRow[];
  checked: number;
}

/**
 * Compare every local record's stamp against the server's copy. Surfaces the
 * residue any past sync bug leaves behind: records the device believes are
 * synced but the server never accepted, and server copies this device never
 * applied.
 */
export async function deepCheck(): Promise<DeepCheckResult> {
  const res = await authedFetch('/sync/changes');
  if (!res.ok) throw new Error(`deep check failed (${res.status})`);
  const body = (await res.json()) as {
    records: { tableName: string; recordId: string; updatedAt: string; deletedAt: string | null }[];
  };
  const remote = new Map<string, { updatedAt: string; deleted: boolean }>();
  for (const r of body.records) {
    remote.set(`${r.tableName}:${r.recordId}`, {
      updatedAt: r.updatedAt,
      deleted: r.deletedAt !== null,
    });
  }
  const rows: DeepCheckRow[] = [];
  let checked = 0;
  for (const tableName of SYNC_TABLES) {
    const locals = await db.table(tableName).toArray();
    for (const row of locals) {
      checked++;
      const r = remote.get(`${tableName}:${row.id}`);
      if (!r || r.deleted) {
        rows.push({ tableName, recordId: row.id, state: 'never-pushed' });
      } else if (row.updatedAt > r.updatedAt) {
        rows.push({ tableName, recordId: row.id, state: 'device-newer' });
      } else if (row.updatedAt < r.updatedAt) {
        rows.push({ tableName, recordId: row.id, state: 'server-newer' });
      }
    }
  }
  return { rows, checked };
}

/**
 * Heal every inconsistency deepCheck finds: re-mark records the server is
 * missing (or has older) for push, clear the pull marker for a full re-pull
 * of anything the server has newer, then run a pass. Safe to run any time —
 * LWW and the unsynced-local guard protect newer work on either side.
 */
export async function repairSync(): Promise<SyncResult> {
  const { rows } = await deepCheck();
  for (const r of rows) {
    if (r.state === 'never-pushed' || r.state === 'device-newer') {
      await db
        .table(r.tableName)
        .where('id')
        .equals(r.recordId)
        .modify({ syncStatus: 'local' });
    }
  }
  localStorage.removeItem(LS_KEYS.lastPulledAt);
  return syncNow();
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
