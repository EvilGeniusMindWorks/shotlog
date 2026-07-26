// The ONLY sync UI the app has: a truthful indicator driven by SDK state.
// connected / lastSyncedAt come from the SDK's status stream; queued is the
// actual local upload-queue depth (ps_crud), watched live.
import { useEffect, useState } from 'react';
import { getPowerSync } from './client';

export interface SyncStatusView {
  connected: boolean;
  lastSyncedAt: Date | null;
  /** Writes captured locally but not yet acknowledged by the server */
  queued: number;
}

export function useSyncStatus(): SyncStatusView {
  const [view, setView] = useState<SyncStatusView>({
    connected: false,
    lastSyncedAt: null,
    queued: 0,
  });

  useEffect(() => {
    const db = getPowerSync();
    const abort = new AbortController();

    const disposeStatus = db.registerListener({
      statusChanged: (status) => {
        setView((v) => ({
          ...v,
          connected: status.connected,
          lastSyncedAt: status.lastSyncedAt ?? null,
        }));
      },
    });
    // Seed from current status in case no change event fires soon
    setView((v) => ({
      ...v,
      connected: db.currentStatus?.connected ?? false,
      lastSyncedAt: db.currentStatus?.lastSyncedAt ?? null,
    }));

    db.watch(
      'SELECT COUNT(*) AS c FROM ps_crud',
      [],
      {
        onResult: (result) => {
          const row = (result.rows?._array ?? [])[0] as { c?: number } | undefined;
          setView((v) => ({ ...v, queued: row?.c ?? 0 }));
        },
      },
      { signal: abort.signal },
    );

    return () => {
      disposeStatus();
      abort.abort();
    };
  }, []);

  return view;
}
