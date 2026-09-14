// Evette's list (Round S14): every job with a work day today, one row each —
// the work code, who is on site, four dots for the papers — rows that need
// her first, a Needs you / All today filter, search. Tap a row for the day's
// tiles, read-only. Any number of jobs; the list is the list.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import type { BlastDay } from '@/db/schema';
import { DOT_CLASS, WORK_CODE, dayCoverage, type Coverage } from '@/lib/dayHub';
import { todayISO } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface Row {
  day: BlastDay;
  jobName: string;
  customerName: string;
  people: string[];
  coverage: Coverage;
}

const DOT_LABELS: [keyof Pick<Coverage, 'log' | 'report' | 'drilling' | 'cards'>, string][] = [
  ['log', 'blasting log'],
  ['report', 'daily report'],
  ['drilling', 'drilling'],
  ['cards', 'time cards'],
];

/** The four dots: blasting log · daily report · drilling · time cards */
export function Dots({ d }: { d: Pick<Coverage, 'log' | 'report' | 'drilling' | 'cards'> }) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0" data-coverage={DOT_LABELS.map(([k]) => d[k]).join(',')}>
      {DOT_LABELS.map(([k, label]) => (
        <span key={k} className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[d[k]]}`} title={`${label}: ${d[k]}`} />
      ))}
    </span>
  );
}

export function CoverageDots({ c }: { c: Coverage }) {
  return <Dots d={c} />;
}

export function useTodaysJobs(): Row[] | undefined {
  return useLiveQuery(async () => {
    const today = todayISO();
    const days = await db.blastDays.filter((d) => d.date === today).toArray();
    const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j]));
    const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c]));
    const out: Row[] = [];
    for (const day of days) {
      const job = jobs.get(day.jobId);
      const customer = job?.customerId ? customers.get(job.customerId) : undefined;
      const people = (await db.workDayConfirmations.where('blastDayId').equals(day.id).toArray()).map((c) => c.userName);
      out.push({
        day,
        jobName: day.name || job?.name || 'Job',
        customerName: customer?.name ?? job?.customer ?? '',
        people,
        coverage: await dayCoverage(day),
      });
    }
    out.sort((a, b) => Number(Boolean(b.coverage.attention)) - Number(Boolean(a.coverage.attention)) || a.jobName.localeCompare(b.jobName));
    return out;
  }, []);
}

export function TodaysJobs() {
  const navigate = useNavigate();
  const rows = useTodaysJobs();
  const need = (rows ?? []).filter((r) => r.coverage.attention).length;
  const [filter, setFilter] = useState<'needs' | 'all'>('all');
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const list = rows ?? [];
    const query = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        (filter === 'all' || r.coverage.attention) &&
        (!query || [r.jobName, r.customerName, ...r.people].some((s) => s.toLowerCase().includes(query))),
    );
  }, [rows, filter, q]);
  const onSite = (rows ?? []).reduce((a, r) => a + r.coverage.onSite, 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3" data-todays-jobs data-todays-count={rows?.length ?? 0}>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Today's jobs · {rows?.length ?? 0}</p>
        <p className="text-xs text-gray-500">
          {need > 0 ? `${need} need${need === 1 ? 's' : ''} you · ` : ''}{onSite} on site
        </p>
      </div>
      {(rows?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
            <button type="button" className={`px-3 py-1.5 ${filter === 'needs' ? 'bg-navy text-white' : 'text-gray-600'}`} data-jobs-filter="needs" onClick={() => setFilter('needs')}>
              Needs you
            </button>
            <button type="button" className={`px-3 py-1.5 border-l border-gray-200 ${filter === 'all' ? 'bg-navy text-white' : 'text-gray-600'}`} data-jobs-filter="all" onClick={() => setFilter('all')}>
              All today
            </button>
          </div>
          <Input placeholder="Search a job, customer or person" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" data-jobs-search />
        </div>
      )}
      {shown.map((r) => (
        <button
          key={r.day.id}
          type="button"
          className={`w-full flex items-center gap-3 py-2 px-1 text-left border-t border-gray-100 first:border-t-0 hover:bg-gray-50 min-h-[48px] ${r.coverage.attention ? 'bg-amber-50' : ''}`}
          data-job-row={r.jobName}
          data-job-attention={r.coverage.attention ? '1' : undefined}
          onClick={() => navigate(`/blast-day/${r.day.id}`)}
        >
          <span className="inline-block min-w-[30px] text-center text-[11px] font-bold border border-navy text-navy rounded px-1 leading-5">
            {WORK_CODE[r.day.typeOfWork] ?? '—'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">{r.jobName}</span>
            <span className="block text-xs text-gray-500 truncate">
              {[r.customerName, `${r.coverage.onSite} on site`].filter(Boolean).join(' · ')}
              {r.coverage.attention && <span className="text-amber-700"> · {r.coverage.attention}</span>}
            </span>
          </span>
          <CoverageDots c={r.coverage} />
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        </button>
      ))}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400 py-1">No work days today yet. They appear here as crews start them.</p>}
      {rows && rows.length > 0 && shown.length === 0 && <p className="text-sm text-gray-400 py-1">{q ? 'Nothing matches.' : 'Nothing needs you.'}</p>}
      {rows && rows.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-2">Dots: blasting log · daily report · drilling · time cards. Grey not started, amber in progress, green filed or accepted, teal approved, red sent back.</p>
      )}
    </section>
  );
}
