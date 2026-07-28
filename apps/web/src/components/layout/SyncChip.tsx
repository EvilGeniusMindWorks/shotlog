// The app's one sync indicator. Same truth everywhere (sidebar + mobile
// header) via deriveSyncState; tapping opens the sync panel with details,
// a Reconnect button, the re-login path, and the connection event log.
import { useEffect, useState } from 'react';
import { Copy, RefreshCw, X } from 'lucide-react';
import { useSyncStatus } from '@/db/powersync/useSyncStatus';
import { connectPowerSync, reconnectPowerSync } from '@/db/powersync/client';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSessionExpired } from '@/hooks/useSessionExpired';
import { deriveSyncState, type SyncState } from '@/lib/syncState';
import { SYNC_LOG_EVENT, getSyncLog, type SyncLogEntry } from '@/lib/syncLog';
import { getSession, login } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<SyncState['tone'], string> = {
  ok: 'bg-green-500',
  busy: 'bg-blue-400',
  warn: 'bg-amber-400',
  muted: 'bg-gray-400',
};

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Compact chip. variant 'sidebar' shows the full label; 'badge' the short one. */
export function SyncChip({ variant }: { variant: 'sidebar' | 'badge' }) {
  const sync = useSyncStatus();
  const online = useOnlineStatus();
  const expired = useSessionExpired();
  const [open, setOpen] = useState(false);
  const state = deriveSyncState({ ...sync, online, expired });

  const busySpin = state.tone === 'busy';
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Sync status — tap for details"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full text-left',
          variant === 'sidebar'
            ? 'px-2 py-1 text-xs text-navy-200 hover:bg-white/10 max-w-full'
            : 'px-2.5 py-1 text-xs font-medium bg-white/10 text-white',
        )}
      >
        {busySpin ? (
          <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
        ) : (
          <span className={cn('h-2 w-2 rounded-full shrink-0', TONE_DOT[state.tone])} />
        )}
        <span className="truncate">
          {variant === 'sidebar'
            ? state.kind === 'synced' && sync.lastSyncedAt
              ? `${state.label} ${fmtTime(sync.lastSyncedAt)}`
              : state.label
            : state.short}
        </span>
      </button>
      {open && <SyncPanel state={state} onClose={() => setOpen(false)} />}
    </>
  );
}

