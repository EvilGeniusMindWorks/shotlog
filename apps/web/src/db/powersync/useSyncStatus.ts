// The ONLY sync UI the app has: a truthful indicator driven by SDK state.
// connected/connecting/uploading/downloading/hasSynced/lastSyncedAt come from
// the SDK's status stream; queued is the actual local upload-queue depth
// (ps_crud), watched live. Status transitions land in the rolling sync log.
import { useEffect, useState } from 'react';
import { logSyncEvent } from '@/lib/syncLog';
import { getPowerSync } from './client';

export interface SyncStatusView {
  connected: boolean;
  connecting: boolean;
  uploading: boolean;
  downloading: boolean;
  /** false until this device has completed its FIRST download sync */
  hasSynced: boolean | undefined;
  lastSyncedAt: Date | null;
  /** Writes captured locally but not yet acknowledged by the server */
  queued: number;
}

type SdkStatus = {
  connected: boolean;
  connecting?: boolean;
  hasSynced?: boolean;
  lastSyncedAt?: Date;
  dataFlowStatus?: { uploading?: boolean; downloading?: boolean };
};

function fromSdk(status: SdkStatus | undefined): Omit<SyncStatusView, 'queued'> {
  return {
    connected: status?.connected ?? false,
    connecting: status?.connecting ?? false,
    uploading: status?.dataFlowStatus?.uploading ?? false,
    downloading: status?.dataFlowStatus?.downloading ?? false,
    hasSynced: status?.hasSynced,
    lastSyncedAt: status?.lastSyncedAt ?? null,
  };
}

let lastLoggedConnected: boolean | null = null;

export function useSyncStatus(): SyncStatusView {
  const [view, setView] = useState<SyncStatusView>({
    connected: false,
    connecting: false,
    uploading: false,
    downloading: false,
    hasSynced: undefined,
    lastSyncedAt: null,
    queued: 0,
  });

  useEffect(() => {
    const db = getPowerSync();
    const abort = new AbortController();

    const disposeStatus = db.registerListener({
      statusChanged: (status) => {
        const next = fromSdk(status as SdkStatus);
        if (next.connected !== lastLoggedConnected) {
          lastLoggedConnected = next.connected;
          logSyncEvent(next.connected ? 'connected' : 'disconnected');
        }
        setView((v) => ({ ...v, ...next }));
      },
    });
    // Seed from current status in case no change event fires soon
    setView((v) => ({ ...v, ...fromSdk(db.currentStatus as SdkStatus | undefined) }));

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
