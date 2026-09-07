// Account + backup card. The old SyncCard's Sync Now / Deep Check / Repair
// panels are gone on purpose: PowerSync replicates continuously and the
// status line reflects SDK truth — there is nothing to run by hand and
// nothing to repair.
import { useState } from 'react';
import { Cloud, Download, LogOut } from 'lucide-react';
import { getSession, logout } from '@/lib/session';
import { exportAllData } from '@/lib/export';
import { resetLocalReplica } from '@/db/powersync/client';
import { useSyncStatus } from '@/db/powersync/useSyncStatus';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';

export function AccountSyncCard() {
  const [session, setSession] = useState(getSession());
  const [status, setStatus] = useState<string | null>(null);
  const sync = useSyncStatus();

  const handleLogout = async () => {
    if (
      sync.queued > 0 &&
      !confirm(
        `${sync.queued} change${sync.queued === 1 ? '' : 's'} on this device ` +
          `haven't reached the server yet and will be LOST if you log out now. Log out anyway?`,
      )
    ) {
      return;
    }
    await logout();
    // Bounded: a wedged replica can no longer hold the sign-out hostage —
    // it is marked for deletion and the reload finishes the job
    await resetLocalReplica();
    setSession(getSession());
    setStatus('Logged out');
    window.location.reload();
  };

  const handleExport = async () => {
    const blob = await exportAllData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shotlog-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncLine = !session.loggedIn
    ? null
    : sync.queued > 0
      ? `${sync.queued} change${sync.queued === 1 ? '' : 's'} waiting for signal`
      : sync.connected
        ? 'All changes saved'
        : 'Offline — changes will send when signal returns';

  return (
    <SectionCard
      title="Account & Backup"
      icon={
        <IconChip tint="blue">
          <Cloud className="h-4 w-4" />
        </IconChip>
      }
      subtitle={
        session.loggedIn
          ? `${session.email}${syncLine ? ` · ${syncLine}` : ''}`
          : 'Not connected — data is device-local only'
      }
      complete={session.loggedIn ? sync.queued === 0 : undefined}
    >
      {session.loggedIn ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Log out
            </Button>
          </div>
          {sync.lastSyncedAt && (
            <p className="text-xs text-gray-400">
              Last synced: {sync.lastSyncedAt.toLocaleString()}
            </p>
          )}
          <p className="text-xs text-gray-400">
            Changes save to this device instantly and stream to the server whenever it has
            signal — nothing to run by hand.
          </p>
          {status && <p className="text-sm text-gray-500">{status}</p>}
          <p className="text-[11px] text-gray-300 font-mono">Build {__BUILD_ID__}</p>
        </div>
      ) : (
        // Unreachable in practice (AuthGate signs in before any page renders)
        // — kept minimal on purpose; the sign-in form lives in the gate
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Signed out. Reload to sign in.</p>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Go to sign in
          </Button>
          {status && <p className="text-sm text-gray-500">{status}</p>}
        </div>
      )}
    </SectionCard>
  );
}
