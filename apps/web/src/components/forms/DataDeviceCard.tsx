// Data & device (Round S7b) — the LAST card in Settings on purpose: the
// sync status line, the device remedies, the export, the build id. Log out
// left this card for My Profile (one sign-out, one place). The old
// SyncCard's Sync Now / Deep Check / Repair panels stay gone: PowerSync
// replicates continuously and the status line reflects SDK truth.
import { useState } from 'react';
import { Download, HardDrive, RotateCcw } from 'lucide-react';
import { getSession } from '@/lib/session';
import { exportAllData } from '@/lib/export';
import { opfsSupported, resetLocalReplica, setStorageEngine, storageEngine, type StorageEngine } from '@/db/powersync/client';
import { useSyncStatus } from '@/db/powersync/useSyncStatus';
import { getSyncLog } from '@/lib/syncLog';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';

export function DataDeviceCard() {
  const session = getSession();
  const sync = useSyncStatus();
  const [resetting, setResetting] = useState(false);

  const handleExport = async () => {
    const blob = await exportAllData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shotlog-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = async () => {
    const queued = sync.queued > 0 ? `${sync.queued} unsent change${sync.queued === 1 ? '' : 's'} on this device will be lost. ` : '';
    if (!confirm(`${queued}Clear this device's copy of the company data and download it again?`)) return;
    setResetting(true);
    await resetLocalReplica();
    window.location.reload();
  };

  // Storage engine measurement (2026-09-07): switching clears this device's
  // copy and downloads again on the other engine; the sync log then carries
  // "first sync done: N records in Xs · engine" so the two can be compared
  const engine = storageEngine();
  const firstSync = [...getSyncLog()].reverse().find((e) => e.msg.startsWith('first sync done'));
  const handleEngine = async (next: StorageEngine) => {
    if (next === engine) return;
    const queued = sync.queued > 0 ? `${sync.queued} unsent change${sync.queued === 1 ? '' : 's'} on this device will be lost. ` : '';
    if (!confirm(`${queued}Switch storage to ${next === 'opfs' ? 'OPFS' : 'IndexedDB'}? This clears the device's copy and downloads the company again.`)) return;
    setResetting(true);
    await resetLocalReplica();
    setStorageEngine(next);
    window.location.reload();
  };

  const syncLine = !session.loggedIn
    ? 'Not connected — data is device-local only'
    : sync.queued > 0
      ? `${sync.queued} change${sync.queued === 1 ? '' : 's'} waiting for signal`
      : sync.connected
        ? 'All changes saved'
        : 'Offline — changes will send when signal returns';

  return (
    <div data-data-device-card>
    <SectionCard
      title="Data & device"
      icon={
        <IconChip tint="blue">
          <HardDrive className="h-4 w-4" />
        </IconChip>
      }
      subtitle={`${syncLine}${sync.lastSyncedAt ? ` · last synced ${sync.lastSyncedAt.toLocaleString()}` : ''}`}
      complete={session.loggedIn ? sync.queued === 0 : undefined}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleReset()} disabled={resetting} data-settings-reset>
            <RotateCcw className="h-4 w-4 mr-1" /> {resetting ? 'Resetting…' : 'Reset local data'}
          </Button>
          <Button variant="ghost" onClick={() => void handleExport()} data-settings-export>
            <Download className="h-4 w-4 mr-1" /> Export JSON
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Changes save to this device instantly and stream to the server whenever it has signal.
          Reset is the remedy when the sync chip stays red: it clears this device's copy and
          downloads the company again. Export is a raw JSON backup of what this device holds.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500" data-storage-engine={engine}>
          <span>Storage engine</span>
          <select
            className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
            value={engine}
            disabled={resetting}
            onChange={(e) => void handleEngine(e.target.value as StorageEngine)}
            data-storage-engine-select
          >
            <option value="idb">IndexedDB (default)</option>
            <option value="opfs" disabled={!opfsSupported()}>
              OPFS — file storage{opfsSupported() ? '' : ' (not available here)'}
            </option>
          </select>
          {firstSync && (
            <span className="text-gray-400" data-first-sync>
              Last first sync: {firstSync.msg.replace('first sync done: ', '')} · {new Date(firstSync.at).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-300 font-mono">Build {__BUILD_ID__}</p>
      </div>
    </SectionCard>
    </div>
  );
}
