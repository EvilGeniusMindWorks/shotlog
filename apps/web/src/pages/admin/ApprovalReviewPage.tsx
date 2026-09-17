// S21 — the review screen (Matthew, Sep 16 2026: "a place to review the whole
// day's documents and attachments, approve or reject with notes back to the
// people involved, and a quick print"): one day — the papers down the left,
// the selected paper's PDF and its attachments on the right, the filer's
// notes, the day's crew and rigs. On each paper: Approve or Send back with a
// note; Approve the day when all pass. A send-back reopens that paper for
// its filer and puts the note on their home, the way a sent-back drill log
// does. Only an approver sends back (decision fb4-14-reopen).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { CheckCircle2, Printer, Undo2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';
import { DOC_KIND_LABEL } from '@/lib/docRows';
import { canApprovePaper, fmtWhen, paperKey, sentBackPapers, setDayStatus, reviewPaper, type PaperKind } from '@/lib/approvals';
import { workedRow } from '@/lib/personHistory';
import { askText } from '@/components/ui/ask-sheet';
import { Button } from '@/components/ui/button';
import { RecordPreview } from '@/components/records/RecordPreview';
import { BinderExport } from '@/components/records/BinderExport';
import { useRecRows, type RecRow } from '@/components/records/recRows';
import { ScreenHeader } from '@/components/layout/ScreenHeader';

const REVIEW_KINDS: PaperKind[] = ['blast_log', 'daily_report', 'drill_log', 'drill_checklist', 'time_card', 'incident'];

/** The rows of Records that are this day's papers */
export function dayPapers(rows: RecRow[], day: { id: string; jobId: string; date: string }): RecRow[] {
  const order = new Map(REVIEW_KINDS.map((k, i) => [k, i]));
  return rows
    .filter((r) => order.has(r.kind as PaperKind) && (r.dayId === day.id || (r.jobId === day.jobId && r.date === day.date && (r.kind === 'time_card' || r.kind === 'drill_checklist' || r.kind === 'drill_log'))))
    .sort((a, b) => (order.get(a.kind as PaperKind) ?? 9) - (order.get(b.kind as PaperKind) ?? 9) || a.title.localeCompare(b.title));
}

export function rowRecordId(r: RecRow): string {
  return r.key.replace(/^[a-z]+-/, '');
}

export function rowPaperKey(r: RecRow): string {
  return paperKey(r.kind as PaperKind, rowRecordId(r));
}

/** What the office sees on a paper's line: the decision if one exists, else where the paper stands */
export function paperState(r: RecRow, day: { paperReviews?: Record<string, { status: string; byName: string; at: string; note?: string }> ; status: string }): { label: string; tone: 'waiting' | 'approved' | 'sent_back' | 'info' } {
  const review = day.paperReviews?.[rowPaperKey(r)];
  if (review) {
    // a paper refiled after its send-back is waiting again
    const refiled = review.status === 'sent_back' && r.filed && r.filed.createdAt > review.at;
    if (refiled) return { label: `refiled ${fmtWhen(r.filed!.createdAt)} · waiting`, tone: 'waiting' };
    if (review.status === 'sent_back' && r.kind === 'time_card' && r.status === 'submitted') return { label: 'refiled · waiting', tone: 'waiting' };
    if (review.status === 'sent_back' && r.kind === 'drill_log' && (r.status === 'submitted' || r.status === 'approved')) return { label: 'signed complete again · waiting', tone: 'waiting' };
    return review.status === 'approved'
      ? { label: `approved by ${review.byName} · ${fmtWhen(review.at)}`, tone: 'approved' }
      : { label: `sent back by ${review.byName}: “${review.note ?? ''}”`, tone: 'sent_back' };
  }
  if (day.status === 'approved' && (r.kind === 'blast_log' || r.kind === 'daily_report')) return { label: 'approved with the day', tone: 'approved' };
  switch (r.kind) {
    case 'drill_log':
      return r.status === 'approved' ? { label: 'accepted by the blaster · waiting for the office', tone: 'waiting' } : r.status === 'submitted' ? { label: 'signed complete · not accepted yet', tone: 'info' } : r.status === 'filed' ? { label: 'filed · waiting', tone: 'waiting' } : { label: 'open with the driller', tone: 'info' };
    case 'time_card':
      return r.status === 'approved' ? { label: `approved${r.facts.approvedBy ? ` by ${r.facts.approvedBy}` : ''}`, tone: 'approved' } : r.status === 'submitted' ? { label: 'filed · waiting', tone: 'waiting' } : { label: 'draft · not filed yet', tone: 'info' };
    case 'incident':
      return { label: `${r.statusLabel.toLowerCase()} · processed on the Incidents page`, tone: 'info' };
    default:
      return r.filed ? { label: 'filed · waiting', tone: 'waiting' } : { label: r.statusLabel.toLowerCase(), tone: 'info' };
  }
}

