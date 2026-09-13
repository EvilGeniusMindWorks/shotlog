// Admin › Feedback › Crashes (Round S11, Sep 13 2026). One line per distinct
// problem: how many times, who, first and last seen, which build; open it
// for the decoded trace, the breadcrumbs, the device facts and what people
// said. Status is yours: new → seen → fixed in build X. "Copy for Claude"
// puts the whole bundle on the clipboard as plain text.
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Trash2, Zap } from 'lucide-react';
import { authedFetch } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/undo-toast';
import { cn } from '@/lib/utils';

interface Group {
  fingerprint: string;
  title: string;
  side: 'web' | 'server';
  status: 'new' | 'seen' | 'fixed';
  fixedInBuild: string | null;
  note: string | null;
  count: number;
  people: { id: string; name: string }[];
  firstSeen: string;
  lastSeen: string;
  lastBuild: string;
  sampleId: string;
  notifiedAt: string | null;
}

interface Frame {
  fn: string;
  file: string;
  line: number;
  col: number;
  source?: string;
  sourceLine?: number;
  sourceCol?: number;
  sourceFn?: string;
}

interface Sample {
  id: string;
  reportCode: string;
  userName: string;
  userEmail: string;
  role: string;
  route: string;
  buildId: string;
  commit: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  standalone: boolean;
  createdAt: string;
  receivedAt: string;
  message: string;
  crash: {
    kind: string;
    frames: Frame[];
    decoded: boolean;
    breadcrumbs: { at: string; kind: string; text: string }[];
    context: Record<string, unknown>;
    componentStack?: string;
  } | null;
}

interface Detail {
  group: Group;
  samples: Sample[];
  words: { id: string; userName: string; message: string; createdAt: string }[];
  bundle: string;
}

const STATUS_BADGE = { new: 'submitted', seen: 'draft', fixed: 'approved' } as const;

