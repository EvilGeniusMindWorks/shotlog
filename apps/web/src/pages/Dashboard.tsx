import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, LayoutGrid, Plus, Search, Table2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { createBlastDay } from '@/hooks/useBlastDay';
import { powderFactor } from '@shotlog/shared';
import type { BlastDay, Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import { NewBlastDayDialog } from '@/components/forms/NewBlastDayDialog';

interface DaySummary {
  day: BlastDay;
  job: Job | undefined;
  shots: number;
  holes: number;
  totalLbs: number;
  pf: number;
  snapshot: Blob | null;
}

/** Assemble per-day stats + the site-map snapshot for the hero image */
function useDaySummaries(): DaySummary[] | undefined {
  return useLiveQuery(async () => {
    const days = await db.blastDays.orderBy('date').reverse().toArray();
    const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j]));
    const summaries: DaySummary[] = [];
    for (const day of days) {
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      let shots = 0;
      let holes = 0;
      let totalLbs = 0;
      let yards = 0;
      let snapshot: Blob | null = null;
      if (log) {
        const dayShots = await db.shots.where('blastLogId').equals(log.id).toArray();
        shots = dayShots.length;
        holes = dayShots.reduce((s, sh) => s + sh.totals.numHoles, 0);
        yards = dayShots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
        snapshot = dayShots.find((sh) => sh.designPlan.siteSketchImage)?.designPlan
          .siteSketchImage ?? null;
        const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
        totalLbs = usage?.totalPoundsShot ?? 0;
      }
      summaries.push({
        day,
        job: jobs.get(day.jobId),
        shots,
        holes,
        totalLbs,
        pf: yards > 0 ? powderFactor(totalLbs, yards) : 0,
        snapshot,
      });
    }
    return summaries;
  }, []);
}

/** KPI stats across all data (Spec §3.1) */
function useKpis() {
  return useLiveQuery(async () => {
    const activeJobs = await db.jobs.filter((j) => j.isActive).count();
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const yearPrefix = `${now.getFullYear()}-`;
    const days = await db.blastDays.toArray();
    let shotsThisMonth = 0;
    let ytdLbs = 0;
    for (const day of days) {
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (!log) continue;
      if (day.date.startsWith(monthPrefix)) {
        shotsThisMonth += await db.shots.where('blastLogId').equals(log.id).count();
      }
      if (day.date.startsWith(yearPrefix)) {
        const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
        ytdLbs += usage?.totalPoundsShot ?? 0;
      }
    }
    // Compliance: shots with seismo readings where none is a violation
    const readings = await db.seismoReadings.toArray();
    const byShot = new Map<string, boolean>();
    for (const r of readings) {
      const prev = byShot.get(r.shotId) ?? true;
      byShot.set(r.shotId, prev && r.complianceStatus !== 'violation');
    }
    const measured = byShot.size;
    const compliant = [...byShot.values()].filter(Boolean).length;
    return {
      activeJobs,
      shotsThisMonth,
      ytdLbs,
      compliancePct: measured > 0 ? Math.round((compliant / measured) * 100) : null,
    };
  }, []);
}

type SortKey = 'date' | 'job' | 'status' | 'shots' | 'holes' | 'totalLbs' | 'pf';

