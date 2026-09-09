// Supervisor review queue: blast days waiting for approval, plus recent
// decisions. Data arrives via sync (live), decisions go through REST so
// the supervisor gets an immediate, truthful result (409 if a colleague
// beat them to it).
//
// S9a (2026-09-09): gated like the office home — a role without
// `approve_days` reads the queue and is told who approves; Send Back asks
// for the reason on the app's own sheet (it was a native prompt()).
import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch } from '@/lib/session';
import { hasCap, whoCanWrite } from '@/lib/perms';
import { formatDate } from '@/lib/utils';
import { askText } from '@/components/ui/ask-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AdminApprovalsPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canApprove = hasCap('approve_days');
  // Deep link from the office queue ("Review"): highlight + scroll to the day
  const [params] = useSearchParams();
  const focusDay = params.get('day');
  useEffect(() => {
    if (!focusDay) return;
    const t = window.setTimeout(
      () => document.getElementById(`approval-${focusDay}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      400,
    );
    return () => window.clearTimeout(t);
  }, [focusDay]);

  const submitted =
    useLiveQuery(() =>
      db.blastDays.filter((d) => d.status === 'submitted').toArray().then((days) =>
        [...days].sort((a, b) => (a.date < b.date ? 1 : -1)),
      ),
    ) ?? [];
  const recentApproved =
    useLiveQuery(() =>
      db.blastDays.filter((d) => d.status === 'approved').toArray().then((days) =>
        [...days].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15),
      ),
    ) ?? [];
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const jobName = (jobId: string) => jobs.find((j) => j.id === jobId)?.name ?? 'Unknown job';

  const act = async (day: { id: string; jobId: string; date: string }, to: 'approved' | 'draft') => {
    // The reason rides to the blaster's home strip and the day's banner — required
    let note: string | undefined;
    if (to === 'draft') {
      const answer = await askText({
        title: `Send ${jobName(day.jobId)} · ${formatDate(day.date)} back?`,
        label: 'What needs fixing — the blaster sees this on the day',
        placeholder: 'e.g. seismo distance missing',
        required: true,
        confirmLabel: 'Send back',
      });
      if (answer === null) return; // cancelled
      note = answer;
    }
    setBusyId(day.id);
    setError(null);
    try {
      const res = await authedFetch(`/admin/blast-days/${day.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ to, note }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'action failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-violation">{error}</p>}
      {!canApprove && (
        <p className="text-sm text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2" data-approvals-readonly>
          {whoCanWrite('blastDays', 'PATCH').replace(/^\w/, (c) => c.toUpperCase())} approve days and send them back. You can read the queue, open a day, and download or send its PDF.
        </p>
      )}

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Waiting for review ({submitted.length})
        </h3>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {submitted.map((day) => (
            <div
              key={day.id}
              id={`approval-${day.id}`}
              className={`p-3 flex items-center gap-3 flex-wrap ${focusDay === day.id ? 'ring-2 ring-inset ring-safety-orange rounded-lg' : ''}`}
              data-approval-row={day.id}
            >
              <div className="min-w-0 flex-1">
                <Link to={`/blast-day/${day.id}`} className="font-medium text-sm hover:underline">
                  {jobName(day.jobId)}
                </Link>
                <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
              </div>
              <Badge variant="submitted">submitted</Badge>
              {(day.filedNotes?.length ?? 0) > 0 && (
                <Badge variant="warning" data-filed-notes={day.filedNotes!.length}>
                  filed with {day.filedNotes!.length} note{day.filedNotes!.length > 1 ? 's' : ''}
                </Badge>
              )}
              {canApprove && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={!online || busyId === day.id}
                    data-tour="approve"
                    onClick={() => void act(day, 'approved')}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!online || busyId === day.id}
                    data-tour="send-back"
                    onClick={() => void act(day, 'draft')}>
                    <Undo2 className="h-4 w-4 mr-1" /> Send Back
                  </Button>
                </>
              )}
            </div>
          ))}
          {submitted.length === 0 && (
            <p className="p-4 text-sm text-gray-400">Nothing waiting — all caught up.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recently approved
        </h3>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {recentApproved.map((day) => (
            <div key={day.id} className="p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/blast-day/${day.id}`} className="font-medium text-sm hover:underline">
                  {jobName(day.jobId)}
                </Link>
                <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
              </div>
              <Badge variant="approved">approved</Badge>
            </div>
          ))}
          {recentApproved.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No approvals yet — days the crews file appear above for review.</p>
          )}
        </div>
      </section>
    </div>
  );
}