export function ApprovalReviewPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const { online } = useOutletContext<{ online: boolean }>();
  const navigate = useNavigate();
  const day = useLiveQuery(() => (dayId ? db.blastDays.get(dayId) : undefined), [dayId]);
  const job = useLiveQuery(() => (day?.jobId ? db.jobs.get(day.jobId) : undefined), [day?.jobId]);
  const settings = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const rows = useRecRows('company');
  const papers = useMemo(() => (rows && day ? dayPapers(rows, day) : []), [rows, day]);
  const crew = useLiveQuery(async () => {
    if (!dayId) return [];
    const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
    if (!report) return [];
    return (await db.workForceEntries.where('dailyReportId').equals(report.id).toArray()).filter(workedRow).map((w) => w.workerName);
  }, [dayId]) ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedKey && papers.length > 0) setSelectedKey(papers[0].key);
  }, [papers, selectedKey]);
  const selected = papers.find((p) => p.key === selectedKey) ?? papers[0];

  if (!dayId) return null;
  if (day === undefined || rows === undefined) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (day === null) return <div className="p-4 text-sm text-gray-500">This day is not on this device.</div>;

  const filedBy = papers.find((p) => p.kind === 'blast_log')?.person || papers.find((p) => p.kind === 'daily_report')?.person || '—';
  const rigs = [...new Set(papers.flatMap((p) => p.facts.rigs ?? (p.facts.rig ? [p.facts.rig] : [])))];
  const sentBack = sentBackPapers(day);
  const waiting = papers.filter((p) => paperState(p, day).tone === 'waiting');
  const approvedCount = papers.filter((p) => paperState(p, day).tone === 'approved').length;
  const dayAsOne = settings?.approvalsDayAsOne !== false;
  const canDay = canApprovePaper('blast_log');
  const dayApprovable = day.status === 'submitted' && canDay && sentBack.length === 0 && (dayAsOne || waiting.length === 0);
  const jobLabel = `${job?.jobNumber ? `${job.jobNumber} ` : ''}${job?.name ?? 'the job'}`;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
    } finally {
      setBusy(null);
    }
  };
  const decide = async (r: RecRow, to: 'approved' | 'sent_back') => {
    const kind = r.kind as PaperKind;
    const label = `${DOC_KIND_LABEL[r.kind]}${r.head ? ` · ${r.head}` : ''}`;
    let note: string | undefined;
    if (to === 'sent_back') {
      const who = r.kind === 'time_card' ? `${r.head ?? 'the person'} and ${filedBy}` : r.kind === 'drill_log' || r.kind === 'drill_checklist' ? `${r.person || 'the driller'} and ${filedBy}` : filedBy;
      const answer = await askText({
        title: `Send back · ${label}`,
        label: `Note to ${who}`,
        placeholder: 'e.g. IN at 7:00 but the crew list has you arriving at 8:15 — which is it?',
        required: true,
        confirmLabel: 'Send back with the note',
      });
      if (answer === null) return;
      note = answer;
    }
    await run(r.key, async () => {
      if (kind === 'blast_log' || kind === 'daily_report') {
        // the day's own papers: a send-back reopens the day (the note rides to the blaster's home); an approval is recorded on the paper
        if (to === 'sent_back') await setDayStatus(dayId, 'draft', `${DOC_KIND_LABEL[r.kind]}: ${note}`);
        else await reviewPaper({ dayId, kind, to, label });
      } else {
        await reviewPaper({ dayId, kind, recordId: rowRecordId(r), to, note, label });
      }
    });
  };

  const tone = (t: 'waiting' | 'approved' | 'sent_back' | 'info') =>
    t === 'approved' ? 'text-green-700' : t === 'sent_back' ? 'text-red-700' : t === 'waiting' ? 'text-amber-700' : 'text-gray-500';

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[100dvh]" data-approval-review={dayId}>
      <ScreenHeader
        parent={{ to: '/admin/approvals', label: 'Approvals' }}
        title={`Review · ${jobLabel} · ${formatDate(day.date)}`}
        subtitle={`filed by ${filedBy}${crew.length ? ` · crew: ${crew.join(', ')}` : ''}${rigs.length ? ` · rigs: ${rigs.join(', ')}` : ''}`}
        maxWidth="max-w-none"
      />
      {error && <p className="px-4 pt-2 text-sm text-violation" data-review-error>{error}</p>}
      {day.status === 'approved' && (
        <p className="mx-4 mt-2 text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2" data-review-approved>
          Approved {fmtWhen(day.approvedAt)}{day.approvedByName ? ` by ${day.approvedByName}` : ''} · {approvedCount} of {papers.length} papers marked, the rest approved with the day
        </p>
      )}
      {day.status === 'draft' && day.sendBackNote && (
        <p className="mx-4 mt-2 text-sm text-amber-900 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2" data-review-day-sent-back>
          Sent back {fmtWhen(day.sendBackAt)}{day.sendBackBy ? ` by ${day.sendBackBy}` : ''}: “{day.sendBackNote}” — waiting on the field to file again
        </p>
      )}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(300px,2fr)_3fr] gap-3 p-3">
        {/* the papers */}
        <div className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100" data-review-papers>
          {papers.map((r) => {
            const st = paperState(r, day);
            const kind = r.kind as PaperKind;
            const mayDecide = kind !== 'incident' && canApprovePaper(kind) && online && day.status !== 'approved';
            const isSel = selected?.key === r.key;
            return (
              <div key={r.key} className={`p-3 ${isSel ? 'bg-orange-50' : ''}`} data-review-paper={rowPaperKey(r)} data-review-state={st.tone}>
                <button className="w-full text-left" onClick={() => setSelectedKey(r.key)}>
                  <p className="text-sm font-medium">{DOC_KIND_LABEL[r.kind]}{r.head ? <span className="text-gray-500 font-normal"> · {r.head}</span> : null}</p>
                  <p className="text-xs text-gray-500">{r.particulars}{r.person && r.kind !== 'time_card' ? ` · ${r.person}` : ''}</p>
                  <p className={`text-xs ${tone(st.tone)}`} data-review-paper-state>{st.label}</p>
                </button>
                {mayDecide && (
                  <div className="flex gap-2 mt-2">
                    {st.tone !== 'approved' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={busy === r.key} onClick={() => void decide(r, 'approved')} data-review-approve={rowPaperKey(r)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                    )}
                    {st.tone !== 'sent_back' && (
                      <Button size="sm" variant="secondary" disabled={busy === r.key} onClick={() => void decide(r, 'sent_back')} data-review-send-back={rowPaperKey(r)}>
                        <Undo2 className="h-4 w-4 mr-1" /> Send back…
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {papers.length === 0 && <p className="p-4 text-sm text-gray-400">No papers on this day yet.</p>}
        </div>
        {/* the paper */}
        <div className="min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white hidden lg:block" data-review-preview>
          {selected ? <RecordPreview row={selected} /> : <p className="p-4 text-sm text-gray-400">Tap a paper to read it here.</p>}
        </div>
      </div>
      {/* the day */}
      <div className="border-t border-gray-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap" data-review-bar>
        <p className="text-xs text-gray-500 flex-1 min-w-[160px]">
          {papers.length} paper{papers.length === 1 ? '' : 's'} · {approvedCount} approved · {waiting.length} waiting{sentBack.length ? ` · ${sentBack.length} sent back` : ''}
        </p>
        {day.status === 'submitted' && canDay && (
          <>
            <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={!dayApprovable || !online || busy === 'day'} onClick={() => void run('day', () => setDayStatus(dayId, 'approved'))} data-review-approve-day title={sentBack.length ? 'A paper is sent back — the day waits for it' : !dayAsOne && waiting.length ? 'Paper by paper: approve each paper first' : ''}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve the day{sentBack.length ? ` · ${sentBack.length} sent back` : waiting.length ? ` · ${waiting.length} still waiting` : ''}
            </Button>
            <Button variant="secondary" disabled={!online || busy === 'day'} data-review-send-back-day onClick={() => void (async () => {
              const answer = await askText({ title: `Send ${jobLabel} · ${formatDate(day.date)} back?`, label: 'What needs fixing — the blaster sees this on the day', placeholder: 'e.g. seismo distance missing', required: true, confirmLabel: 'Send back' });
              if (answer === null) return;
              await run('day', () => setDayStatus(dayId, 'draft', answer));
            })()}>
              <Undo2 className="h-4 w-4 mr-1" /> Send the day back…
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => navigate(`/admin/approvals/${dayId}/print-pack`)} data-review-print-pack>
          <Printer className="h-4 w-4 mr-1" /> Print pack
        </Button>
        <BinderExport scope={{ jobId: day.jobId, date: day.date, label: `${jobLabel} · ${formatDate(day.date)}` }} />
      </div>
    </div>
  );
}

export { REVIEW_KINDS };
