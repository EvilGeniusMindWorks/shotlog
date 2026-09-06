// Admin › Feedback (Round S3) — PLATFORM admin only (Matthew). Lists every
// report + crash from the server (not synced; REST, online-only like the
// rest of Admin), with seen/done, a reply note, and the screenshot on
// demand. Company admins never see this tab (decisions 2026-09-06).
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Bug, Image as ImageIcon, Lightbulb, MessageCircleQuestion, RefreshCw, Trash2, Zap } from 'lucide-react';
import { authedFetch } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/undo-toast';
import { cn } from '@/lib/utils';

interface FeedbackRow {
  id: string;
  companyName: string;
  userName: string;
  userEmail: string;
  role: string;
  kind: 'bug' | 'idea' | 'question' | 'crash';
  message: string;
  route: string;
  buildId: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  standalone: boolean;
  status: 'new' | 'seen' | 'done';
  replyNote: string | null;
  notified: 'sent' | 'email-off' | 'failed';
  createdAt: string;
  receivedAt: string;
  hasScreenshot: boolean;
}

interface FeedbackDetail extends FeedbackRow {
  screenshot: string | null;
  syncLogTail: { at: string; msg: string }[];
  errorLog: { at: string; kind: string; msg: string; stack?: string }[];
}

const KIND_ICON = { bug: Bug, idea: Lightbulb, question: MessageCircleQuestion, crash: Zap } as const;
const KIND_LABEL = { bug: 'Bug', idea: 'Idea', question: 'Question', crash: 'Crash' } as const;
const STATUS_BADGE = { new: 'submitted', seen: 'draft', done: 'approved' } as const;

function shortUA(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
  const browser = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
  return [os, browser].filter(Boolean).join(' · ');
}

