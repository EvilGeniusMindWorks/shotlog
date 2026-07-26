// Supervisor review queue: blast days waiting for approval, plus recent
// decisions. Data arrives via sync (live), decisions go through REST so
// the supervisor gets an immediate, truthful result (409 if a colleague
// beat them to it).
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch } from '@/lib/session';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AdminApprovalsPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const act = async (id: string, to: 'approved' | 'draft') => {
    setBusyId(id);
    setError(null);
    try {
      const res = await authedFetch(`/admin/blast-days/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ to }),
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

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Waiting for review ({submitted.length})
        </h3>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {submitted.map((day) => (
            <div key={day.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <Link to={`/blast-day/${day.id}`} className="font-medium text-sm hover:underline">
                  {jobName(day.jobId)}
                </Link>
                <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
              </div>
              <Badge variant="submitted">submitted</Badge>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!online || busyId === day.id}
                onClick={() => void act(day.id, 'approved')}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={!online || busyId === day.id}
                onClick={() => void act(day.id, 'draft')}>
                <Undo2 className="h-4 w-4 mr-1" /> Send Back
              </Button>
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
            <p className="p-4 text-sm text-gray-400">No approvals yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
