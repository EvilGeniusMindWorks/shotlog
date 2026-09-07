// Records manager R-A (Round S4, Office & Records study §3 — "looks right").
// Replaces the one-column DocList: facets with live counts (kind · status ·
// job · customer · site · person · dates), a sortable, groupable,
// multi-select list, an inline preview of the selected record (filed PDF
// or a summary card for live records), and a bulk bar (ZIP · CSV index ·
// Print). Three panes on wide screens; list + preview sheet on phones.
// Saved views, audit-pack curation and tags are R-B/R-C.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Filter,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { buildDocRows, DOC_KIND_LABEL, type DocKind, type DocRow } from '@/lib/docRows';
import { tourBucket } from '@/components/layout/Tour';
import {
  downloadSubmissionPdfById,
  getSubmissionPdfBlob,
  openSubmissionPdfById,
  useSubmissionSummaries,
  type SubmissionSummary,
} from '@/lib/archive';
import { toCsv } from '@/lib/csv';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ListSkeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/ui/undo-toast';

type RecStatus = 'filed' | 'approved' | 'submitted' | 'draft' | 'sent_back' | 'open' | 'closed';

interface RecRow {
  key: string;
  kind: DocKind;
  date: string;
  title: string;
  sub: string;
  jobId?: string;
  jobName: string;
  customerId?: string;
  siteId?: string;
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

const STATUS_LABEL: Record<RecStatus, string> = {
  filed: 'Filed',
  approved: 'Approved, not filed',
  submitted: 'Submitted',
  draft: 'Draft',
  sent_back: 'Sent back',
  open: 'Open',
  closed: 'Closed',
};

type GroupBy = 'date' | 'job' | 'kind';
type SortKey = 'date' | 'title' | 'job' | 'person' | 'status' | 'filedAt';
const WINDOW = 25;

const KIND_ORDER: DocKind[] = [
  'blast_log', 'daily_report', 'drill_log', 'drill_checklist', 'incident',
  'time_card', 'repair_ticket', 'service', 'hour_correction',
];

/** S7b (Matthew: role-specific records "without complicated role
 *  mappings"): each HOME BUCKET opens on its own paper; "Show everything"
 *  is one tap away. Custom roles inherit from their bucket, as the rails
 *  do. Office and admin see everything. */
function bucketKinds(): DocKind[] {
  switch (tourBucket()) {
    case 'field':
      return ['blast_log', 'daily_report', 'drill_log', 'incident'];
    case 'driller':
      return ['drill_log', 'drill_checklist', 'time_card'];
    case 'mechanic':
      return ['drill_checklist', 'repair_ticket', 'service', 'hour_correction'];
    default:
      return [];
  }
}
const SUB_TYPE_TO_KIND: Record<string, DocKind> = {
  blast_log: 'blast_log',
  daily_report: 'daily_report',
  drill_log: 'drill_log',
  drill_checklist: 'drill_checklist',
  incident: 'incident',
};

function statusOf(doc: DocRow, filed: SubmissionSummary | undefined): { status: RecStatus; label: string; variant: RecRow['statusVariant'] } {
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
  if (doc.statusVariant === 'submitted') return { status: 'submitted', label: doc.kind === 'drill_log' ? 'Complete' : 'Submitted', variant: 'submitted' };
  return { status: 'draft', label: doc.kind === 'drill_log' ? 'Open' : 'Draft', variant: 'draft' };
}

function useRecRows(scope: 'mine' | 'company'): RecRow[] | undefined {
  const me = getSessionUser();
  const docs = useLiveQuery(
    () => buildDocRows({ scope, meId: me?.id, meName: me?.name, role: me?.role ?? 'blaster' }),
    [scope, me?.id, me?.role],
  );
  const subs = useSubmissionSummaries();
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  return useMemo(() => {
    if (!docs || !subs) return undefined;
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    const bySource = new Map<string, SubmissionSummary[]>();
    for (const s of subs) bySource.set(`${SUB_TYPE_TO_KIND[s.type] ?? s.type}:${s.sourceId}`, [...(bySource.get(`${SUB_TYPE_TO_KIND[s.type] ?? s.type}:${s.sourceId}`) ?? []), s]);
    for (const list of bySource.values()) list.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
    const seen = new Set<string>();
    const out: RecRow[] = [];
    for (const d of docs) {
      const k = `${d.kind}:${d.sourceId}`;
      seen.add(k);
      const versions = bySource.get(k) ?? [];
      const filed = versions[0];
      const st = statusOf(d, filed);
      out.push({
        key: d.key,
        kind: d.kind,
        date: d.date,
        title: d.title,
        sub: d.sub,
        jobId: d.jobId,
        jobName: d.jobId ? (jobName.get(d.jobId) ?? '—') : '—',
        customerId: d.customerId ?? filed?.customerId,
        siteId: d.siteId ?? filed?.siteId,
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
        out.push({
          key: `sub-${f.id}`,
          kind: SUB_TYPE_TO_KIND[f.type] ?? 'blast_log',
          date: f.date,
          title: f.title,
          sub: 'archived copy',
          jobId: f.jobId,
          jobName: f.jobId ? (jobName.get(f.jobId) ?? '—') : '—',
          customerId: f.customerId,
          siteId: f.siteId,
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

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const pdfName = (s: SubmissionSummary) => `${s.type}-${s.date}-v${s.version}-${s.id.slice(0, 8)}.pdf`;
const fmtBytes = (n?: number) => (n === undefined ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

// ── Preview ─────────────────────────────────────────────────────────────────

function Preview({ row, onClose, compact }: { row: RecRow; onClose?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const filed = row.filed;
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    setUrl(null);
    if (!filed) {
      setState('ready');
      return;
    }
    setState('loading');
    void getSubmissionPdfBlob(filed.id).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState('missing');
        return;
      }
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
      setState('ready');
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [filed?.id]);

  return (
    <div className={cn('flex flex-col min-h-0', compact ? '' : 'h-full')} data-records-preview>
      <div className="flex items-start justify-between gap-2 p-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{DOC_KIND_LABEL[row.kind]}</p>
          <p className="font-semibold text-sm leading-snug">{row.title}</p>
          <p className="text-xs text-gray-400">{formatDate(row.date)} · {row.jobName}{row.person ? ` · ${row.person}` : ''}</p>
        </div>
        {onClose && (
          <button className="p-1 text-gray-400" onClick={onClose} aria-label="Close preview">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className={cn('bg-gray-100 flex items-center justify-center', compact ? 'h-[55vh]' : 'flex-1 min-h-[280px]')}>
        {filed ? (
          state === 'loading' ? (
            <p className="text-xs text-gray-400">Loading the filed PDF…</p>
          ) : state === 'missing' ? (
            <p className="text-xs text-gray-500 px-4 text-center">
              The PDF is not reachable from this device yet — it is still on the device that filed it, or needs signal to fetch.
            </p>
          ) : (
            <iframe title="Filed PDF" src={`${url}#toolbar=0&view=FitH`} className="w-full h-full bg-white" data-records-pdf />
          )
        ) : (
          <div className="p-4 text-sm text-gray-600 space-y-1 w-full">
            <p className="font-medium">{row.statusLabel} — no filed copy yet.</p>
            <p className="text-xs text-gray-500">{row.sub}</p>
            <p className="text-xs text-gray-400">Live records preview as a summary; the PDF appears here once the day is filed.</p>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2 text-xs">
        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
        {filed && (
          <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1">
            <dt className="text-gray-400">Filed by</dt>
            <dd className="text-gray-700">{filed.submittedBy} · {new Date(filed.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            <dt className="text-gray-400">Versions</dt>
            <dd className="text-gray-700">
              {row.versions.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ' · '}
                  <button className={cn('underline', v.id === filed.id && 'font-semibold')} onClick={() => openSubmissionPdfById(v.id)}>
                    v{v.version}
                  </button>
                  {v.id === filed.id ? ' (this)' : ' superseded'}
                </span>
              ))}
            </dd>
            <dt className="text-gray-400">Integrity</dt>
            <dd className="text-gray-700 font-mono break-all">
              {filed.pdfSha256 ? `sha256 ${filed.pdfSha256.slice(0, 8)}…${filed.pdfSha256.slice(-6)}` : 'no hash recorded'}
              {filed.pdfSize ? ` · ${fmtBytes(filed.pdfSize)}` : ''}
              {filed.storageStatus === 'stored' ? ' · in R2' : filed.storageStatus === 'device' ? ' · on the filing device' : ''}
            </dd>
          </dl>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {filed && (
            <>
              <Button size="sm" variant="outline" onClick={() => openSubmissionPdfById(filed.id)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
              <Button size="sm" variant="outline" onClick={() => void downloadSubmissionPdfById(filed.id, pdfName(filed))}>
                <FileDown className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
            </>
          )}
          {row.to && (
            <Button size="sm" variant={filed ? 'ghost' : 'default'} onClick={() => navigate(row.to!)}>
              Open live record
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manager ─────────────────────────────────────────────────────────────────

export function RecordsManager({ scope }: { scope: 'mine' | 'company' }) {
  const rows = useRecRows(scope);
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray()) ?? [];
  const sites = useLiveQuery(() => db.sites.toArray()) ?? [];

  const [search, setSearch] = useState('');
  // Opens on the bucket's own paper (S7b); everything is one tap away
  const [defaultKinds] = useState<DocKind[]>(bucketKinds);
  const [kinds, setKinds] = useState<Set<DocKind>>(() => new Set(defaultKinds));
  const onDefaults = defaultKinds.length > 0 && kinds.size === defaultKinds.length && defaultKinds.every((k) => kinds.has(k));
  const [statuses, setStatuses] = useState<Set<RecStatus>>(new Set());
  const [jobId, setJobId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(WINDOW);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // One preview per viewport: the pane on wide screens, the sheet on phones
  // (rendering both would fetch the PDF twice)
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const persons = useMemo(() => [...new Set((rows ?? []).map((r) => r.person).filter(Boolean))].sort(), [rows]);

  // Facet counts reflect every OTHER filter (so a count answers "what would I
  // get if I ticked this") — the additive, live-count behaviour the study asked for
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (jobId && r.jobId !== jobId) return false;
      if (customerId && r.customerId !== customerId) return false;
      if (siteId && r.siteId !== siteId) return false;
      if (person && r.person !== person) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (q && ![r.title, r.sub, r.jobName, r.person, r.date, r.statusLabel].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, jobId, customerId, siteId, person, from, to, search]);
  const kindCounts = useMemo(() => {
    const m = new Map<DocKind, number>();
    for (const r of base) if (statuses.size === 0 || statuses.has(r.status)) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [base, statuses]);
  const statusCounts = useMemo(() => {
    const m = new Map<RecStatus, number>();
    for (const r of base) if (kinds.size === 0 || kinds.has(r.kind)) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [base, kinds]);

  const filtered = useMemo(() => {
    const list = base.filter((r) => (kinds.size === 0 || kinds.has(r.kind)) && (statuses.size === 0 || statuses.has(r.status)));
    const dir = sortAsc ? 1 : -1;
    const val = (r: RecRow): string => {
      switch (sortKey) {
        case 'title': return r.title;
        case 'job': return r.jobName;
        case 'person': return r.person;
        case 'status': return r.statusLabel;
        case 'filedAt': return r.filed?.createdAt ?? '';
        default: return r.date;
      }
    };
    return [...list].sort((a, b) => val(a).localeCompare(val(b)) * dir || b.date.localeCompare(a.date));
  }, [base, kinds, statuses, sortKey, sortAsc]);

  const windowed = filtered.slice(0, shown);
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: RecRow[] }>();
    for (const r of windowed) {
      const key = groupBy === 'date' ? r.date : groupBy === 'job' ? (r.jobId ?? '—') : r.kind;
      const label = groupBy === 'date' ? `${formatDate(r.date)}` : groupBy === 'job' ? r.jobName : DOC_KIND_LABEL[r.kind];
      const g = m.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      m.set(key, g);
    }
    return [...m.entries()];
  }, [windowed, groupBy]);

  const openRow = filtered.find((r) => r.key === openKey) ?? null;
  const selectedRows = filtered.filter((r) => selected.has(r.key));
  const selectedFiled = selectedRows.filter((r) => r.filed);
  const anyFilter = (kinds.size > 0 && !onDefaults) || statuses.size > 0 || jobId || customerId || siteId || person || from || to || search;

  const clearFilters = () => {
    setKinds(new Set()); setStatuses(new Set()); setJobId(''); setCustomerId(''); setSiteId(''); setPerson(''); setFrom(''); setTo(''); setSearch('');
  };

  const sortBy = (k: SortKey) => {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(k === 'title' || k === 'job' || k === 'person' || k === 'status');
    }
  };

  const downloadZip = async () => {
    setBusy('zip');
    try {
      const zip = new JSZip();
      const index: (string | number)[][] = [['Job', 'Date', 'Document', 'Person', 'Status', 'Filed at', 'Version', 'SHA-256', 'File']];
      let missing = 0;
      for (const r of selectedFiled) {
        const f = r.filed!;
        const blob = await getSubmissionPdfBlob(f.id);
        const folder = `${(r.jobName || 'no-job').replace(/[^A-Za-z0-9._-]+/g, '_')}/${r.date}`;
        const name = `${folder}/${pdfName(f)}`;
        if (blob) zip.file(name, blob);
        else missing++;
        index.push([r.jobName, r.date, r.title, r.person, r.statusLabel, f.createdAt, f.version, f.pdfSha256 ?? '', blob ? name : 'MISSING on this device']);
      }
      zip.file('index.csv', toCsv(index));
      const out = await zip.generateAsync({ type: 'blob' });
      downloadBlob(out, `shotlog-records-${new Date().toISOString().slice(0, 10)}.zip`);
      showToast(missing ? `ZIP ready — ${missing} PDF${missing === 1 ? '' : 's'} not reachable from this device (listed in index.csv)` : 'ZIP ready');
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const rowsOut: (string | number)[][] = [['Job', 'Date', 'Document', 'Kind', 'Person', 'Status', 'Filed at', 'Version', 'SHA-256', 'Size']];
    for (const r of selectedRows) rowsOut.push([r.jobName, r.date, r.title, DOC_KIND_LABEL[r.kind], r.person, r.statusLabel, r.filed?.createdAt ?? '', r.filed?.version ?? '', r.filed?.pdfSha256 ?? '', r.filed?.pdfSize ?? '']);
    downloadBlob(new Blob([toCsv(rowsOut)], { type: 'text/csv' }), `shotlog-records-index-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const printSelected = () => {
    // The browser prints one document at a time: each filed PDF opens in its
    // own tab in list order; print from the viewer. Capped so a popup
    // blocker does not eat the batch silently.
    const batch = selectedFiled.slice(0, 6);
    for (const r of batch) openSubmissionPdfById(r.filed!.id);
    if (selectedFiled.length > batch.length) showToast(`Opened the first ${batch.length} — select fewer to print the rest.`);
  };

  const KindChip = ({ k }: { k: DocKind }) => (
    <button
      className={cn('flex items-center justify-between w-full rounded-md px-2 py-1 text-xs', kinds.has(k) ? 'bg-navy text-white' : 'hover:bg-gray-50 text-gray-700')}
      onClick={() => setKinds(toggle(kinds, k))}
      data-facet-kind={k}
    >
      <span>{DOC_KIND_LABEL[k]}</span>
      <span className={kinds.has(k) ? 'text-white/70' : 'text-gray-400'}>{kindCounts.get(k) ?? 0}</span>
    </button>
  );
  const StatusChip = ({ s }: { s: RecStatus }) => (
    <button
      className={cn('flex items-center justify-between w-full rounded-md px-2 py-1 text-xs', statuses.has(s) ? 'bg-navy text-white' : 'hover:bg-gray-50 text-gray-700')}
      onClick={() => setStatuses(toggle(statuses, s))}
      data-facet-status={s}
    >
      <span>{STATUS_LABEL[s]}</span>
      <span className={statuses.has(s) ? 'text-white/70' : 'text-gray-400'}>{statusCounts.get(s) ?? 0}</span>
    </button>
  );

  const facets = (
    <div className="space-y-4 text-sm" data-records-facets>
      <div>
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Kind</p>
        {(onDefaults ? defaultKinds : KIND_ORDER).map((k) => <KindChip key={k} k={k} />)}
        {defaultKinds.length > 0 && (
          <button
            className="mt-1 text-xs text-navy underline"
            data-records-scope-toggle={onDefaults ? 'everything' : 'mine'}
            onClick={() => setKinds(onDefaults ? new Set() : new Set(defaultKinds))}
          >
            {onDefaults ? 'Show everything' : 'Just my kind of paper'}
          </button>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Status</p>
        {(['filed', 'approved', 'submitted', 'draft', 'sent_back', 'open', 'closed'] as RecStatus[])
          .filter((s) => (statusCounts.get(s) ?? 0) > 0 || statuses.has(s))
          .map((s) => <StatusChip key={s} s={s} />)}
      </div>
      {scope === 'company' && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Scope</p>
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)} options={[{ value: '', label: 'Job: all' }, ...jobs.map((j) => ({ value: j.id, label: j.name }))]} />
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={[{ value: '', label: 'Customer: all' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} options={[{ value: '', label: 'Site: all' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
          <Select value={person} onChange={(e) => setPerson(e.target.value)} options={[{ value: '', label: 'Person: all' }, ...persons.map((p) => ({ value: p, label: p }))]} />
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Dates</p>
        <div className="flex gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      {anyFilter && (
        <button className="text-xs text-navy underline" onClick={clearFilters}>Clear filters</button>
      )}
    </div>
  );

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button className={cn('text-left text-[10px] uppercase tracking-wider font-bold', sortKey === k ? 'text-navy' : 'text-gray-400', className)} onClick={() => sortBy(k)} data-sort={k}>
      {label}{sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </button>
  );

  return (
    <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)_300px] lg:gap-3 lg:items-start" data-records-manager>
      {/* Facets: sidebar on wide, collapsible bar on phone */}
      <aside className="hidden lg:block rounded-xl border border-gray-200 bg-white p-3 sticky top-2">{facets}</aside>
      <div className="lg:hidden mb-2">
        <button className="flex items-center gap-1 text-sm text-gray-600" onClick={() => setFiltersOpen((o) => !o)} data-records-filters-toggle>
          <Filter className="h-4 w-4" /> Filters{anyFilter ? ' · on' : ''} {filtersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {filtersOpen && <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">{facets}</div>}
      </div>

      {/* List */}
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search title, job, person, date…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {(['date', 'job', 'kind'] as GroupBy[]).map((g) => (
              <button key={g} className={cn('px-2.5 py-1.5', groupBy === g ? 'bg-navy text-white' : 'bg-white text-gray-600')} onClick={() => setGroupBy(g)} data-group-by={g}>
                By {g}
              </button>
            ))}
          </div>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={filtered.length > 0 && filtered.every((r) => selected.has(r.key))}
              onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.key)) : new Set())}
              data-select-all
            />
            all
          </label>
        </div>

        {selected.size > 0 && (
          <div className="rounded-lg bg-navy text-white px-3 py-2 flex items-center gap-2 flex-wrap text-sm" data-records-bulk>
            <span className="font-medium">{selected.size} selected · {selectedFiled.length} PDF{selectedFiled.length === 1 ? '' : 's'}</span>
            <Button size="sm" variant="secondary" disabled={selectedFiled.length === 0 || busy === 'zip'} onClick={() => void downloadZip()} data-bulk-zip>
              <Download className="h-3.5 w-3.5 mr-1" /> {busy === 'zip' ? 'Packing…' : 'Download ZIP'}
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv} data-bulk-csv>
              <FileText className="h-3.5 w-3.5 mr-1" /> CSV index
            </Button>
            <Button size="sm" variant="secondary" disabled={selectedFiled.length === 0} onClick={printSelected}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <button className="ml-auto text-xs underline" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="hidden lg:grid grid-cols-[28px_84px_minmax(0,1fr)_140px_120px_110px_92px] gap-2 px-3 py-2 border-b border-gray-100 items-center">
            <span />
            <Th k="date" label="Date" />
            <Th k="title" label="Document" />
            <Th k="job" label="Job" />
            <Th k="person" label="Person" />
            <Th k="status" label="Status" />
            <Th k="filedAt" label="Filed" />
          </div>
          {rows === undefined && <div className="p-3"><ListSkeleton rows={4} /></div>}
          {groups.map(([gk, g]) => {
            const isCollapsed = collapsed.has(gk);
            const allSel = g.rows.every((r) => selected.has(r.key));
            return (
              <div key={gk} data-records-group={gk}>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={allSel}
                    onChange={(e) => {
                      const next = new Set(selected);
                      for (const r of g.rows) e.target.checked ? next.add(r.key) : next.delete(r.key);
                      setSelected(next);
                    }}
                    aria-label="Select all in group"
                  />
                  <button className="flex items-center gap-1 flex-1 text-left" onClick={() => setCollapsed(toggle(collapsed, gk))}>
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {g.label} · {g.rows.length} document{g.rows.length === 1 ? '' : 's'}
                  </button>
                </div>
                {!isCollapsed &&
                  g.rows.map((r) => (
                    <div
                      key={r.key}
                      className={cn(
                        'grid grid-cols-[28px_minmax(0,1fr)_auto] lg:grid-cols-[28px_84px_minmax(0,1fr)_140px_120px_110px_92px] gap-2 px-3 py-2 border-b border-gray-50 items-center cursor-pointer hover:bg-gray-50',
                        openKey === r.key && 'bg-orange-50',
                        selected.has(r.key) && 'bg-orange-50/60',
                      )}
                      onClick={() => setOpenKey(r.key)}
                      data-records-row={r.key}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selected.has(r.key)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => setSelected(toggle(selected, r.key))}
                        aria-label="Select"
                      />
                      <span className="hidden lg:block text-xs text-gray-500 tabular-nums">{r.date.slice(5)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-xs text-gray-400 truncate lg:hidden">
                          {formatDate(r.date)} · {r.jobName}{r.person ? ` · ${r.person}` : ''}
                        </p>
                      </div>
                      <span className="hidden lg:block text-xs text-gray-600 truncate">{r.jobName}</span>
                      <span className="hidden lg:block text-xs text-gray-600 truncate">{r.person || '—'}</span>
                      <span className="justify-self-end lg:justify-self-start"><Badge variant={r.statusVariant}>{r.statusLabel}</Badge></span>
                      <span className="hidden lg:block text-xs text-gray-400 tabular-nums">{r.filed ? r.filed.createdAt.slice(5, 10) : '—'}</span>
                    </div>
                  ))}
              </div>
            );
          })}
          {rows !== undefined && filtered.length === 0 && (
            <p className="p-4 text-sm text-gray-400">
              {anyFilter ? 'No records match these filters.' : 'Nothing here yet — file a day, drill log or checklist and it appears here with its PDF.'}
            </p>
          )}
          {filtered.length > shown && (
            <button className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy" onClick={() => setShown((n) => n + WINDOW)} data-records-more>
              Showing {shown} of {filtered.length} · Show {Math.min(WINDOW, filtered.length - shown)} more ▸
            </button>
          )}
        </div>
      </div>

      {/* Preview: pane on wide, sheet on phone */}
      <aside className="hidden lg:flex rounded-xl border border-gray-200 bg-white sticky top-2 min-h-[420px] max-h-[calc(100vh-2rem)] overflow-hidden flex-col">
        {openRow && wide ? (
          <Preview row={openRow} />
        ) : (
          <p className="p-4 text-sm text-gray-400">Tap a row to preview the filed PDF here, with its versions and integrity hash.</p>
        )}
      </aside>
      {openRow && !wide && (
        <div className="lg:hidden fixed inset-0 z-[80] bg-black/40 flex items-end" onClick={() => setOpenKey(null)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-records-sheet>
            <Preview row={openRow} compact onClose={() => setOpenKey(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
