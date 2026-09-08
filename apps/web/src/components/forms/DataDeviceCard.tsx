// Data & device (Round S7b) — the LAST card in Settings on purpose: the
// sync status line, the device remedies, the export, the build id. Log out
// left this card for My Profile (one sign-out, one place). The old
// SyncCard's Sync Now / Deep Check / Repair panels stay gone: PowerSync
// replicates continuously and the status line reflects SDK truth.
import { useEffect, useState } from 'react';
import { Download, HardDrive, RotateCcw } from 'lucide-react';
import { authedFetch, getSession } from '@/lib/session';
import { exportAllData } from '@/lib/export';
import { resetLocalReplica } from '@/db/powersync/client';
import { useSyncStatus } from '@/db/powersync/useSyncStatus';
import { getSyncLog, setSyncDebug, syncDebugOn } from '@/lib/syncLog';
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

  // Where filed PDFs live (2026-09-07): truthful, from the server
  const [filesOk, setFilesOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!session.loggedIn) return;
    authedFetch('/files/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: boolean } | null) => setFilesOk(j ? Boolean(j.configured) : null))
      .catch(() => setFilesOk(null));
  }, [session.loggedIn]);
  const [debug, setDebug] = useState(syncDebugOn);
  const [copied, setCopied] = useState(false);
  const copyLog = () => {
    const text = getSyncLog().map((e) => `${e.at} ${e.msg}`).join('\n');
    void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined);
  };
  const firstSync = [...getSyncLog()].reverse().find((e) => e.msg.startsWith('first sync done'));
  const lastConnect = [...getSyncLog()].reverse().find((e) => e.msg.startsWith('connect:'));

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
        {session.loggedIn && filesOk !== null && (
          <p className="text-xs text-gray-500" data-files-status={filesOk ? 'on' : 'off'}>
            {filesOk
              ? 'Filed PDFs are stored on the server and fetched when opened.'
              : "Filed PDFs stay on the device that filed them — file storage isn't set up on the server yet."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500" data-sync-diagnostics>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={debug} data-sync-debug onChange={(e) => { setSyncDebug(e.target.checked); setDebug(e.target.checked); }} />
            Sync diagnostics (records what the sync client does — reload after turning it on)
          </label>
          <button type="button" className="underline text-navy" onClick={copyLog} data-sync-log-copy>
            {copied ? 'Copied' : 'Copy sync log'}
          </button>
        </div>
        {firstSync && (
          <p className="text-[11px] text-gray-400" data-first-sync>
            Last first sync: {firstSync.msg.replace('first sync done: ', '')} · {new Date(firstSync.at).toLocaleString()}
          </p>
        )}
        {lastConnect && (
          <p className="text-[11px] text-gray-400" data-last-connect>
            Last connect: {lastConnect.msg.replace('connect: ', '')} · {new Date(lastConnect.at).toLocaleString()}
          </p>
        )}
        <p className="text-[11px] text-gray-300 font-mono">Build {__BUILD_ID__}</p>
      </div>
    </SectionCard>
    </div>
  );
}
