// Accepting a drill log FILES it: renders the paper-form layout, stores the
// point-in-time PDF submission, then marks the log accepted. Un-accept +
// re-accept files the next version.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { fileSubmission, waitForPagesReady } from '@/lib/archive';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import { PrintDrillLogPage } from '@/pages/PrintDrillLogPage';
import { Button } from '@/components/ui/button';

export function SubmitDrillLogPage() {
  const { id: blastDayId, logId } = useParams<{ id: string; logId: string }>();
  const navigate = useNavigate();
  const log = useLiveQuery(() => (logId ? db.drillLogs.get(logId) : undefined), [logId]);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!log || ran.current) return;
    ran.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await waitForPagesReady();
        if (cancelled) return;
        const day = await db.blastDays.get(log.blastDayId);
        const job = await db.jobs.get(log.jobId);
        const shot = await db.shots.get(log.shotId);
        await fileSubmission({
          type: 'drill_log',
          sourceId: log.id,
          blastDayId: log.blastDayId,
          jobId: log.jobId,
          title: `Drill Log — ${day?.name || job?.name || ''} · Shot ${shot?.shotNumber ?? '?'} · ${log.drillerName}`,
          date: day?.date ?? log.createdAt.slice(0, 10),
          meta: { jobName: job?.name, driller: log.drillerName },
        });
        await db.drillLogs.update(log.id, {
          status: 'accepted',
          acceptedBy: getSessionUser()?.name ?? '',
          acceptedAt: nowISO(),
          updatedAt: nowISO(),
        });
        if (!cancelled) navigate(`/blast-day/${blastDayId}/drill-log/${log.id}`, { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'filing failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id]);

  return (
    <div>
      <PrintDrillLogPage />
      <div className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-3">
          {error ? (
            <>
              <p className="font-bold text-violation">Filing failed</p>
              <p className="text-sm text-gray-600">{error}</p>
              <Button
                variant="outline"
                onClick={() => navigate(`/blast-day/${blastDayId}/drill-log/${logId}`)}
              >
                Back — log not accepted
              </Button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 mx-auto rounded-full border-4 border-safety-orange border-t-transparent animate-spin" />
              <p className="font-bold">Accepting & filing to the office…</p>
              <p className="text-xs text-gray-400">
                The drill log PDF is archived exactly as it stands right now.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
