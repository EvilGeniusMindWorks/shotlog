// The approvals queue — S21 (Matthew, Sep 16 2026): real columns — job,
// date, filed by, papers (5 · 1 sent back), waiting since — a Mine filter
// for what your role approves, Review opens the review screen, Print pack
// prints the day's papers in one go. Decisions still go through REST so the
// approver gets an immediate, truthful result (409 if a colleague beat them
// to it); a role without any approval right reads the queue and is told who
// approves (S9a).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Printer, Undo2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { whoCanWrite } from '@/lib/perms';
import { formatDate } from '@/lib/utils';
import { approvesAnything, canApprovePaper, fmtWhen, sentBackPapers, setDayStatus, type PaperKind } from '@/lib/approvals';
import { askText } from '@/components/ui/ask-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRecRows, type RecRow } from '@/components/records/recRows';
import { dayPapers, paperState } from './ApprovalReviewPage';

function waitingSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

export function AdminApprovalsPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canDay = canApprovePaper('blast_log');
  const anyApproval = approvesAnything();
  // Mine: the days with a paper waiting that MY role approves — on by default for a role
  // that approves some papers but not the day itself
  const [mine, setMine] = useState<boolean>(() => anyApproval && !canApprovePaper('blast_log'));
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
        [...days].sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)),
      ),
    ) ?? [];
  const recentApproved =
    useLiveQuery(() =>
      db.blastDays.filter((d) => d.status === 'approved').toArray().then((days) =>
        [...days].sort((a, b) => ((a.approvedAt ?? a.updatedAt) < (b.approvedAt ?? b.updatedAt) ? 1 : -1)).slice(0, 15),
      ),
    ) ?? [];
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const jobLabel = (jobId: string) => {
    const j = jobs.find((x) => x.id === jobId);
    return j ? `${j.jobNumber ? `${j.jobNumber} ` : ''}${j.name}` : 'Unknown job';
  };
  const rows = useRecRows('company');

  const queue = useMemo(() => {
    return submitted.map((day) => {
      const papers: RecRow[] = rows ? dayPapers(rows, day) : [];
      const states = papers.map((p) => ({ p, st: paperState(p, day) }));
      const waiting = states.filter((s) => s.st.tone === 'waiting');
      const mineWaiting = waiting.filter((s) => s.p.kind !== 'incident' && canApprovePaper(s.p.kind as PaperKind));
      const filedBy = papers.find((p) => p.kind === 'blast_log')?.person || papers.find((p) => p.kind === 'daily_report')?.person || '—';
      const sentBack = sentBackPapers(day).length;
      const notFiled = papers.filter((p) => (p.kind === 'time_card' && p.status === 'draft') || (p.kind === 'drill_log' && p.status === 'draft')).length;
      return { day, papers, waiting: waiting.length, mineWaiting: mineWaiting.length, filedBy, sentBack, notFiled, approved: states.filter((s) => s.st.tone === 'approved').length };
    }).filter((q) => !mine || q.mineWaiting > 0 || (canDay && q.sentBack === 0));
  }, [submitted, rows, mine, canDay]);

  const act = async (day: { id: string; jobId: string; date: string }, to: 'approved' | 'draft') => {
    let note: string | undefined;
    if (to === 'draft') {
      const answer = await askText({
        title: `Send ${jobLabel(day.jobId)} · ${formatDate(day.date)} back?`,
        label: 'What needs fixing — the blaster sees this on the day',
        placeholder: 'e.g. seismo distance missing',
        required: true,
        confirmLabel: 'Send back',
      });
      if (answer === null) return;
      note = answer;
    }
    setBusyId(day.id);
    setError(null);
    try {
      await setDayStatus(day.id, to, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
    } finally {
      setBusyId(null);
    }
  };

  const printPack = (dayId: string) => navigate(`/admin/approvals/${dayId}/print-pack`);

  return (
    <div className="space-y-5" data-approvals-queue>
      {error && <p className="text-sm text-violation">{error}</p>}
      {!anyApproval && (
        <p className="text-sm text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2" data-approvals-readonly>
          {whoCanWrite('blastDays', 'PATCH').replace(/^\w/, (c) => c.toUpperCase())} approve days and send them back — the matrix in Admin › Company › Approvals says who. You can read the queue, open a day, and download or send its PDF.
        </p>
      )}

      <section>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex-1">
            Waiting for review ({queue.length}{mine && submitted.length !== queue.length ? ` of ${submitted.length}` : ''})
          </h3>
          {anyApproval && (
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
              <button className={mine ? 'px-2.5 py-1.5 bg-navy text-white' : 'px-2.5 py-1.5 bg-white text-gray-600'} onClick={() => setMine(true)} data-approvals-mine="on">Mine</button>
              <button className={!mine ? 'px-2.5 py-1.5 bg-navy text-white' : 'px-2.5 py-1.5 bg-white text-gray-600'} onClick={() => setMine(false)} data-approvals-mine="off">All</button>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_110px_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_auto] gap-2 px-3 py-2 border-b border-gray-100 text-[10px] uppercase tracking-wider font-bold text-gray-400">
            <span>Job</span><span>Date</span><span>Filed by</span><span>Papers</span><span>Waiting</span><span />
          </div>
          {queue.map(({ day, papers, waiting, filedBy, sentBack, notFiled, approved }) => (
            <div
              key={day.id}
              id={`approval-${day.id}`}
              className={`px-3 py-2.5 border-b border-gray-50 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_110px_minmax(0,1.2fr)_minmax(0,1.4fr)_90px_auto] gap-x-2 gap-y-1 items-center ${focusDay === day.id ? 'ring-2 ring-inset ring-safety-orange' : ''}`}
              data-approval-row={day.id}
            >
              <Link to={`/admin/approvals/${day.id}`} className="font-medium text-sm hover:underline truncate">{jobLabel(day.jobId)}</Link>
              <span className="text-xs text-gray-600">{formatDate(day.date)}</span>
              <span className="text-xs text-gray-600 truncate">{filedBy}</span>
              <span className="text-xs text-gray-600" data-approval-papers={papers.length}>
                {papers.length} · {sentBack ? <span className="text-red-700">{sentBack} sent back</span> : notFiled ? <span className="text-amber-700">{notFiled} not filed</span> : approved === papers.length && papers.length > 0 ? 'all approved' : waiting ? `${waiting} waiting` : 'all filed'}
                {(day.filedNotes?.length ?? 0) > 0 && <Badge variant="warning" className="ml-1" data-filed-notes={day.filedNotes!.length}>filed with {day.filedNotes!.length} note{day.filedNotes!.length > 1 ? 's' : ''}</Badge>}
              </span>
              <span className="text-xs text-gray-500" data-approval-waiting>{waitingSince(day.updatedAt)}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" onClick={() => navigate(`/admin/approvals/${day.id}`)} data-approval-review>Review</Button>
                <Button size="sm" variant="outline" onClick={() => printPack(day.id)} data-approval-print-pack title="Print pack">
                  <Printer className="h-4 w-4" />
                </Button>
                {canDay && (
                  <>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={!online || busyId === day.id || sentBack > 0}
                      data-tour="approve"
                      title={sentBack > 0 ? 'A paper is sent back — the day waits for it' : ''}
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
            </div>
          ))}
          {queue.length === 0 && (
            <p className="p-4 text-sm text-gray-400">{mine && submitted.length > 0 ? 'Nothing waiting on you — switch to All for the rest.' : 'Nothing waiting — all caught up.'}</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recently approved
        </h3>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {recentApproved.map((day) => (
            <div key={day.id} className="p-3 flex items-center gap-3" data-approved-row={day.id}>
              <div className="min-w-0 flex-1">
                <Link to={`/admin/approvals/${day.id}`} className="font-medium text-sm hover:underline">
                  {jobLabel(day.jobId)}
                </Link>
                <p className="text-xs text-gray-400">{formatDate(day.date)}{day.approvedByName ? ` · approved ${fmtWhen(day.approvedAt)} by ${day.approvedByName}` : ''}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => printPack(day.id)} title="Print pack"><Printer className="h-4 w-4" /></Button>
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
