// Records manager — R-A (Round S4) reworked in S21 for Office Test's Sep 16
// reports ("Records wastes the window, columns say too little, the preview
// doesn't follow, I want a tree view"): the page uses the whole window and
// never scrolls itself — the tree is the navigator on the left (All records ›
// customer › site › job › day, with counts), the columns are the list on the
// right and only the list scrolls. Two-line rows (the paper and the job, then
// the particulars in grey), a Columns menu (Customer, Shots, Lbs, Holes, Rig,
// Approved by) and a Density switch, both remembered. A tap opens the preview
// as a drawer over the right half — Close or the back gesture closes it, the
// list stays where it was — with Open in a window for a second monitor. The
// bulk bar (ZIP · CSV index · Print) is unchanged.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import { ChevronDown, ChevronRight, Columns3, Download, FileText, Filter, PanelLeftClose, PanelLeftOpen, Paperclip, Printer, Search } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { DOC_KIND_LABEL, type DocKind } from '@/lib/docRows';
import { tourBucket } from '@/components/layout/Tour';
import { getSubmissionPdfBlob, openSubmissionPdfById, type SubmissionSummary } from '@/lib/archive';
import { toCsv } from '@/lib/csv';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ListSkeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/ui/undo-toast';
import { clipCount, STATUS_LABEL, useRecRows, type RecRow, type RecStatus } from './recRows';
import { ALL_NODE, nodeKey, RecordsTree, rowUnderNode, type TreeNode } from './RecordsTree';
import { RecordPreview } from './RecordPreview';
import { loadRecordsView, OPTIONAL_COLUMNS, saveRecordsView, type OptionalColumn, type RecordsView } from './recordsView';

type GroupBy = 'date' | 'job' | 'kind';
type SortKey = 'date' | 'title' | 'job' | 'customer' | 'person' | 'status' | 'filedAt' | 'shots' | 'lbs' | 'holes' | 'rig' | 'approvedBy';
const WINDOW = 25;

const KIND_ORDER: DocKind[] = [
  'blast_log', 'daily_report', 'drill_plan', 'drill_log', 'drill_checklist', 'incident',
  'time_card', 'repair_ticket', 'service', 'hour_correction',
];

/** S7b (Matthew: role-specific records "without complicated role
 *  mappings"): each HOME BUCKET opens on its own paper; "Show everything"
 *  is one tap away. Custom roles inherit from their bucket, as the rails
 *  do. Office and admin see everything. */
function bucketKinds(): DocKind[] {
  switch (tourBucket()) {
    case 'field':
      return ['blast_log', 'daily_report', 'drill_plan', 'drill_log', 'incident'];
    case 'driller':
      return ['drill_plan', 'drill_log', 'drill_checklist', 'time_card'];
    case 'mechanic':
      return ['drill_checklist', 'repair_ticket', 'service', 'hour_correction'];
    default:
      return [];
  }
}

