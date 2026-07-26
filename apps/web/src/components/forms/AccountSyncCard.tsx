// Account + backup card. The old SyncCard's Sync Now / Deep Check / Repair
// panels are gone on purpose: PowerSync replicates continuously and the
// status line reflects SDK truth — there is nothing to run by hand and
// nothing to repair.
import { useState } from 'react';
import { Cloud, Download, LogOut } from 'lucide-react';
import {
  DEFAULT_SERVER_URL,
  getSession,
  login,
  logout,
} from '@/lib/session';
import { exportAllData } from '@/lib/export';
import { connectPowerSync, disconnectAndClearPowerSync } from '@/db/powersync/client';
import { useSyncStatus } from '@/db/powersync/useSyncStatus';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AccountSyncCard() {
  const [session, setSession] = useState(getSession());
  const [form, setForm] = useState({
    serverUrl: session.serverUrl || DEFAULT_SERVER_URL,
    email: session.email,
    password: '',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const sync = useSyncStatus();

  const handleLogin = async () => {
    setWorking(true);
    setStatus('Logging in…');
    try {
      await login(form.serverUrl, form.email, form.password);
      setForm({ ...form, password: '' });
      await connectPowerSync();
      setSession(getSession());
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'login failed');
    } finally {
      setWorking(false);
    }
  };

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
    await disconnectAndClearPowerSync();
    setSession(getSession());
    setStatus('Logged out');
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
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="server-url">Server</Label>
              <Input
                id="server-url"
                value={form.serverUrl}
                onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void handleLogin()}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleLogin} disabled={working}>
              Log in
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
          </div>
          {status && <p className="text-sm text-gray-500">{status}</p>}
        </div>
      )}
    </SectionCard>
  );
}