export function AdminFeedbackPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const [params] = useSearchParams();
  const focusId = params.get('id');
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [meta, setMeta] = useState<{ recipients: string[]; emailEnabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusId);
  const [detail, setDetail] = useState<Record<string, FeedbackDetail>>({});
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch('/feedback');
      if (res.status === 403) {
        setError('Only the ShotLog platform admin can read feedback.');
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { feedback: FeedbackRow[]; recipients: string[]; emailEnabled: boolean };
      setRows(body.feedback);
      setMeta({ recipients: body.recipients, emailEnabled: body.emailEnabled });
    } catch {
      setError("Couldn't load feedback — check the connection and try again.");
      setRows((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (detail[id]) return;
      const res = await authedFetch(`/feedback/${id}`);
      if (res.ok) {
        const body = (await res.json()) as { feedback: FeedbackDetail };
        setDetail((d) => ({ ...d, [id]: body.feedback }));
      }
    },
    [detail],
  );

  useEffect(() => {
    if (openId) void loadDetail(openId);
  }, [openId, loadDetail]);

  const patch = async (id: string, data: { status?: FeedbackRow['status']; replyNote?: string | null }) => {
    const res = await authedFetch(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    if (!res.ok) {
      showToast("Couldn't save — are you online?");
      return;
    }
    const body = (await res.json()) as { feedback: FeedbackRow };
    setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...body.feedback } : r)));
  };

  const remove = async (id: string) => {
    const res = await authedFetch(`/feedback/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast("Couldn't delete — are you online?");
      return;
    }
    setRows((rs) => (rs ?? []).filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
  };

  const visible = (rows ?? []).filter((r) => filter === 'all' || r.status !== 'done');
  const counts = {
    new: (rows ?? []).filter((r) => r.status === 'new').length,
    seen: (rows ?? []).filter((r) => r.status === 'seen').length,
    done: (rows ?? []).filter((r) => r.status === 'done').length,
  };

  return (
    <div className="space-y-4" data-admin-feedback>
      <div className="flex items-start gap-2 flex-wrap">
        <p className="text-sm text-gray-500 flex-1 min-w-[200px]">
          What users sent from the ? menu, plus crash reports the app caught. Platform-level:
          only you see this.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={!online}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {meta && (
        <p className="text-xs text-gray-400">
          New reports email {meta.recipients.join(', ') || 'nobody'} —{' '}
          {meta.emailEnabled ? 'email is on.' : 'email is OFF on the server (no Resend key), so rows show "email off".'}
        </p>
      )}

      <div className="flex items-center gap-2 text-sm">
        <button
          className={cn('px-3 py-1.5 rounded-full border', filter === 'open' ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300')}
          onClick={() => setFilter('open')}
        >
          Open ({counts.new + counts.seen})
        </button>
        <button
          className={cn('px-3 py-1.5 rounded-full border', filter === 'all' ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300')}
          onClick={() => setFilter('all')}
        >
          All ({(rows ?? []).length})
        </button>
      </div>

      {error && <p className="text-sm text-red-700 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</p>}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {rows === null && <p className="p-3 text-sm text-gray-400">Loading…</p>}
        {rows !== null && visible.length === 0 && !error && (
          <p className="p-3 text-sm text-gray-400">
            {filter === 'open' ? 'Nothing open. ' : 'No feedback yet. '}
            Reports arrive here the moment a user sends one — even ones filed offline, once they reconnect.
          </p>
        )}
        {visible.map((r) => {
          const Icon = KIND_ICON[r.kind];
          const isOpen = openId === r.id;
          const d = detail[r.id];
          return (
            <div key={r.id} data-feedback-row={r.id} className={cn(isOpen && 'bg-gray-50')}>
              <button
                className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50"
                onClick={() => setOpenId(isOpen ? null : r.id)}
              >
                <span
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    r.kind === 'crash' ? 'bg-red-100 text-red-700' : r.kind === 'idea' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm whitespace-pre-wrap break-words', !isOpen && 'line-clamp-2', r.status === 'new' && 'font-medium')}>
                    {r.message}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {r.userName} · {r.role} · {r.route || '/'} · {new Date(r.receivedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {!r.online && ' · filed offline'}
                    {r.hasScreenshot && (
                      <>
                        {' · '}
                        <ImageIcon className="inline h-3 w-3 -mt-0.5" /> screenshot
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  <span className="text-[10px] text-gray-400">{KIND_LABEL[r.kind]}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3" data-feedback-detail>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-gray-400">From</dt>
                    <dd className="col-span-1 sm:col-span-2 text-gray-700 truncate">{r.userName} · {r.userEmail} · {r.companyName}</dd>
                    <dt className="text-gray-400">Build</dt>
                    <dd className="col-span-1 sm:col-span-2 text-gray-700 font-mono">{r.buildId || '—'}</dd>
                    <dt className="text-gray-400">Device</dt>
                    <dd className="col-span-1 sm:col-span-2 text-gray-700">{shortUA(r.userAgent)} · {r.viewport}{r.standalone ? ' · installed' : ' · browser tab'}</dd>
                    <dt className="text-gray-400">Email</dt>
                    <dd className="col-span-1 sm:col-span-2 text-gray-700">{r.notified === 'sent' ? 'sent' : r.notified === 'failed' ? 'FAILED' : 'email off'}</dd>
                  </dl>

                  {d?.screenshot && (
                    <a href={d.screenshot} target="_blank" rel="noreferrer" className="block">
                      <img src={d.screenshot} alt="Screenshot" className="max-h-72 rounded-lg border border-gray-200 bg-white" data-feedback-screenshot-img />
                    </a>
                  )}

                  {d && d.errorLog.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500">Errors on the device ({d.errorLog.length})</summary>
                      <div className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-900 text-gray-100 p-2 font-mono space-y-1">
                        {[...d.errorLog].reverse().map((e, i) => (
                          <div key={i}>
                            <span className="text-gray-400">{new Date(e.at).toLocaleTimeString()} {e.kind}</span> {e.msg}
                            {e.stack && <pre className="whitespace-pre-wrap text-[10px] text-gray-400">{e.stack}</pre>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {d && d.syncLogTail.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500">Connection log ({d.syncLogTail.length})</summary>
                      <div className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-100 p-2 font-mono text-gray-600 space-y-0.5">
                        {[...d.syncLogTail].reverse().map((e, i) => (
                          <p key={i}>{new Date(e.at).toLocaleTimeString()} {e.msg}</p>
                        ))}
                      </div>
                    </details>
                  )}

                  <div>
                    <label className="text-xs text-gray-500">Reply note (yours — the user does not see it yet)</label>
                    <Textarea
                      defaultValue={r.replyNote ?? ''}
                      className="min-h-[60px] text-sm"
                      placeholder="What you did about it, or what to ask them"
                      data-feedback-reply
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if ((r.replyNote ?? '') !== v) void patch(r.id, { replyNote: v || null });
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'seen' && r.status !== 'done' && (
                      <Button size="sm" variant="outline" onClick={() => void patch(r.id, { status: 'seen' })} data-feedback-seen>
                        Mark seen
                      </Button>
                    )}
                    {r.status !== 'done' && (
                      <Button size="sm" onClick={() => void patch(r.id, { status: 'done' })} data-feedback-done>
                        Mark done
                      </Button>
                    )}
                    {r.status === 'done' && (
                      <Button size="sm" variant="outline" onClick={() => void patch(r.id, { status: 'seen' })}>
                        Reopen
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto text-red-700" onClick={() => void remove(r.id)} data-feedback-delete>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
