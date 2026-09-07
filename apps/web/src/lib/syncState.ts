// One truthful sync state for the whole app. Pure derivation so every
// surface (sidebar, mobile chip, panel) agrees and the logic is unit-tested.

export type SyncStateKind =
  | 'offline' // no internet at all
  | 'expired' // session rejected by the server — syncing paused until re-login
  | 'connecting' // stream not up yet but the SDK is actively trying
  | 'syncing' // connected and moving data (or queue non-empty)
  | 'synced' // connected, queue empty
  | 'unreachable'; // internet OK but the sync stream is down (server side)

export interface SyncStateInput {
  /** navigator.onLine */
  online: boolean;
  /** PowerSync stream connected */
  connected: boolean;
  /** PowerSync stream connecting */
  connecting: boolean;
  uploading: boolean;
  downloading: boolean;
  /** Local writes not yet acknowledged by the server */
  queued: number;
  /** Session definitively rejected — syncing paused until re-login */
  expired: boolean;
  /** false until this device's FIRST download has completed (undefined = unknown) */
  hasSynced?: boolean;
  /** 0..1 progress of the current download, when the SDK reports one */
  progress?: number | null;
}

export interface SyncState {
  kind: SyncStateKind;
  /** Full wording (sidebar, panel) */
  label: string;
  /** Compact wording (mobile chip) */
  short: string;
  tone: 'ok' | 'busy' | 'warn' | 'muted';
}

export function deriveSyncState(i: SyncStateInput): SyncState {
  if (!i.online) {
    return {
      kind: 'offline',
      label: 'Offline — saved on this device',
      short: 'Offline',
      tone: 'muted',
    };
  }
  if (i.expired) {
    return {
      kind: 'expired',
      label: 'Syncing paused — sign in',
      short: 'Sign in',
      tone: 'warn',
    };
  }
  if (i.connected) {
    // First download still running: never "Synced" (Matthew saw the chip go
    // green two seconds into a twenty-second download, 2026-09-07)
    if (i.hasSynced === false) {
      const pct = i.progress != null ? Math.round(Math.min(1, Math.max(0, i.progress)) * 100) : null;
      return {
        kind: 'syncing',
        label: pct != null ? `Downloading company data — ${pct}%` : 'Downloading company data…',
        short: pct != null ? `${pct}%` : 'Downloading',
        tone: 'busy',
      };
    }
    if (i.queued > 0 || i.uploading || i.downloading) {
      return {
        kind: 'syncing',
        label: i.queued > 0 ? `Syncing — ${i.queued} waiting` : 'Syncing…',
        short: i.queued > 0 ? `${i.queued} waiting` : 'Syncing',
        tone: 'busy',
      };
    }
    return { kind: 'synced', label: 'All changes saved', short: 'Synced', tone: 'ok' };
  }
  if (i.connecting) {
    return { kind: 'connecting', label: 'Connecting…', short: 'Connecting', tone: 'busy' };
  }
  return {
    kind: 'unreachable',
    label:
      i.queued > 0
        ? `Can't reach server — ${i.queued} saved on this device`
        : "Can't reach server — retrying",
    short: 'Retrying',
    tone: 'warn',
  };
}
