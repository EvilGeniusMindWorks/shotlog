import { useEffect, useState } from 'react';
import { Cloud, Download, LogOut, RefreshCw } from 'lucide-react';
import {
  exportAllData,
  getSyncConfig,
  login,
  logout,
  pendingCount,
  syncNow,
  type SyncResult,
} from '@/lib/sync';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SyncCard() {
  const [config, setConfig] = useState(getSyncConfig());
  const [form, setForm] = useState({ serverUrl: config.serverUrl, email: config.email, password: '' });
  const [pending, setPending] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const refreshPending = () => {
    void pendingCount().then(setPending);
  };
  useEffect(refreshPending, []);

  // Auto-sync when connectivity returns (only when logged in)
  useEffect(() => {
    const onOnline = () => {
      if (getSyncConfig().loggedIn) void runSync();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSync = async () => {
    setWorking(true);
    setStatus('Syncing…');
    try {
      const result: SyncResult = await syncNow();
      setStatus(
        `Synced — pushed ${result.pushed}, pulled ${result.pulled}` +
          (result.deleted ? `, ${result.deleted} deletions` : '') +
          (result.staleSkipped ? `, ${result.staleSkipped} stale skipped` : ''),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'sync failed');
    } finally {
      setWorking(false);
      refreshPending();
      setConfig(getSyncConfig());
    }
  };

  const handleLogin = async () => {
    setWorking(true);
    setStatus('Logging in…');
    try {
      await login(form.serverUrl, form.email, form.password);
      setForm({ ...form, password: '' });
      setConfig(getSyncConfig());
      setStatus('Logged in');
      await runSync();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'login failed');
      setWorking(false);
    }
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

  return (
    <SectionCard
      title="Sync & Backup"
      icon={<IconChip tint="blue"><Cloud className="h-4 w-4" /></IconChip>}
      subtitle={
        config.loggedIn
          ? `${config.email} · ${pending === null ? '…' : pending === 0 ? 'all synced' : `${pending} pending`}`
          : 'Not connected — data is device-local only'
      }
      complete={config.loggedIn ? pending === 0 : undefined}
    >
      {config.loggedIn ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runSync} disabled={working}>
              <RefreshCw className={`h-4 w-4 mr-1 ${working ? 'animate-spin' : ''}`} /> Sync Now
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await logout();
                setConfig(getSyncConfig());
                setStatus('Logged out');
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Log out
            </Button>
          </div>
          {config.lastPulledAt && (
            <p className="text-xs text-gray-400">
              Last sync: {new Date(config.lastPulledAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Server URL</Label>
            <Input
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
              placeholder="https://shotlog-sync.up.railway.app"
              inputMode="url"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleLogin}
              disabled={working || !form.serverUrl || !form.email || !form.password}
            >
              Connect & Sync
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export JSON
            </Button>
          </div>
        </div>
      )}
      {status && <p className="text-sm text-gray-500">{status}</p>}
    </SectionCard>
  );
}
