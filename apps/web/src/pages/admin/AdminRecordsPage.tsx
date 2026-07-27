// The office's record book: every filed submission (point-in-time PDFs +
// frozen attachments), searchable and filterable. Copies are write-once —
// what you open here is exactly what the field filed, forever.
import { useMemo, useState } from 'react';
import { FileDown, FileText, Search } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { cn, formatDate } from '@/lib/utils';
import type { Submission, SubmissionType } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const TYPE_LABEL: Record<SubmissionType, string> = {
  blast_log: 'Blast Log',
  daily_report: 'Daily Report',
  drill_log: 'Drill Log',
  drill_checklist: 'Rig Checklist',
  incident: 'Incident',
};

function openBlob(blob: Blob) {
  window.open(URL.createObjectURL(blob), '_blank');
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function pdfName(s: Submission) {
  return `${s.type}-${s.date}-v${s.version}.pdf`;
}

function SubmissionRow({ s, jobName, older }: { s: Submission; jobName?: string; older: Submission[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{s.title}</p>
          <p className="text-xs text-gray-400 truncate">
            {formatDate(s.date)} · {jobName ?? '—'} · filed by {s.submittedBy}
          </p>
        </div>
        <Badge variant="secondary">{TYPE_LABEL[s.type]}</Badge>
        {(s.version > 1 || older.length > 0) && <Badge variant="pending">v{s.version}</Badge>}
        <button className="text-xs text-navy underline" onClick={() => openBlob(s.pdf)}>
          View
        </button>
        <button
          className="text-xs text-navy underline inline-flex items-center gap-0.5"
          onClick={() => downloadBlob(s.pdf, pdfName(s))}
        >
          <FileDown className="h-3.5 w-3.5" /> PDF
        </button>
        {(s.assets.length > 0 || older.length > 0) && (
          <button className="text-xs text-gray-400 underline" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'less' : `${s.assets.length ? `${s.assets.length} attachment${s.assets.length === 1 ? '' : 's'}` : ''}${s.assets.length && older.length ? ' · ' : ''}${older.length ? `${older.length} older` : ''}`}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-1.5 ml-6 space-y-1">
          {s.assets.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="truncate flex-1">📎 {a.fileName || a.id}</span>
              <button className="text-navy underline" onClick={() => openBlob(a.data)}>
                View
              </button>
              <button className="text-navy underline" onClick={() => downloadBlob(a.data, a.fileName || `${a.id}`)}>
                Download
              </button>
            </div>
          ))}
          {older.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-xs text-gray-400">
              <span className="truncate flex-1">
                v{o.version} · filed {formatDate(o.createdAt.slice(0, 10))} by {o.submittedBy}
              </span>
              <button className="text-navy underline" onClick={() => openBlob(o.pdf)}>
                View
              </button>
              <button className="text-navy underline" onClick={() => downloadBlob(o.pdf, pdfName(o))}>
                PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminRecordsPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState('');
  const [search, setSearch] = useState('');

  const submissions = useLiveQuery(() => db.submissions.toArray());
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const jobName = useMemo(() => new Map(jobs.map((j) => [j.id, j.name])), [jobs]);

  const grouped = useMemo(() => {
    let list = submissions ?? [];
    if (typeFilter !== 'all') list = list.filter((s) => s.type === typeFilter);
    if (jobFilter) list = list.filter((s) => s.jobId === jobFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.submittedBy.toLowerCase().includes(q) ||
          (s.jobId && (jobName.get(s.jobId) ?? '').toLowerCase().includes(q)) ||
          s.date.includes(q),
      );
    }
    // Latest version leads each source; older versions nest under it
    const bySource = new Map<string, Submission[]>();
    for (const s of list) {
      const key = `${s.type}:${s.sourceId}`;
      bySource.set(key, [...(bySource.get(key) ?? []), s]);
    }
    return [...bySource.values()]
      .map((versions) => versions.sort((a, b) => b.version - a.version))
      .sort(
        (a, b) =>
          b[0].date.localeCompare(a[0].date) || b[0].createdAt.localeCompare(a[0].createdAt),
      );
  }, [submissions, typeFilter, jobFilter, search, jobName]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">Records</h3>
        <p className="text-xs text-gray-400">
          {submissions?.length ?? 0} filed cop{(submissions?.length ?? 0) === 1 ? 'y' : 'ies'} — write-once
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'blast_log', 'daily_report', 'drill_log', 'drill_checklist', 'incident'] as const).map(
          (t) => (
            <button
              key={t}
              className={cn(
                'min-h-[36px] px-3 rounded-full border text-xs font-medium',
                typeFilter === t
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-gray-600 border-gray-300',
              )}
              onClick={() => setTypeFilter(t)}
            >
              {t === 'all' ? 'All' : TYPE_LABEL[t]}
            </button>
          ),
        )}
        <Select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          options={[
            { value: '', label: 'All jobs' },
            ...jobs.map((j) => ({ value: j.id, label: j.name })),
          ]}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search title, job, submitter, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {grouped.map((versions) => (
          <SubmissionRow
            key={versions[0].id}
            s={versions[0]}
            jobName={versions[0].jobId ? jobName.get(versions[0].jobId) : undefined}
            older={versions.slice(1)}
          />
        ))}
        {grouped.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            {search || typeFilter !== 'all' || jobFilter
              ? 'No records match.'
              : 'Nothing filed yet — submitted logs, reports, checklists, and incidents land here.'}
          </p>
        )}
      </div>
    </div>
  );
}
