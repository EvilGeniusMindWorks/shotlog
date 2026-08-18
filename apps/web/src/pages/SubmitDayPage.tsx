// "Submit to Office": builds the searchable PDFs in sequence (blast log
// → daily report), files each as a point-in-time submission with frozen
// attachment copies, then marks the day submitted (locks it for field roles).
// Fully offline — the PDFs are generated on-device and ride sync.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/db';
import { getJobView } from '@/lib/jobContext';
import { isBlastingWork } from '@/db/schema';
import { collectDayAttachments, fileSubmission } from '@/lib/archive';
import { nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Phase = 'init' | 'blast_log' | 'daily_report';

export function SubmitDayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('init');
  const [hasLog, setHasLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filed = useRef(new Set<Phase>());

  // Decide the first phase from DIRECT reads with a retry loop: right after
  // a page load the local store can answer queries before hydration is done,
  // and a premature "no blast log" would silently skip the blast-log filing.
  useEffect(() => {
    if (phase !== 'init' || !id) return;
    let cancelled = false;
    void (async () => {
      const deadline = Date.now() + 12000;
      let day = await db.blastDays.get(id);
      while (!day && Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 300));
        day = await db.blastDays.get(id);
      }
      if (cancelled) return;
      if (!day) {
        setError('work day not found on this device yet — try again in a moment');
        return;
      }
      let log = await db.blastLogs.where('blastDayId').equals(id).first();
      if (!log && isBlastingWork(day.typeOfWork)) {
        // a blasting day SHOULD have a log — give hydration a moment more
        const settle = Date.now() + 5000;
        while (!log && Date.now() < settle && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
          log = await db.blastLogs.where('blastDayId').equals(id).first();
        }
      }
      if (cancelled) return;
      setHasLog(Boolean(log));
      setPhase(log ? 'blast_log' : 'daily_report');
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  // File the currently rendered document, then advance
  useEffect(() => {
    if (phase === 'init' || !id || filed.current.has(phase)) return;
    let cancelled = false;
    void (async () => {
      try {
        const { buildBlastLogPdf, buildDailyReportPdf } = await import('@/pdfdocs');
        if (cancelled) return;
        filed.current.add(phase);
        const day = (await db.blastDays.get(id))!;
        const job = await getJobView(day.jobId);
        const label = day.name || job?.name || day.date;
        if (phase === 'blast_log') {
          const log = await db.blastLogs.where('blastDayId').equals(id).first();
          if (log) {
            await fileSubmission({
              type: 'blast_log',
              sourceId: log.id,
              blastDayId: day.id,
              jobId: day.jobId,
              title: `Blast Log — ${label}`,
              date: day.date,
              pdf: await buildBlastLogPdf(day.id),
              attachments: await collectDayAttachments(day.id),
              meta: { jobName: job?.name },
            });
          }
          if (!cancelled) setPhase('daily_report');
          return;
        }
        const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
        await fileSubmission({
          type: 'daily_report',
          sourceId: report?.id ?? day.id,
          blastDayId: day.id,
          jobId: day.jobId,
          title: `Daily Report — ${label}`,
          date: day.date,
          pdf: await buildDailyReportPdf(day.id),
          // attachments ride the blast-log copy when one exists
          attachments: hasLog ? [] : await collectDayAttachments(day.id),
          meta: { jobName: job?.name },
        });
        // Resubmitting answers the office's send-back — clear the reason
        await db.blastDays.update(day.id, {
          status: 'submitted',
          sendBackNote: undefined,
          updatedAt: nowISO(),
        });
        if (!cancelled) navigate(`/blast-day/${day.id}`, { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'filing failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, id]);

  const step = phase === 'daily_report' && hasLog ? 2 : 1;
  const total = hasLog ? 2 : 1;

  return (
    <div>
      <div className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-3">
          {error ? (
            <>
              <p className="font-bold text-violation">Filing failed</p>
              <p className="text-sm text-gray-600">{error}</p>
              <Button variant="outline" onClick={() => navigate(`/blast-day/${id}`)}>
                Back — nothing was submitted
              </Button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 mx-auto rounded-full border-4 border-safety-orange border-t-transparent animate-spin" />
              <p className="font-bold">Filing to the office…</p>
              <p className="text-sm text-gray-500">
                {phase === 'daily_report' ? 'Daily Report' : 'Blasting Log'} · document {step} of{' '}
                {total}
              </p>
              <p className="text-xs text-gray-400">
                Generating the point-in-time PDF and freezing attachments. This copy never
                changes — fixes later become version 2.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
