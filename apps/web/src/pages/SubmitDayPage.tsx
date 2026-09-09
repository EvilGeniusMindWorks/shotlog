// "Submit to Office": a pre-flight first (Round S9a, 2026-09-09 — both
// evaluation blasters filed with the shot unsigned and nothing stopped them),
// then the searchable PDFs in sequence (blast log → daily report), each filed
// as a point-in-time submission with frozen attachment copies, then the day
// marked submitted (locked for field roles). Fully offline — the PDFs are
// generated on-device and ride sync.
//
// Pre-flight rules: RED blocks — a shot without its responsible blaster's
// signature. AMBER files with a note the office sees — no structure distance
// while seismo readings exist, no crew on the daily report, a blasting day
// with no explosives. Everything else is a green tick.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, OctagonX } from 'lucide-react';
import { db } from '@/db';
import { getJobView } from '@/lib/jobContext';
import { isBlastingWork } from '@/db/schema';
import { collectDayAttachments, fileSubmission } from '@/lib/archive';
import { nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Phase = 'init' | 'preflight' | 'blast_log' | 'daily_report';

export interface PreflightItem {
  key: string;
  level: 'red' | 'amber' | 'ok';
  text: string;
  /** where to fix it */
  to?: string;
  toLabel?: string;
}

/** The checks, as a plain function so the harness and the day spine can share them */
export async function preflightDay(dayId: string): Promise<PreflightItem[]> {
  const day = await db.blastDays.get(dayId);
  if (!day) return [];
  const items: PreflightItem[] = [];
  const blasting = isBlastingWork(day.typeOfWork);
  const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
  const shots = log ? (await db.shots.where('blastLogId').equals(log.id).toArray()).sort((a, b) => a.shotNumber - b.shotNumber) : [];

  // RED — signatures
  for (const s of shots) {
    if (!s.signatureImage) {
      items.push({
        key: `sig-${s.id}`,
        level: 'red',
        text: `Shot ${s.shotNumber} has no blaster signature`,
        to: `/blast-day/${dayId}?view=blast-log`,
        toLabel: 'Sign it',
      });
    }
  }
  if (shots.length > 0 && shots.every((s) => s.signatureImage)) items.push({ key: 'sig-ok', level: 'ok', text: `${shots.length === 1 ? 'Shot signed' : `All ${shots.length} shots signed`}` });

  // AMBER — seismo distance
  if (blasting && shots.length > 0) {
    const readings = await db.seismoReadings.filter((r) => shots.some((s) => s.id === r.shotId)).toArray();
    const noDistance = shots.filter((s) => readings.some((r) => r.shotId === s.id) && !(s.designPlan?.closestStructureDistance > 0));
    for (const s of noDistance) {
      items.push({
        key: `dist-${s.id}`,
        level: 'amber',
        text: `Seismo reading on shot ${s.shotNumber} has no structure distance`,
        to: `/blast-day/${dayId}/design/${s.id}`,
        toLabel: 'Design plan › Compliance',
      });
    }
    if (readings.length > 0 && noDistance.length === 0) items.push({ key: 'dist-ok', level: 'ok', text: 'Seismo readings have a structure distance' });
  }

  // AMBER — explosives
  if (blasting && log) {
    const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
    const lbs = usage?.totalPoundsShot ?? 0;
    if (!(lbs > 0)) items.push({ key: 'expl', level: 'amber', text: 'No explosives entered on the blasting log', to: `/blast-day/${dayId}?view=blast-log`, toLabel: 'Explosives' });
    else items.push({ key: 'expl-ok', level: 'ok', text: `Explosives entered · ${lbs.toLocaleString()} lbs` });
  }

  // AMBER — crew
  const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
  if (report) {
    const rows = await db.workForceEntries.where('dailyReportId').equals(report.id).toArray();
    const worked = rows.filter((r) => r.timeIn || r.timeOut || (r.straightTime ?? 0) > 0);
    if (worked.length === 0) items.push({ key: 'crew', level: 'amber', text: 'No crew on the daily report', to: `/blast-day/${dayId}?view=daily-report`, toLabel: 'Daily report' });
    else items.push({ key: 'crew-ok', level: 'ok', text: `Crew on the daily report · ${worked.length}` });
  }

  // GREEN — drilling accepted (informational)
  const logs = await db.drillLogs.filter((l) => l.blastDayId === dayId).toArray();
  if (logs.length > 0) {
    const accepted = logs.filter((l) => l.status === 'accepted').length;
    items.push({ key: 'drill', level: accepted === logs.length ? 'ok' : 'amber', text: accepted === logs.length ? `Drill log${logs.length > 1 ? 's' : ''} accepted` : `${logs.length - accepted} drill log${logs.length - accepted > 1 ? 's' : ''} not accepted yet`, to: accepted === logs.length ? undefined : `/blast-day/${dayId}?view=blast-log`, toLabel: 'Review drilling' });
  }
  return items;
}

export function SubmitDayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('init');
  const [hasLog, setHasLog] = useState(false);
  const [checks, setChecks] = useState<PreflightItem[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filed = useRef(new Set<Phase>());

  // Decide from DIRECT reads with a retry loop: right after a page load the
  // local store can answer queries before hydration is done, and a premature
  // "no blast log" would silently skip the blast-log filing.
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
        const settle = Date.now() + 5000;
        while (!log && Date.now() < settle && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
          log = await db.blastLogs.where('blastDayId').equals(id).first();
        }
      }
      if (cancelled) return;
      setHasLog(Boolean(log));
      setChecks(await preflightDay(id));
      setPhase('preflight');
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  // File the currently rendered document, then advance
  useEffect(() => {
    if (phase === 'init' || phase === 'preflight' || !id || filed.current.has(phase)) return;
    let cancelled = false;
    void (async () => {
      try {
        const { buildBlastLogPdf, buildDailyReportPdf } = await import('@/pdfdocs');
        if (cancelled) return;
        filed.current.add(phase);
        const day = (await db.blastDays.get(id))!;
        const job = await getJobView(day.jobId);
        const label = day.name || job?.name || day.date;
        const notes = (checks ?? []).filter((c) => c.level === 'amber').map((c) => c.text);
        if (phase === 'blast_log') {
          const log = await db.blastLogs.where('blastDayId').equals(id).first();
          if (log) {
            await fileSubmission({
              type: 'blast_log',
              sourceId: log.id,
              blastDayId: day.id,
              jobId: day.jobId,
              title: `Blasting Log — ${label}`,
              date: day.date,
              pdf: await buildBlastLogPdf(day.id),
              attachments: await collectDayAttachments(day.id),
              meta: { jobName: job?.name, filedWithNotes: notes },
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
          meta: { jobName: job?.name, filedWithNotes: notes },
        });
        // Resubmitting answers the office's send-back — clear the reason;
        // the amber notes travel with the day so the queue can say "filed with 2 notes"
        await db.blastDays.update(day.id, {
          status: 'submitted',
          sendBackNote: undefined,
          filedNotes: notes,
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
  const reds = (checks ?? []).filter((c) => c.level === 'red');
  const ambers = (checks ?? []).filter((c) => c.level === 'amber');

  const startFiling = () => {
    if (reds.length > 0) return;
    if (ambers.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setPhase(hasLog ? 'blast_log' : 'daily_report');
  };

  return (
    <div>
      <div className="fixed inset-0 z-[60] bg-navy/90 flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 pb-[max(1.5rem,var(--sab))] max-w-md w-full space-y-3" data-submit-sheet>
          {error ? (
            <>
              <p className="font-bold text-violation">Filing failed</p>
              <p className="text-sm text-gray-600">{error}</p>
              <Button variant="outline" onClick={() => navigate(`/blast-day/${id}`)}>
                Back — nothing was submitted
              </Button>
            </>
          ) : phase === 'preflight' && checks ? (
            <>
              <p className="font-bold text-lg">Before this day is filed</p>
              <ul className="space-y-1.5 text-sm" data-preflight>
                {[...reds, ...ambers, ...checks.filter((c) => c.level === 'ok')].map((c) => (
                  <li key={c.key} className="flex items-start gap-2" data-preflight-item={c.key} data-preflight-level={c.level}>
                    {c.level === 'red' ? (
                      <OctagonX className="h-4 w-4 mt-0.5 text-violation shrink-0" />
                    ) : c.level === 'amber' ? (
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                    )}
                    <span className={c.level === 'red' ? 'text-violation font-medium' : c.level === 'amber' ? 'text-amber-800' : 'text-gray-600'}>
                      {c.text}
                    </span>
                    {c.to && c.level !== 'ok' && (
                      <button
                        className="ml-auto shrink-0 inline-flex items-center text-xs text-navy underline"
                        onClick={() => navigate(c.to!)}
                        data-preflight-go={c.key}
                      >
                        {c.toLabel ?? 'Fix'} <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
                {checks.length === 0 && <li className="text-gray-500">Nothing to check on this day.</li>}
              </ul>
              <p className="text-xs text-gray-500">
                {reds.length > 0
                  ? 'Red items must be fixed before filing.'
                  : ambers.length > 0
                    ? `Amber items file with a note the office sees (${ambers.length}).`
                    : 'Everything the office needs is here.'}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => navigate(`/blast-day/${id}`)} data-preflight-back>
                  Back
                </Button>
                <Button onClick={startFiling} disabled={reds.length > 0} data-preflight-file>
                  {reds.length > 0
                    ? 'Fix the red items first'
                    : ambers.length > 0
                      ? confirming
                        ? `Yes, file with ${ambers.length} note${ambers.length > 1 ? 's' : ''}`
                        : 'File anyway'
                      : 'File this day'}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-3">
              <div className="h-10 w-10 mx-auto rounded-full border-4 border-safety-orange border-t-transparent animate-spin" />
              <p className="font-bold">{phase === 'init' ? 'Checking the day…' : 'Filing to the office…'}</p>
              {phase !== 'init' && (
                <p className="text-sm text-gray-500">
                  {phase === 'daily_report' ? 'Daily Report' : 'Blasting Log'} · document {step} of {total}
                </p>
              )}
              <p className="text-xs text-gray-400">
                Generating the point-in-time PDF and freezing attachments. This copy never changes — fixes later become version 2.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