function SyncPanel({ state, onClose }: { state: SyncState; onClose: () => void }) {
  const sync = useSyncStatus();
  const expired = useSessionExpired();
  const [log, setLog] = useState<SyncLogEntry[]>(getSyncLog());
  const [reconnecting, setReconnecting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const update = () => setLog(getSyncLog());
    window.addEventListener(SYNC_LOG_EVENT, update);
    return () => window.removeEventListener(SYNC_LOG_EVENT, update);
  }, []);

  const reconnect = async () => {
    setReconnecting(true);
    try {
      await reconnectPowerSync();
    } catch {
      // failure lands in the log; the chip stays truthful
    } finally {
      setTimeout(() => setReconnecting(false), 1500);
    }
  };

  const copyLog = () => {
    const text = log.map((e) => `${e.at} ${e.msg}`).join('\n');
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">Sync</h2>
            <p className="text-sm text-gray-500">{state.label}</p>
          </div>
          <button className="p-1 text-gray-400" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
            <p className="text-xs text-gray-400">Waiting to send</p>
            <p className="font-mono font-semibold text-lg">{sync.queued}</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
            <p className="text-xs text-gray-400">Last synced</p>
            <p className="font-semibold">
              {sync.lastSyncedAt ? sync.lastSyncedAt.toLocaleString() : 'Never on this device'}
            </p>
          </div>
        </div>

        {sync.hasSynced === false && (
          <p className="text-sm text-amber-600">
            First sync hasn't completed yet — company data is still downloading to this device.
          </p>
        )}

        <p className="text-xs text-gray-400">
          Everything you enter saves to this device instantly, signal or not, and streams to the
          office whenever the server is reachable.
        </p>

        <div className="flex flex-wrap gap-2">
          {expired ? (
            <Button onClick={() => setShowLogin(true)}>Sign in to resume syncing</Button>
          ) : (
            <Button onClick={() => void reconnect()} disabled={reconnecting || state.kind === 'synced'}>
              <RefreshCw className={cn('h-4 w-4 mr-1', reconnecting && 'animate-spin')} />
              {reconnecting ? 'Reconnecting…' : 'Reconnect now'}
            </Button>
          )}
        </div>

        {log.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Connection log
              </p>
              <button className="text-xs text-gray-400 inline-flex items-center gap-1" onClick={copyLog}>
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-800 p-2 space-y-0.5">
              {[...log].reverse().map((e, i) => (
                <p key={i} className="text-[11px] font-mono text-gray-500">
                  {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}{' '}
                  {e.msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {showLogin && <ReLoginSheet onDone={() => setShowLogin(false)} />}
      </div>
    </div>
  );
}

/**
 * Sticky banner when the server rejected our session: the app keeps working
 * fully offline on local data — this is only about resuming sync.
 */
export function SessionExpiredBanner() {
  const expired = useSessionExpired();
  const [open, setOpen] = useState(false);
  if (!expired) return null;
  return (
    <div className="sticky top-0 z-30 bg-amber-50 dark:bg-amber-950 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
      <div className="flex items-center gap-2 flex-wrap">
        <span>
          Syncing paused — sign in when you have signal. Your work keeps saving on this device.
        </span>
        <button
          className="ml-auto shrink-0 rounded-md bg-amber-900 text-amber-50 px-2.5 py-1 text-xs font-semibold"
          onClick={() => setOpen((o) => !o)}
        >
          Sign in
        </button>
      </div>
      {open && (
        <div className="mt-2 max-w-sm bg-white dark:bg-gray-900 rounded-lg">
          <ReLoginSheet onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Fresh-device guard: until the FIRST download sync completes, empty lists
 * mean "not here yet", not "doesn't exist" — say so app-wide.
 */
export function FirstSyncStrip() {
  const sync = useSyncStatus();
  if (sync.hasSynced !== false) return null;
  return (
    <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 px-4 py-1.5 text-xs text-blue-900 dark:text-blue-100 flex items-center gap-2">
      <RefreshCw className="h-3 w-3 animate-spin" />
      First sync in progress — downloading company data to this device…
    </div>
  );
}

/** Appears when a new build has downloaded; applying restarts the app. */
export function UpdateChip({ className }: { className?: string }) {
  const [ready, setReady] = useState(
    Boolean((window as unknown as Record<string, unknown>).__shotlogSwUpdateReady),
  );
  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener('shotlog-sw-update-ready', on);
    return () => window.removeEventListener('shotlog-sw-update-ready', on);
  }, []);
  if (!ready) return null;
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-safety-orange text-white px-2.5 py-1 text-xs font-semibold',
        className,
      )}
      onClick={() => {
        const apply = (window as unknown as Record<string, unknown>).__shotlogApplySwUpdate;
        if (typeof apply === 'function') (apply as () => void)();
      }}
      title="A new version is ready — tap to restart"
    >
      <RefreshCw className="h-3 w-3" /> Update
    </button>
  );
}

/** Password-only re-login (email prefilled) — resumes syncing without leaving the app */
export function ReLoginSheet({ onDone }: { onDone: () => void }) {
  const session = getSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setWorking(true);
    setError(null);
    try {
      await login(session.serverUrl, session.email, password);
      await connectPowerSync();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign in failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <p className="text-sm font-medium">Sign in as {session.email}</p>
      <div>
        <Label htmlFor="relogin-password">Password</Label>
        <Input
          id="relogin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-violation">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={working || !password}>
          {working ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