export function Dashboard() {
  const navigate = useNavigate();
  const summaries = useDaySummaries();
  const kpis = useKpis();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);

  const filtered = useMemo(() => {
    let list = summaries ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.day.date.includes(q) ||
          s.job?.name.toLowerCase().includes(q) ||
          s.job?.customer.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'all') list = list.filter((s) => s.day.status === statusFilter);
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return a.day.date.localeCompare(b.day.date) * dir;
        case 'job':
          return (a.job?.name ?? '').localeCompare(b.job?.name ?? '') * dir;
        case 'status':
          return a.day.status.localeCompare(b.day.status) * dir;
        default:
          return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
      }
    });
  }, [summaries, search, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === 'job' || key === 'status');
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto pb-24">
      {/* KPI stats bar */}
      <div data-tour="kpis" className="grid grid-cols-4 gap-2 mb-4">
        <Kpi label="Active Jobs" value={kpis ? String(kpis.activeJobs) : '—'} />
        <Kpi label="Shots / Month" value={kpis ? String(kpis.shotsThisMonth) : '—'} />
        <Kpi label="YTD Total (lbs)" value={kpis ? kpis.ytdLbs.toLocaleString() : '—'} />
        <Kpi
          label="Compliance"
          value={kpis?.compliancePct !== null && kpis ? `${kpis.compliancePct}%` : '—'}
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-gray-900">Blast Days</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView(view === 'cards' ? 'table' : 'cards')}
        >
          {view === 'cards' ? (
            <>
              <Table2 className="h-4 w-4 mr-1" /> View All
            </>
          ) : (
            <>
              <LayoutGrid className="h-4 w-4 mr-1" /> Cards
            </>
          )}
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by job, customer, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {view === 'table' && (
        <div className="flex gap-2 mb-3">
          {['all', 'draft', 'submitted', 'approved'].map((s) => (
            <button
              key={s}
              className={cn(
                'min-h-[36px] px-3 rounded-full border text-xs font-medium capitalize',
                statusFilter === s
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-gray-600 border-gray-300',
              )}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {summaries !== undefined && filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No blast days{search || statusFilter !== 'all' ? ' match' : ' yet'}</p>
          <p className="text-sm">Tap "+" to get started</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <DayCard key={s.day.id} summary={s} onClick={() => navigate(`/blast-day/${s.day.id}`)} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                {(
                  [
                    ['date', 'Date'],
                    ['job', 'Job'],
                    ['status', 'Status'],
                    ['shots', 'Shots'],
                    ['holes', 'Holes'],
                    ['totalLbs', 'Total Lbs'],
                    ['pf', 'PF'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2">
                    <button
                      className="flex items-center gap-1 font-semibold min-h-[32px]"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortKey === key &&
                        (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.day.id}
                  className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                  onClick={() => navigate(`/blast-day/${s.day.id}`)}
                >
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap">{s.day.date}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{s.job?.name ?? '—'}</span>
                    {s.job?.city && (
                      <span className="text-xs text-gray-400 block">
                        {s.job.city}, {s.job.state}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={s.day.status as 'draft' | 'submitted' | 'approved'}>
                      {s.day.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{s.shots}</td>
                  <td className="px-3 py-2.5 font-mono">{s.holes || '—'}</td>
                  <td className="px-3 py-2.5 font-mono">{s.totalLbs ? s.totalLbs.toFixed(0) : '—'}</td>
                  <td className="px-3 py-2.5 font-mono">{s.pf ? s.pf.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FAB */}
      <button
        data-tour="fab"
        className="fixed bottom-24 right-4 sm:bottom-8 sm:right-8 h-14 w-14 rounded-full bg-safety-orange text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-20"
        title="New Blast Day"
        onClick={() => setShowNewDialog(true)}
      >
        <Plus className="h-7 w-7" />
      </button>

      {showNewDialog && (
        <NewBlastDayDialog
          onClose={() => setShowNewDialog(false)}
          onCreate={async (jobId, date, copy) => {
            const id = await createBlastDay(jobId, date, copy);
            setShowNewDialog(false);
            navigate(`/blast-day/${id}`);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="font-mono text-lg font-bold text-navy">{value}</p>
      <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
    </div>
  );
}

function DayCard({ summary, onClick }: { summary: DaySummary; onClick: () => void }) {
  const { day, job, shots, holes, totalLbs, pf, snapshot } = summary;
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!snapshot) {
      setHeroUrl(null);
      return;
    }
    const url = URL.createObjectURL(snapshot);
    setHeroUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [snapshot]);

  const dayNum = day.date.slice(8, 10);
  const weekday = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
  });

  return (
    <button
      className="text-left bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      onClick={onClick}
    >
      {/* Hero: real site-map snapshot when available */}
      <div className="relative h-32 bg-navy-50">
        {heroUrl ? (
          <img src={heroUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <PlaceholderHero seed={day.id} />
        )}
        <Badge
          variant={day.status as 'draft' | 'submitted' | 'approved'}
          className="absolute top-2 left-2 shadow"
        >
          {day.status}
        </Badge>
        <div className="absolute top-2 right-2 bg-white/95 rounded-md px-2 py-0.5 text-center shadow">
          <div className="font-mono font-bold text-navy leading-tight">{dayNum}</div>
          <div className="text-[9px] text-gray-500 uppercase leading-tight">{weekday}</div>
        </div>
      </div>
      <div className="p-3">
        <p className="font-semibold truncate">{job?.name ?? 'Unknown Job'}</p>
        <p className="text-xs text-gray-500 truncate mb-2">
          {[job?.address, job?.city].filter(Boolean).join(', ') || job?.customer || ''}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <MiniMetric label="Shots" value={String(shots)} />
          <MiniMetric label="Holes" value={holes ? String(holes) : '—'} />
          <MiniMetric label="Lbs" value={totalLbs ? totalLbs.toFixed(0) : '—'} />
          <MiniMetric label="PF" value={pf ? pf.toFixed(2) : '—'} />
        </div>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-md px-1.5 py-1 text-center">
      <div className="font-mono text-sm font-bold text-gray-800 truncate">{value}</div>
      <div className="text-[9px] text-gray-400">{label}</div>
    </div>
  );
}

/** Deterministic terrain-style placeholder when no map snapshot exists yet */
function PlaceholderHero({ seed }: { seed: string }) {
  // Simple hash → stable pseudo-random layout per card
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const r = (n: number) => Math.abs((h >> n) % 100) / 100;
  return (
    <svg viewBox="0 0 300 130" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <rect width="300" height="130" fill="#eef2f6" />
      <path
        d={`M0,${40 + r(2) * 30} Q${60 + r(4) * 60},${20 + r(6) * 40} 150,${45 + r(8) * 25} T300,${35 + r(10) * 30}`}
        fill="none"
        stroke="#c9d4de"
        strokeWidth="2"
      />
      <path
        d={`M0,${85 + r(3) * 20} Q${90 + r(5) * 60},${70 + r(7) * 30} 200,${88 + r(9) * 18} T300,${80 + r(11) * 20}`}
        fill="none"
        stroke="#d8e0e8"
        strokeWidth="1.5"
      />
      <rect
        x={90 + r(12) * 60}
        y={45 + r(13) * 25}
        width="70"
        height="42"
        rx="4"
        fill="none"
        stroke="#dd6b20"
        strokeWidth="2"
        strokeDasharray="5,3"
      />
      <circle cx={230 + r(14) * 30} cy={30 + r(15) * 20} r="9" fill="#1a365d" opacity="0.15" />
    </svg>
  );
}
