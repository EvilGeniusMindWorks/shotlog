// Rolling connection-event log (last 50) for the sync panel — makes "it said
// offline for a while" diagnosable after the fact. Persisted to localStorage.

const KEY = 'shotlog-sync-log';
const MAX = 50;
export const SYNC_LOG_EVENT = 'shotlog-sync-log-changed';

export interface SyncLogEntry {
  at: string; // ISO timestamp
  msg: string;
}

export function getSyncLog(): SyncLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SyncLogEntry[];
  } catch {
    return [];
  }
}

export function logSyncEvent(msg: string): void {
  try {
    const entries = getSyncLog();
    // Collapse immediate repeats (SDK can emit the same state repeatedly)
    if (entries[entries.length - 1]?.msg === msg) return;
    entries.push({ at: new Date().toISOString(), msg });
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
    window.dispatchEvent(new Event(SYNC_LOG_EVENT));
  } catch {
    // storage full/unavailable — logging must never break the app
  }
}
