// The month-grouped work-day list (smart-list pattern): current month
// open, older months collapsed to a count, search across everything.
// Shared by the blaster home's history band and the /days page — no list
// renders unbounded history (decision 2026-08-17).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { DaySummary } from '@/pages/Dashboard';
import { formatDate, todayISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function DayRow({ s, navigate }: { s: DaySummary; navigate: (to: string) => void }) {
  const sentBack = s.day.status === 'draft' && Boolean(s.day.sendBackNote);
  return (
    <button
      className="w-full flex items-center gap-2 py-2 border-t border-gray-100 text-left hover:bg-gray-50"
      onClick={() => navigate(`/blast-day/${s.day.id}`)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {formatDate(s.day.date)} · {s.job?.name ?? 'Unknown job'}
        </p>
        <p className="text-xs text-gray-400">
          {s.shots > 0 ? `${s.shots} shot${s.shots === 1 ? '' : 's'}` : s.day.typeOfWork?.replace(/_/g, ' ')}
          {s.totalLbs > 0 && ` · ${Math.round(s.totalLbs).toLocaleString()} lbs`}
        </p>
      </div>
      <Badge variant={sentBack ? 'violation' : (s.day.status as 'draft' | 'submitted' | 'approved')}>
        {sentBack ? 'sent back' : s.day.status}
      </Badge>
    </button>
  );
}

export function MonthDayList({
  summaries,
  includeToday = false,
  title = 'Recent days',
}: {
  summaries: DaySummary[] | undefined;
  includeToday?: boolean;
  title?: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const today = todayISO();

  const months = useMemo(() => {
    const pool = (summaries ?? []).filter((s) => includeToday || s.day.date < today);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? pool.filter(
          (s) =>
            (s.job?.name ?? '').toLowerCase().includes(q) ||
            s.day.date.includes(q) ||
            s.day.status.includes(q),
        )
      : pool;
    const map = new Map<string, DaySummary[]>();
    for (const s of filtered) {
      const ym = s.day.date.slice(0, 7);
      map.set(ym, [...(map.get(ym) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [summaries, search, today, includeToday]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase flex-1">
          {title}
        </p>
        <div className="relative w-40">
          <Search className="h-3.5 w-3.5 text-gray-300 absolute left-2 top-1/2 -translate-y-1/2" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {summaries === undefined && <p className="text-sm text-gray-400 py-2">Loading…</p>}
      {months.map(([ym, rows], idx) => {
        const open = idx === 0 || Boolean(search.trim()) || openMonths.has(ym);
        return (
          <div key={ym}>
            <button
              className="w-full flex items-center gap-2 py-2 border-t border-gray-100 first:border-t-0 text-left"
              onClick={() => {
                const next = new Set(openMonths);
                if (next.has(ym)) next.delete(ym);
                else next.add(ym);
                setOpenMonths(next);
              }}
            >
              <span className={idx === 0 ? 'text-sm font-semibold flex-1' : 'text-sm text-gray-400 flex-1'}>
                {monthLabel(ym)} · {rows.length} day{rows.length === 1 ? '' : 's'}
              </span>
              {idx > 0 && <span className="text-gray-300">{open ? '▾' : '▸'}</span>}
            </button>
            {open && rows.map((s) => <DayRow key={s.day.id} s={s} navigate={navigate} />)}
          </div>
        );
      })}
      {summaries !== undefined && months.length === 0 && (
        <p className="text-sm text-gray-400 py-2">
          {search.trim() ? 'No days match.' : 'No days yet.'}
        </p>
      )}
    </div>
  );
}
