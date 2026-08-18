// Shared document list: search + type chips + rows with live-status badges
// and "filed vN" chips. Used by My Records (mine) and the company Records
// "All documents" lens (which adds a File-to-office action for accepted
// drill logs that never got an office copy).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { DOC_KIND_LABEL, type DocRow } from '@/lib/docRows';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  openSubmissionPdfById,
  useSubmissionSummaries,
  type SubmissionSummary,
} from '@/lib/archive';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export function DocList({
  rows,
  showFileAction = false,
}: {
  rows: DocRow[] | undefined;
  /** Offer "File to office" on accepted drill logs without an office copy */
  showFileAction?: boolean;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');

  // Blob-free summaries — full PDFs are fetched one-at-a-time on open
  const submissions = useSubmissionSummaries();
  const filedBySource = useMemo(() => {
    const map = new Map<string, SubmissionSummary[]>();
    for (const s of submissions ?? []) {
      map.set(s.sourceId, [...(map.get(s.sourceId) ?? []), s]);
    }
    for (const list of map.values()) list.sort((a, b) => b.version - a.version);
    return map;
  }, [submissions]);

  // Windowed (Round 5): recent documents up front, the rest behind one
  // tap — no list renders unbounded history. Searching shows everything.
  const WINDOW = 15;
  const [showAllState, setShowAll] = useState(false);
  const showAll = showAllState || Boolean(search) || kindFilter !== 'all';
  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (kindFilter !== 'all') list = list.filter((r) => r.kind === kindFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) => r.title.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q) || r.date.includes(q),
      );
    }
    return list;
  }, [rows, kindFilter, search]);

  const kinds: { value: string; label: string }[] = [
    { value: 'all', label: 'All' },
    ...(['blast_log', 'daily_report', 'drill_log', 'drill_checklist', 'incident'] as const)
      .filter((k) => (rows ?? []).some((r) => r.kind === k) || kindFilter === k)
      .map((k) => ({ value: k, label: DOC_KIND_LABEL[k] })),
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by job, name, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {kinds.map(({ value, label }) => (
          <button
            key={value}
            className={cn(
              'min-h-[36px] px-3 rounded-full border text-xs font-medium',
              kindFilter === value
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-600 border-gray-300',
            )}
            onClick={() => setKindFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {(showAll ? filtered : filtered.slice(0, WINDOW)).map((r) => {
          const filed = filedBySource.get(r.sourceId) ?? [];
          const needsFiling =
            showFileAction && r.kind === 'drill_log' && r.status === 'accepted' && filed.length === 0;
          return (
            <div key={r.key} className="flex items-center gap-2 px-3 py-2.5">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(r.to)}>
                <p className="text-sm font-semibold truncate">
                  {formatDate(r.date)} · {r.title}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {DOC_KIND_LABEL[r.kind]}
                  {r.sub ? ` · ${r.sub}` : ''}
                </p>
              </button>
              {needsFiling && (
                <button
                  className="text-[11px] font-medium text-safety-orange bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5"
                  title="This accepted log has no office copy yet — file it now"
                  onClick={() => navigate(`${r.to}/submit`)}
                >
                  File to office
                </button>
              )}
              {filed.length > 0 && (
                <button
                  className="text-[11px] font-medium text-navy bg-navy-50 border border-navy/20 rounded-full px-2 py-0.5"
                  title="Open the filed office copy"
                  onClick={() => openSubmissionPdfById(filed[0].id)}
                >
                  filed v{filed[0].version}
                </button>
              )}
              <Badge variant={r.statusVariant}>{r.status}</Badge>
            </div>
          );
        })}
        {rows === undefined && (
          <div className="p-3">
            <ListSkeleton rows={3} />
          </div>
        )}
        {rows !== undefined && filtered.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            {search || kindFilter !== 'all' ? 'Nothing matches.' : 'Nothing here yet.'}
          </p>
        )}
        {!showAll && filtered.length > WINDOW && (
          <button
            className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
            onClick={() => setShowAll(true)}
          >
            Show all {filtered.length} documents ▸
          </button>
        )}
      </div>
    </div>
  );
}