export interface RecordsScope {
  customerId?: string;
  siteId?: string;
  jobId?: string;
  date?: string;
  label: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const pdfName = (s: SubmissionSummary) => `${s.type}-${s.date}-v${s.version}-${s.id.slice(0, 8)}.pdf`;
const fmtN = (n: number | undefined, digits = 0) => (n === undefined ? '' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** A column of the list: its key, header, width and sort */
interface Col {
  key: 'document' | 'job' | 'person' | 'status' | 'filed' | OptionalColumn;
  label: string;
  width: string;
  sort: SortKey;
  align?: 'right';
}
const COLS: Record<Col['key'], Col> = {
  document: { key: 'document', label: 'Document', width: 'minmax(0,1fr)', sort: 'title' },
  job: { key: 'job', label: 'Job', width: 'minmax(150px,190px)', sort: 'job' },
  customer: { key: 'customer', label: 'Customer', width: '130px', sort: 'customer' },
  person: { key: 'person', label: 'Person', width: '120px', sort: 'person' },
  status: { key: 'status', label: 'Status', width: '132px', sort: 'status' },
  filed: { key: 'filed', label: 'Filed', width: '76px', sort: 'filedAt' },
  shots: { key: 'shots', label: 'Shots', width: '52px', sort: 'shots', align: 'right' },
  lbs: { key: 'lbs', label: 'Lbs', width: '78px', sort: 'lbs', align: 'right' },
  holes: { key: 'holes', label: 'Holes', width: '56px', sort: 'holes', align: 'right' },
  rig: { key: 'rig', label: 'Rig', width: '96px', sort: 'rig' },
  approvedBy: { key: 'approvedBy', label: 'Approved by', width: '124px', sort: 'approvedBy' },
};
const COL_ORDER: Col['key'][] = ['document', 'job', 'customer', 'person', 'status', 'filed', 'shots', 'lbs', 'holes', 'rig', 'approvedBy'];

export function RecordsManager({ scope, onScopeChange }: { scope: 'mine' | 'company'; onScopeChange?: (s: RecordsScope | undefined) => void }) {
  const navigate = useNavigate();
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
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(WINDOW);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [node, setNode] = useState<TreeNode>(ALL_NODE);
  // What the list shows is the office's choice, remembered on the device
  const [view, setViewState] = useState<RecordsView>(loadRecordsView);
  const setView = (patch: Partial<RecordsView>) => setViewState((v) => { const next = { ...v, ...patch }; saveRecordsView(next); return next; });
  // One preview per viewport: the drawer on wide screens, the sheet on phones
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // The open preview lives in the URL, so the back gesture closes the drawer
  // and the list stays exactly where it was
  const [params, setParams] = useSearchParams();
  const openKey = params.get('open');
  const pushedRef = useRef(false);
  const openPreview = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('open', key);
    setParams(next, { replace: Boolean(openKey) });
    if (!openKey) pushedRef.current = true;
  };
  const closePreview = () => {
    if (pushedRef.current && (window.history.state as { idx?: number } | null)?.idx) {
      pushedRef.current = false;
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  };
  useEffect(() => { if (!openKey) pushedRef.current = false; }, [openKey]);
  // Escape closes the drawer (the lightbox takes the first Escape when it is up)
  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-records-lightbox]')) closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);
  useEffect(() => { setColumnsOpen(false); }, [openKey]);
  useEffect(() => {
    if (!columnsOpen) return;
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-records-columns-menu],[data-records-columns]')) setColumnsOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [columnsOpen]);

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const persons = useMemo(() => [...new Set((rows ?? []).map((r) => r.person).filter(Boolean))].sort(), [rows]);

  // The tree's counts respect the chips and the search but not the node (so a
  // node's count answers "what would I get if I tapped this")
  const chipRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (person && r.person !== person) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (q && ![r.title, r.particulars, r.sub, r.jobName, r.jobNumber ?? '', r.customerName ?? '', r.person, r.date, r.statusLabel, r.head ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, person, from, to, search]);
  const treeRows = useMemo(
    () => chipRows.filter((r) => (kinds.size === 0 || kinds.has(r.kind)) && (statuses.size === 0 || statuses.has(r.status))),
    [chipRows, kinds, statuses],
  );
  // Facet counts reflect every OTHER filter — the additive, live-count behaviour the study asked for
  const base = useMemo(() => chipRows.filter((r) => rowUnderNode(r, node)), [chipRows, node]);
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
    const num = (r: RecRow): number | undefined => {
      switch (sortKey) {
        case 'shots': return r.facts.shots;
        case 'lbs': return r.facts.lbs;
        case 'holes': return r.facts.holes;
        default: return undefined;
      }
    };
    const str = (r: RecRow): string => {
      switch (sortKey) {
        case 'title': return `${DOC_KIND_LABEL[r.kind]} ${r.head ?? ''}`;
        case 'job': return `${r.jobNumber ?? ''} ${r.jobName}`;
        case 'customer': return r.customerName ?? '';
        case 'person': return r.person;
        case 'status': return r.statusLabel;
        case 'filedAt': return r.filed?.createdAt ?? '';
        case 'rig': return r.facts.rig ?? '';
        case 'approvedBy': return r.facts.approvedBy ?? '';
        default: return r.date;
      }
    };
    const numeric = sortKey === 'shots' || sortKey === 'lbs' || sortKey === 'holes';
    return [...list].sort((a, b) => {
      const c = numeric ? ((num(a) ?? -1) - (num(b) ?? -1)) * dir : str(a).localeCompare(str(b), undefined, { numeric: true }) * dir;
      return c || b.date.localeCompare(a.date);
    });
  }, [base, kinds, statuses, sortKey, sortAsc]);

