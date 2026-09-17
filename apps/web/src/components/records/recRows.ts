// The Records list's rows: one per live document joined with its filed
// office copies (latest + the older chain). Shared by the manager, the
// preview drawer and the preview window (S21).
import { useMemo } from 'react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { buildDocRows, type DocFacts, type DocKind, type DocRow } from '@/lib/docRows';
import { useSubmissionSummaries, type SubmissionSummary } from '@/lib/archive';

export type RecStatus = 'filed' | 'approved' | 'submitted' | 'draft' | 'sent_back' | 'open' | 'closed';

export interface RecRow {
  key: string;
  kind: DocKind;
  date: string;
  title: string;
  /** Short head after the kind on the first line ("Shot 1", "R1021") */
  head?: string;
  sub: string;
  /** S21: the grey second line ("Shots 1–2 · 597.8 lbs · 88 holes") */
  particulars: string;
  facts: DocFacts;
  jobId?: string;
  jobName: string;
  jobNumber?: string;
  customerId?: string;
  customerName?: string;
  siteId?: string;
  dayId?: string;
  person: string;
  status: RecStatus;
  statusLabel: string;
  statusVariant: 'draft' | 'submitted' | 'approved' | 'violation';
  /** Live record route (undefined when the source no longer exists) */
  to?: string;
  /** Latest filed copy + the older chain */
  filed?: SubmissionSummary;
  versions: SubmissionSummary[];
}

export const STATUS_LABEL: Record<RecStatus, string> = {
  filed: 'Filed',
  approved: 'Approved, not filed',
  submitted: 'Submitted',
  draft: 'Draft',
  sent_back: 'Sent back',
  open: 'Open',
  closed: 'Closed',
};

export const SUB_TYPE_TO_KIND: Record<string, DocKind> = {
  blast_log: 'blast_log',
  daily_report: 'daily_report',
  drill_log: 'drill_log',
  drill_checklist: 'drill_checklist',
  incident: 'incident',
};

export function statusOf(doc: DocRow, filed: SubmissionSummary | undefined): { status: RecStatus; label: string; variant: RecRow['statusVariant'] } {
  if (doc.kind === 'time_card') {
    if (doc.status === 'approved') return { status: 'approved', label: 'Approved', variant: 'approved' };
    if (doc.status === 'filed') return { status: 'submitted', label: 'Filed, awaiting approval', variant: 'submitted' };
    return { status: 'draft', label: 'Draft', variant: 'draft' };
  }
  if (doc.kind === 'repair_ticket') {
    return doc.status === 'resolved'
      ? { status: 'closed', label: 'Resolved', variant: 'approved' }
      : { status: 'open', label: 'Open', variant: 'draft' };
  }
  if (doc.kind === 'service' || doc.kind === 'hour_correction') {
    return { status: 'closed', label: 'Logged', variant: 'approved' };
  }
  if (doc.kind === 'incident') {
    if (doc.status === 'closed') return { status: 'closed', label: 'Closed', variant: 'approved' };
    return { status: 'open', label: doc.status === 'office review' ? 'Office review' : 'Open', variant: doc.status === 'office review' ? 'submitted' : 'draft' };
  }
  if (doc.sentBack) return { status: 'sent_back', label: 'Sent back', variant: 'violation' };
  if (filed) return { status: 'filed', label: `Filed${filed.version > 1 ? ` v${filed.version}` : ''}`, variant: 'approved' };
  if (doc.statusVariant === 'approved') return { status: 'approved', label: doc.kind === 'drill_log' ? 'Accepted, not filed' : 'Approved, not filed', variant: 'approved' };
  if (doc.statusVariant === 'submitted') return { status: 'submitted', label: doc.kind === 'drill_log' ? 'Complete' : 'Awaiting approval', variant: 'submitted' };
  return { status: 'draft', label: doc.kind === 'drill_log' ? 'Open' : 'Draft', variant: 'draft' };
}

export function useRecRows(scope: 'mine' | 'company'): RecRow[] | undefined {
  const me = getSessionUser();
  const docs = useLiveQuery(
    () => buildDocRows({ scope, meId: me?.id, meName: me?.name, role: me?.role ?? 'blaster' }),
    [scope, me?.id, me?.role],
  );
  const subs = useSubmissionSummaries();
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  return useMemo(() => {
    if (!docs || !subs) return undefined;
    const jobById = new Map(jobs.map((j) => [j.id, j]));
    const bySource = new Map<string, SubmissionSummary[]>();
    for (const s of subs) {
      const k = `${SUB_TYPE_TO_KIND[s.type] ?? s.type}:${s.sourceId}`;
      bySource.set(k, [...(bySource.get(k) ?? []), s]);
    }
    for (const list of bySource.values()) list.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
    const seen = new Set<string>();
    const out: RecRow[] = [];
    for (const d of docs) {
      const k = `${d.kind}:${d.sourceId}`;
      seen.add(k);
      const versions = bySource.get(k) ?? [];
      const filed = versions[0];
      const st = statusOf(d, filed);
      const job = d.jobId ? jobById.get(d.jobId) : undefined;
      out.push({
        key: d.key,
        kind: d.kind,
        date: d.date,
        title: d.title,
        head: d.head,
        sub: d.sub,
        particulars: d.particulars ?? d.sub,
        facts: d.facts ?? {},
        jobId: d.jobId,
        jobName: d.jobId ? (job?.name ?? '—') : '—',
        jobNumber: job?.jobNumber,
        customerId: d.customerId ?? filed?.customerId,
        customerName: d.customerName,
        siteId: d.siteId ?? filed?.siteId,
        dayId: d.dayId,
        person: d.person ?? filed?.submittedBy ?? '',
        status: st.status,
        statusLabel: st.label,
        statusVariant: st.variant,
        to: d.to,
        filed,
        versions,
      });
    }
    // Filed copies whose live source is gone (deleted day, other scope) — the
    // archive is write-once, so they still show
    if (scope === 'company') {
      for (const [k, versions] of bySource) {
        if (seen.has(k)) continue;
        const f = versions[0];
        const job = f.jobId ? jobById.get(f.jobId) : undefined;
        out.push({
          key: `sub-${f.id}`,
          kind: SUB_TYPE_TO_KIND[f.type] ?? 'blast_log',
          date: f.date,
          title: f.title,
          sub: 'archived copy',
          particulars: 'archived copy · the live record is gone',
          facts: { clips: f.assetCount },
          jobId: f.jobId,
          jobName: f.jobId ? (job?.name ?? '—') : '—',
          jobNumber: job?.jobNumber,
          customerId: f.customerId,
          siteId: f.siteId,
          dayId: f.blastDayId,
          person: f.submittedBy,
          status: 'filed',
          statusLabel: `Filed${f.version > 1 ? ` v${f.version}` : ''}`,
          statusVariant: 'approved',
          filed: f,
          versions,
        });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [docs, subs, jobs, scope]);
}

/** The paper-clip count a row shows: the filed copy's frozen assets, else the live attachments */
export function clipCount(r: RecRow): number {
  return r.filed ? r.filed.assetCount : (r.facts.clips ?? 0);
}