function frameLine(f: Frame): string {
  if (f.source) return `${f.sourceFn ?? f.fn}  ${f.source}:${f.sourceLine}${f.sourceCol ? `:${f.sourceCol}` : ''}`;
  const file = f.file.slice(f.file.lastIndexOf('/') + 1);
  return `${f.fn}  ${file}:${f.line}:${f.col}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminCrashesTab({
  online,
  onOpenCount,
  focusGroup,
}: {
  online: boolean;
  onOpenCount: (n: number) => void;
  focusGroup: string | null;
}) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [meta, setMeta] = useState<{ emailEnabled: boolean; recipients: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFp, setOpenFp] = useState<string | null>(focusGroup);
  const [detail, setDetail] = useState<Record<string, Detail>>({});
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch('/feedback/crashes');
      if (res.status === 403) {
        setError('Only the ShotLog platform admin can read crashes.');
        setGroups([]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { groups: Group[]; open: number; emailEnabled: boolean; recipients: string[] };
      setGroups(body.groups);
      setMeta({ emailEnabled: body.emailEnabled, recipients: body.recipients });
      onOpenCount(body.open);
    } catch {
      setError("Couldn't load crashes — check the connection and try again.");
      setGroups((g) => g ?? []);
    }
  }, [onOpenCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(
    async (fp: string) => {
      if (detail[fp]) return;
      const res = await authedFetch(`/feedback/crashes/${encodeURIComponent(fp)}`);
      if (res.ok) {
        const body = (await res.json()) as Detail;
        setDetail((d) => ({ ...d, [fp]: body }));
      }
    },
    [detail],
  );
  useEffect(() => {
    if (openFp) void loadDetail(openFp);
  }, [openFp, loadDetail]);

  const patch = async (fp: string, data: { status?: Group['status']; fixedInBuild?: string | null; note?: string | null }) => {
    const res = await authedFetch(`/feedback/crashes/${encodeURIComponent(fp)}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!res.ok) {
      showToast("Couldn't save — are you online?");
      return;
    }
    const body = (await res.json()) as { group: Group };
    setGroups((gs) => (gs ?? []).map((g) => (g.fingerprint === fp ? { ...g, ...body.group } : g)));
    setDetail((d) => (d[fp] ? { ...d, [fp]: { ...d[fp], group: { ...d[fp].group, ...body.group } } } : d));
    onOpenCount((groups ?? []).filter((g) => (g.fingerprint === fp ? body.group.status : g.status) !== 'fixed').length);
  };

  const remove = async (fp: string) => {
    const res = await authedFetch(`/feedback/crashes/${encodeURIComponent(fp)}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast("Couldn't delete — are you online?");
      return;
    }
    setGroups((gs) => (gs ?? []).filter((g) => g.fingerprint !== fp));
    if (openFp === fp) setOpenFp(null);
  };

  const copy = async (fp: string) => {
    const b = detail[fp]?.bundle;
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b);
      setCopied(fp);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast("Couldn't copy on this device.");
    }
  };

  const visible = (groups ?? []).filter((g) => filter === 'all' || g.status !== 'fixed');

  // Test crashes (Matthew, Sep 13 2026): prove the inbox and the decoded
  // traces without waiting for a real failure. The web one goes through the
  // same capture as a real error; the server one throws inside a route.
  const [testing, setTesting] = useState<string | null>(null);
  const testWeb = () => {
    const err = new Error(`Test crash from Admin (${new Date().toLocaleTimeString()})`);
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: err.message }));
    showToast('Test error thrown on this device — its line appears below in a few seconds.');
    window.setTimeout(() => void load(), 3000);
  };
  const testServer = async () => {
    setTesting('server');
    try {
      const res = await authedFetch('/platform/crash-test', { method: 'POST', body: '{}' });
      const body = (await res.json().catch(() => null)) as { reportCode?: string } | null;
      showToast(res.status === 500 && body?.reportCode ? `The server failed on purpose — report code ${body.reportCode}` : `Unexpected answer: HTTP ${res.status}`);
      await load();
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4" data-admin-crashes>
      <div className="flex items-start gap-2 flex-wrap">
        <p className="text-sm text-gray-500 flex-1 min-w-[200px]">
          Problems the app caught on its own, one line per distinct problem, on phones and on the server.
          You get one email when a problem is new; repeats only raise the count here.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={!online}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {meta && (
        <p className="text-xs text-gray-400">
          New problems email {meta.recipients.join(', ') || 'nobody'} — {meta.emailEnabled ? 'email is on.' : 'email is OFF on the server.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3" data-crash-test>
        <span className="text-xs text-gray-500 flex-1 min-w-[200px]">
          Prove it works: throw a harmless test error here, or make the server fail on purpose. Each becomes a line
          below with a report code; the trace should read as a real file and line when this build's source maps are in.
        </span>
        <Button size="sm" variant="outline" onClick={testWeb} data-crash-test-web>
          <Zap className="h-4 w-4 mr-1" /> Test crash on this device
        </Button>
        <Button size="sm" variant="outline" onClick={() => void testServer()} disabled={!online || testing != null} data-crash-test-server>
          <Zap className="h-4 w-4 mr-1" /> {testing === 'server' ? 'Failing…' : 'Test crash on the server'}
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className={cn('px-3 py-1.5 rounded-full border', filter === 'open' ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300')} onClick={() => setFilter('open')}>
          Open ({(groups ?? []).filter((g) => g.status !== 'fixed').length})
        </button>
        <button className={cn('px-3 py-1.5 rounded-full border', filter === 'all' ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300')} onClick={() => setFilter('all')}>
          All ({(groups ?? []).length})
        </button>
      </div>
      {error && <p className="text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</p>}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {groups === null && <p className="p-3 text-sm text-gray-400">Loading…</p>}
        {groups !== null && visible.length === 0 && !error && (
          <p className="p-3 text-sm text-gray-400" data-crashes-empty>
            {filter === 'open' ? 'Nothing open. ' : 'No crashes yet. '}
            A crash lands here the moment it happens — or when the phone reconnects.
          </p>
        )}
        {visible.map((g) => {
          const isOpen = openFp === g.fingerprint;
          const d = detail[g.fingerprint];
          const sample = d?.samples.find((s) => s.id === d.group.sampleId) ?? d?.samples[0];
          return (
            <div key={g.fingerprint} data-crash-group={g.fingerprint} className={cn(isOpen && 'bg-gray-50')}>
              <button className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50" onClick={() => setOpenFp(isOpen ? null : g.fingerprint)}>
                <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold', g.side === 'server' ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700')}>
                  {g.side === 'server' ? 'API' : 'app'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm break-words', !isOpen && 'line-clamp-2', g.status === 'new' && 'font-medium')} data-crash-title>
                    {g.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {g.count} time{g.count === 1 ? '' : 's'} · {g.people.length} {g.people.length === 1 ? 'person' : 'people'}
                    {g.people.length > 0 && ` (${g.people.map((p) => p.name).join(', ')})`} · last {when(g.lastSeen)} · build {g.lastBuild || '—'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={STATUS_BADGE[g.status]}>{g.status === 'fixed' && g.fixedInBuild ? `fixed in ${g.fixedInBuild}` : g.status}</Badge>
                  <span className="text-[10px] text-gray-400">{g.notifiedAt ? 'emailed' : 'no email'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3" data-crash-detail>
                  {!d && <p className="text-xs text-gray-400">Loading…</p>}
                  {sample && (
                    <>
                      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-400">Latest</dt>
                        <dd className="col-span-1 sm:col-span-2 text-gray-700">
                          {sample.userName} · {sample.role} · {sample.route || '/'} · {when(sample.receivedAt)} · code{' '}
                          <span className="font-mono font-semibold" data-crash-sample-code>{sample.reportCode}</span>
                        </dd>
                        <dt className="text-gray-400">Build</dt>
                        <dd className="col-span-1 sm:col-span-2 text-gray-700 font-mono">{sample.buildId || '—'}{sample.commit ? ` · ${sample.commit.slice(0, 7)}` : ''}</dd>
                        <dt className="text-gray-400">Device</dt>
                        <dd className="col-span-1 sm:col-span-2 text-gray-700">{sample.userAgent.slice(0, 80)} · {sample.viewport}{sample.online ? '' : ' · OFFLINE'}{sample.standalone ? ' · installed' : ''}</dd>
                        <dt className="text-gray-400">First seen</dt>
                        <dd className="col-span-1 sm:col-span-2 text-gray-700">{when(g.firstSeen)}</dd>
                      </dl>
                      {sample.crash && (
                        <div className="text-xs">
                          <p className="text-gray-500 mb-1">
                            Trace {sample.crash.decoded ? <span className="text-green-700">(readable — decoded from this build's source maps)</span> : <span className="text-amber-700">(minified — no source maps for this build)</span>}
                          </p>
                          <div className="max-h-56 overflow-auto rounded-lg bg-gray-900 text-gray-100 p-2 font-mono space-y-0.5" data-crash-trace>
                            <p className="text-red-300">{sample.crash.kind}: {sample.message}</p>
                            {sample.crash.frames.map((f, i) => (
                              <p key={i} className={cn(f.source ? 'text-gray-100' : 'text-gray-400')}>at {frameLine(f)}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      {sample.crash && sample.crash.breadcrumbs.length > 0 && (
                        <details className="text-xs" open>
                          <summary className="cursor-pointer text-gray-500">What they did before it ({sample.crash.breadcrumbs.length})</summary>
                          <div className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-100 p-2 font-mono text-gray-700 space-y-0.5" data-crash-breadcrumbs>
                            {sample.crash.breadcrumbs.map((b, i) => (
                              <p key={i}><span className="text-gray-400">{b.at.slice(11, 19)} {b.kind.padEnd(4)}</span> {b.text}</p>
                            ))}
                          </div>
                        </details>
                      )}
                      {sample.crash && Object.keys(sample.crash.context).length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-500">Device and session</summary>
                          <div className="mt-1 rounded-lg bg-gray-100 p-2 font-mono text-gray-700">
                            {Object.entries(sample.crash.context).map(([k, v]) => (
                              <p key={k}>{k}: {typeof v === 'string' ? v : JSON.stringify(v)}</p>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                  {d && d.words.length > 0 && (
                    <div className="text-xs space-y-1" data-crash-words>
                      <p className="text-gray-500">What people said</p>
                      {d.words.map((w) => (
                        <p key={w.id} className="rounded-lg border border-gray-200 bg-white p-2 whitespace-pre-wrap"><b>{w.userName}</b> · {when(w.createdAt)}<br />{w.message}</p>
                      ))}
                    </div>
                  )}
                  {d && d.samples.length > 1 && (
                    <p className="text-xs text-gray-400">
                      Other hits: {d.samples.filter((s) => s.id !== sample?.id).map((s) => `${s.userName} ${when(s.receivedAt)} (${s.reportCode})`).join(' · ')}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {g.status !== 'seen' && g.status !== 'fixed' && (
                      <Button size="sm" variant="outline" onClick={() => void patch(g.fingerprint, { status: 'seen' })} data-crash-seen>
                        Mark seen
                      </Button>
                    )}
                    {g.status !== 'fixed' && (
                      <span className="flex items-center gap-1">
                        <Input className="h-8 w-40 text-xs" placeholder="fixed in build…" defaultValue={g.lastBuild} data-crash-fixed-build id={`fixed-${g.fingerprint}`} />
                        <Button
                          size="sm"
                          onClick={() => {
                            const el = document.getElementById(`fixed-${g.fingerprint}`) as HTMLInputElement | null;
                            void patch(g.fingerprint, { status: 'fixed', fixedInBuild: el?.value.trim() || null });
                          }}
                          data-crash-fixed
                        >
                          <Check className="h-4 w-4 mr-1" /> Fixed
                        </Button>
                      </span>
                    )}
                    {g.status === 'fixed' && (
                      <Button size="sm" variant="outline" onClick={() => void patch(g.fingerprint, { status: 'new', fixedInBuild: null })}>
                        Reopen
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => void copy(g.fingerprint)} disabled={!d} data-crash-copy>
                      <Copy className="h-4 w-4 mr-1" /> {copied === g.fingerprint ? 'Copied' : 'Copy for Claude'}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void remove(g.fingerprint)} data-crash-delete>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                  {g.note && <p className="text-xs text-gray-500 whitespace-pre-wrap">{g.note}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