  const windowed = filtered.slice(0, shown);
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: RecRow[] }>();
    for (const r of windowed) {
      const key = groupBy === 'date' ? r.date : groupBy === 'job' ? (r.jobId ?? '—') : r.kind;
      const label = groupBy === 'date' ? `${formatDate(r.date)}` : groupBy === 'job' ? `${r.jobNumber ? `${r.jobNumber} ` : ''}${r.jobName}` : DOC_KIND_LABEL[r.kind];
      const g = m.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      m.set(key, g);
    }
    return [...m.entries()];
  }, [windowed, groupBy]);

  const openRow = (rows ?? []).find((r) => r.key === openKey) ?? null;
  const selectedRows = filtered.filter((r) => selected.has(r.key));
  const selectedFiled = selectedRows.filter((r) => r.filed);
  const anyFilter = (kinds.size > 0 && !onDefaults) || statuses.size > 0 || person || from || to || search || node.level !== 'all';

  const clearFilters = () => {
    setKinds(new Set()); setStatuses(new Set()); setPerson(''); setFrom(''); setTo(''); setSearch(''); setNode(ALL_NODE);
  };

  // The node the office is on — Export binder takes it
  useEffect(() => {
    if (!onScopeChange) return;
    onScopeChange(node.level === 'all' ? undefined : { customerId: node.customerId, siteId: node.siteId, jobId: node.jobId, date: node.date, label: node.level === 'day' ? `${jobs.find((j) => j.id === node.jobId)?.name ?? 'the job'} · ${node.label}` : node.label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey(node), jobs.length]);

  const sortBy = (k: SortKey) => {
    if (sortKey === k) setSortAsc((a) => !a);
    else {
      setSortKey(k);
      setSortAsc(k === 'title' || k === 'job' || k === 'person' || k === 'status' || k === 'customer' || k === 'rig' || k === 'approvedBy');
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
    const rowsOut: (string | number)[][] = [['Job', 'Date', 'Document', 'Kind', 'Particulars', 'Person', 'Status', 'Filed at', 'Version', 'SHA-256', 'Size', 'Attachments']];
    for (const r of selectedRows) rowsOut.push([r.jobName, r.date, r.title, DOC_KIND_LABEL[r.kind], r.particulars, r.person, r.statusLabel, r.filed?.createdAt ?? '', r.filed?.version ?? '', r.filed?.pdfSha256 ?? '', r.filed?.pdfSize ?? '', clipCount(r)]);
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

  const cols: Col[] = COL_ORDER.filter((k) => !OPTIONAL_COLUMNS.some((o) => o.key === k) || view.columns.includes(k as OptionalColumn)).map((k) => COLS[k]);
  const gridTemplate = `28px ${cols.map((c) => c.width).join(' ')}`;
  const compact = view.density === 'compact';
  const treeOn = view.tree && wide;

  const chip = (on: boolean) => cn('shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs', on ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50');
  const facets = (
    <div className="flex items-center gap-1.5 flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible pb-0.5" data-records-facets>
      <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase shrink-0">Kind</span>
      {(onDefaults ? defaultKinds : KIND_ORDER).map((k) => (
        <button key={k} className={chip(kinds.has(k))} onClick={() => setKinds(toggle(kinds, k))} data-facet-kind={k}>
          <span>{DOC_KIND_LABEL[k]}</span>
          <span className={kinds.has(k) ? 'text-white/70' : 'text-gray-400'}>{kindCounts.get(k) ?? 0}</span>
        </button>
      ))}
      {defaultKinds.length > 0 && (
        <button className="shrink-0 text-xs text-navy underline" data-records-scope-toggle={onDefaults ? 'everything' : 'mine'} onClick={() => setKinds(onDefaults ? new Set() : new Set(defaultKinds))}>
          {onDefaults ? 'Show everything' : 'Just my kind of paper'}
        </button>
      )}
      <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase shrink-0 ml-2">Status</span>
      {(['filed', 'approved', 'submitted', 'draft', 'sent_back', 'open', 'closed'] as RecStatus[])
        .filter((s) => (statusCounts.get(s) ?? 0) > 0 || statuses.has(s))
        .map((s) => (
          <button key={s} className={chip(statuses.has(s))} onClick={() => setStatuses(toggle(statuses, s))} data-facet-status={s}>
            <span>{STATUS_LABEL[s]}</span>
            <span className={statuses.has(s) ? 'text-white/70' : 'text-gray-400'}>{statusCounts.get(s) ?? 0}</span>
          </button>
        ))}
      {anyFilter && (
        <button className="shrink-0 text-xs text-navy underline ml-1" onClick={clearFilters} data-records-clear>Clear</button>
      )}
    </div>
  );

  const scopeControls = (
    <div className="flex items-center gap-2 flex-wrap">
      {scope === 'company' && (
        <Select value={person} onChange={(e) => setPerson(e.target.value)} className="h-8 text-xs w-auto py-0" options={[{ value: '', label: 'Person: all' }, ...persons.map((p) => ({ value: p, label: p }))]} data-records-person />
      )}
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs w-[9.5rem]" aria-label="From" />
      <span className="text-xs text-gray-400">to</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs w-[9.5rem]" aria-label="To" />
    </div>
  );

  const Th = ({ c }: { c: Col }) => (
    <button className={cn('text-[10px] uppercase tracking-wider font-bold truncate', c.align === 'right' ? 'text-right' : 'text-left', sortKey === c.sort ? 'text-navy' : 'text-gray-400')} onClick={() => sortBy(c.sort)} data-sort={c.sort} title={`Sort by ${c.label}`}>
      {c.label}{sortKey === c.sort ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </button>
  );

  const cell = (r: RecRow, c: Col) => {
    const two = !compact;
    switch (c.key) {
      case 'document':
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {DOC_KIND_LABEL[r.kind]}{r.head ? <span className="text-gray-500 font-normal"> · {r.head}</span> : null}
            </p>
            {two && (
              <p className="text-xs text-gray-500 truncate" data-records-particulars>
                {r.particulars}
                {clipCount(r) > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-gray-500" data-records-clips={clipCount(r)}><Paperclip className="h-3 w-3" />{clipCount(r)}</span>}
              </p>
            )}
          </div>
        );
      case 'job':
        return (
          <div className="min-w-0">
            <p className="text-xs text-gray-700 truncate">{r.jobNumber ? <span className="tabular-nums">{r.jobNumber} </span> : null}{r.jobName}</p>
            {two && <p className="text-[11px] text-gray-400 truncate">{groupBy === 'date' ? (view.columns.includes('customer') ? '' : (r.customerName ?? '')) : formatDate(r.date)}</p>}
          </div>
        );
      case 'customer':
        return <span className="text-xs text-gray-600 truncate">{r.customerName ?? '—'}</span>;
      case 'person':
        return <span className="text-xs text-gray-600 truncate">{r.person || '—'}</span>;
      case 'status':
        return <span><Badge variant={r.statusVariant} className="whitespace-nowrap">{r.statusLabel}</Badge></span>;
      case 'filed':
        return r.filed ? (
          <div className="min-w-0">
            <p className="text-xs text-gray-500 tabular-nums">{r.filed.createdAt.slice(5, 10)}</p>
            {two && <p className="text-[11px] text-gray-400 tabular-nums">{fmtTime(r.filed.createdAt)}</p>}
          </div>
        ) : <span className="text-xs text-gray-300">—</span>;
      case 'shots':
        return <span className="text-xs text-gray-600 tabular-nums text-right block">{r.facts.shots ?? '—'}</span>;
      case 'lbs':
        return <span className="text-xs text-gray-600 tabular-nums text-right block">{r.facts.lbs ? fmtN(r.facts.lbs, 1) : '—'}</span>;
      case 'holes':
        return <span className="text-xs text-gray-600 tabular-nums text-right block">{r.facts.holes ?? '—'}</span>;
      case 'rig':
        return <span className="text-xs text-gray-600 truncate">{r.facts.rig ?? '—'}</span>;
      case 'approvedBy':
        return (
          <div className="min-w-0">
            <p className="text-xs text-gray-600 truncate">{r.facts.approvedBy ?? '—'}</p>
            {two && r.facts.approvedAt && <p className="text-[11px] text-gray-400 tabular-nums">{r.facts.approvedAt.slice(5, 10)}</p>}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-2" data-records-manager data-records-density={view.density} data-records-tree-on={treeOn ? 'yes' : 'no'}>
      {/* Toolbar: search · group · columns · tree · filters */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative flex-1 min-w-[180px] max-w-md">
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
        <div className="relative hidden lg:block">
          <button className={cn('h-9 px-2.5 rounded-lg border text-xs flex items-center gap-1', columnsOpen ? 'border-navy text-navy' : 'border-gray-300 text-gray-600 hover:bg-gray-50')} onClick={() => setColumnsOpen((o) => !o)} data-records-columns>
            <Columns3 className="h-4 w-4" /> Columns{view.columns.length ? ` · ${view.columns.length}` : ''}
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2 text-sm" data-records-columns-menu>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Columns</p>
              {OPTIONAL_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={view.columns.includes(c.key)} onChange={(e) => setView({ columns: e.target.checked ? [...view.columns, c.key] : view.columns.filter((k) => k !== c.key) })} data-column-toggle={c.key} />
                  {c.label}
                </label>
              ))}
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase pt-1">Density</p>
              {(['comfortable', 'compact'] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="records-density" className="h-4 w-4" checked={view.density === d} onChange={() => setView({ density: d })} data-density={d} />
                  {d === 'comfortable' ? 'Comfortable · two lines' : 'Compact · one line'}
                </label>
              ))}
            </div>
          )}
        </div>
        <button className="hidden lg:flex h-9 px-2.5 rounded-lg border border-gray-300 text-xs text-gray-600 items-center gap-1 hover:bg-gray-50" onClick={() => setView({ tree: !view.tree })} data-records-tree-toggle={view.tree ? 'hide' : 'show'}>
          {view.tree ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />} {view.tree ? 'Hide the tree' : 'Show the tree'}
        </button>
        <div className="hidden lg:block">{scopeControls}</div>
        <button className="lg:hidden flex items-center gap-1 text-sm text-gray-600" onClick={() => setFiltersOpen((o) => !o)} data-records-filters-toggle>
          <Filter className="h-4 w-4" /> Filters{anyFilter ? ' · on' : ''} {filtersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <label className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
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
      {filtersOpen && <div className="lg:hidden rounded-xl border border-gray-200 bg-white p-3">{scopeControls}</div>}
      <div className="shrink-0">{facets}</div>

      {selected.size > 0 && (
        <div className="rounded-lg bg-navy text-white px-3 py-2 flex items-center gap-2 flex-wrap text-sm shrink-0" data-records-bulk>
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

      {/* The tree and the list: only these scroll; the drawer lays over the list's right half */}
      <div className="flex-1 min-h-0 flex gap-3 relative">
        {treeOn && (
          <aside className="w-64 shrink-0 rounded-xl border border-gray-200 bg-white p-2 overflow-y-auto" data-records-tree-pane>
            <RecordsTree rows={treeRows} names={{ customers, sites, jobs }} selected={node} onSelect={(n) => { setNode(n); setShown(WINDOW); }} />
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <p className="text-[11px] text-gray-400 px-1 pb-1 shrink-0" data-records-summary>
            {node.level === 'all' ? 'Everything' : node.label} · {Math.min(shown, filtered.length)} shown of {filtered.length}
            {rows && rows.length !== filtered.length ? ` · ${rows.length} in all` : ''}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white" data-records-list>
            <div className="hidden lg:grid gap-2 px-3 py-2 border-b border-gray-100 items-center sticky top-0 bg-white z-10" style={{ gridTemplateColumns: gridTemplate }}>
              <span />
              {cols.map((c) => <Th key={c.key} c={c} />)}
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
                          'grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2 px-3 border-b border-gray-50 items-center cursor-pointer hover:bg-gray-50 lg:[grid-template-columns:var(--cols)]',
                          compact ? 'py-1.5' : 'py-2',
                          openKey === r.key && 'bg-orange-50',
                          selected.has(r.key) && 'bg-orange-50/60',
                        )}
                        style={{ ['--cols' as string]: gridTemplate }}
                        onClick={() => openPreview(r.key)}
                        data-records-row={r.key}
                        data-records-kind={r.kind}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected.has(r.key)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => setSelected(toggle(selected, r.key))}
                          aria-label="Select"
                        />
                        {/* phone: the paper, then job · date · particulars */}
                        <div className="min-w-0 lg:hidden">
                          <p className="text-sm font-medium truncate">{DOC_KIND_LABEL[r.kind]}{r.head ? <span className="text-gray-500 font-normal"> · {r.head}</span> : null}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {r.jobNumber ? `${r.jobNumber} ` : ''}{r.jobName} · {formatDate(r.date)}{!compact && r.particulars ? ` · ${r.particulars}` : ''}{clipCount(r) > 0 ? ` · 📎 ${clipCount(r)}` : ''}
                          </p>
                        </div>
                        <span className="justify-self-end lg:hidden"><Badge variant={r.statusVariant}>{r.statusLabel}</Badge></span>
                        {/* wide: the columns */}
                        {cols.map((c) => (
                          <div key={c.key} className="hidden lg:block min-w-0">{cell(r, c)}</div>
                        ))}
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
        {/* The preview: a drawer over the list's right half — the toolbar, the chips, the tree and the
            list's visible half stay reachable; a tap on another row swaps the preview */}
        {openRow && wide && (
          <div className="absolute inset-y-0 right-0 z-20 w-[58%] bg-white shadow-2xl border border-gray-200 rounded-xl overflow-y-auto" data-records-drawer>
            <RecordPreview row={openRow} onClose={closePreview} />
          </div>
        )}
      </div>

      {/* On a phone the preview is a sheet with a backdrop */}
      {openRow && !wide && (
        <div className="fixed inset-0 z-[80] bg-black/30" onClick={closePreview} data-records-drawer-backdrop>
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] bg-white rounded-t-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()} data-records-drawer data-records-sheet>
            <RecordPreview row={openRow} onClose={closePreview} compact />
          </div>
        </div>
      )}
    </div>
  );
}
