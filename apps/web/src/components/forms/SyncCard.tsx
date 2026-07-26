import { useEffect, useState } from 'react';
import { Cloud, Download, LogOut, RefreshCw } from 'lucide-react';
import { db } from '@/db';
import {
  deepCheck,
  exportAllData,
  fetchServerStats,
  getLastSyncError,
  getSyncConfig,
  login,
  logout,
  pendingCount,
  repairSync,
  syncNow,
  type DeepCheckResult,
  type ServerStats,
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
          <p className="text-xs text-gray-400">
            Syncs automatically — after edits, when connectivity returns, and every few
            minutes while online. Sync Now forces an immediate pass.
          </p>
          {getLastSyncError() && (
            <p className="text-sm text-safety-orange border border-orange-200 bg-orange-50 rounded-lg px-3 py-2">
              Last sync problem: {getLastSyncError()} — your data is safe on this device;
              sync keeps retrying and other records still go through.
            </p>
          )}
          <DeviceVsServer />
          <DeepCheckPanel />
          <p className="text-[11px] text-gray-300 font-mono">Build {__BUILD_ID__}</p>
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

/**
 * Field diagnostic: this device's record counts next to the server's, so
 * "my phone is missing a shot" is answerable from either device — a gap on
 * the server side means the OTHER device hasn't pushed; a gap on this side
 * means this device hasn't pulled.
 */
function DeviceVsServer() {
  const KEY_TABLES = ['blastDays', 'shots', 'seismoReadings', 'attachments'] as const;
  const LABELS: Record<(typeof KEY_TABLES)[number], string> = {
    blastDays: 'Blast Days',
    shots: 'Shots',
    seismoReadings: 'Seismo',
    attachments: 'Attachments',
  };
  const [rows, setRows] = useState<
    { label: string; device: number; server: number | null }[] | null
  >(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    const device = await Promise.all(KEY_TABLES.map((t) => db.table(t).count()));
    let stats: ServerStats | null = null;
    try {
      stats = await fetchServerStats();
    } catch {
      setError(true);
    }
    setRows(
      KEY_TABLES.map((t, i) => ({
        label: LABELS[t],
        device: device[i],
        server: stats?.tables.find((x) => x.tableName === t)?.count ?? (stats ? 0 : null),
      })),
    );
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) return null;
  const mismatch = rows.some((r) => r.server !== null && r.device !== r.server);
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-500">This device vs server</p>
        <button className="text-xs text-navy underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-[10px] text-gray-400">{r.label}</p>
            <p
              className={`font-mono text-sm font-bold ${
                r.server !== null && r.device !== r.server ? 'text-safety-orange' : 'text-gray-700'
              }`}
            >
              {r.device} / {r.server ?? '?'}
            </p>
          </div>
        ))}
      </div>
      {error && (
        <p className="text-xs text-gray-400 mt-1.5">Server unreachable — counts show device only</p>
      )}
      {!error && mismatch && (
        <p className="text-xs text-safety-orange mt-1.5">
          Counts differ — tap Sync Now; if it persists, the other device hasn't synced yet
        </p>
      )}
    </div>
  );
}

/**
 * Deep Check compares every local record's stamp against the server and
 * names what disagrees; Repair re-pushes what the server is missing and
 * fully re-pulls what the server has newer. This is the recovery path for
 * any residue past sync bugs left behind.
 */
function DeepCheckPanel() {
  const [result, setResult] = useState<DeepCheckResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'repair' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runCheck = async () => {
    setBusy('check');
    setMessage(null);
    try {
      setResult(await deepCheck());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'check failed');
    } finally {
      setBusy(null);
    }
  };

  const runRepair = async () => {
    setBusy('repair');
    setMessage(null);
    try {
      const r = await repairSync();
      setMessage(`Repaired — pushed ${r.pushed}, pulled ${r.pulled}`);
      setResult(await deepCheck());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'repair failed');
    } finally {
      setBusy(null);
    }
  };

  const summary = result
    ? (['never-pushed', 'device-newer', 'server-newer'] as const)
        .map((s) => ({ s, n: result.rows.filter((r) => r.state === s).length }))
        .filter((x) => x.n > 0)
    : [];

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">Deep Check</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void runCheck()}>
            {busy === 'check' ? 'Checking…' : 'Check'}
          </Button>
          {result && result.rows.length > 0 && (
            <Button size="sm" disabled={busy !== null} onClick={() => void runRepair()}>
              {busy === 'repair' ? 'Repairing…' : `Repair ${result.rows.length}`}
            </Button>
          )}
        </div>
      </div>
      {result && result.rows.length === 0 && (
        <p className="text-xs text-compliant">
          ✓ All {result.checked} records match the server exactly
        </p>
      )}
      {result && result.rows.length > 0 && (
        <div className="text-xs text-gray-600 space-y-0.5">
          {summary.map(({ s, n }) => (
            <p key={s}>
              <b>{n}</b>{' '}
              {s === 'never-pushed'
                ? 'on this device but not on the server'
                : s === 'device-newer'
                  ? 'newer on this device than the server'
                  : 'newer on the server than this device'}
              {' — '}
              {[...new Set(result.rows.filter((r) => r.state === s).map((r) => r.tableName))].join(', ')}
            </p>
          ))}
        </div>
      )}
      {message && <p className="text-xs text-gray-500">{message}</p>}
    </div>
  );
}
