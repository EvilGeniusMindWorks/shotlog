// The blaster home (Round 2, blaster study §1) — replaces the 13-screen
// dashboard. Three bands: what needs him, today, then a windowed month
// history. KPIs moved to job pages (approved call); the home page is for
// action, not statistics.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import type { BlastDay } from '@/db/schema';
import { createBlastDay, useBlastDay } from '@/hooks/useBlastDay';
import { useDayPhases } from '@/hooks/useDayPhases';
import { getPlanHoles, planDrilledHoleNumbers } from '@/hooks/useDrillPlans';
import { formatDate, todayISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NewBlastDayDialog } from '@/components/forms/NewBlastDayDialog';
import { useDaySummaries, type DaySummary } from '@/pages/Dashboard';

// ── Needs attention: the anti-buried-draft strip ───────────────────────────

interface AttentionRow {
  key: string;
  chip: string;
  chipVariant: 'violation' | 'warning' | 'secondary';
  title: string;
  sub?: string;
  to: string;
  /** sort: sent-back first, then patterns ready, then stale drafts */
  rank: number;
  date: string;
}

function useNeedsAttention(): AttentionRow[] | undefined {
  return useLiveQuery(async () => {
    const today = todayISO();
    const rows: AttentionRow[] = [];
    const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j]));
    const days = await db.blastDays.toArray();

    for (const day of days) {
      if (day.status !== 'draft') continue;
      // Sent-back days surface from ANY date (today included); ordinary
      // drafts only once they're stale — today's draft is just today's work
      if (!day.sendBackNote && day.date >= today) continue;
      const jobName = jobs.get(day.jobId)?.name ?? 'Unknown job';
      if (day.sendBackNote) {
        rows.push({
          key: `sb-${day.id}`,
          chip: 'sent back',
          chipVariant: 'violation',
          title: `${formatDate(day.date)} · ${jobName}`,
          sub: `Office: “${day.sendBackNote}”`,
          to: `/blast-day/${day.id}`,
          rank: 0,
          date: day.date,
        });
      } else {
        rows.push({
          key: `dr-${day.id}`,
          chip: 'draft',
          chipVariant: 'warning',
          title: `${formatDate(day.date)} · ${jobName}`,
          sub: 'unsubmitted',
          to: `/blast-day/${day.id}`,
          rank: 2,
          date: day.date,
        });
      }
    }

    // Fully-drilled open patterns waiting for the blaster's review
    const plans = await db.drillPlans.filter((p) => p.status === 'open' && !p.archivedAt).toArray();
    for (const plan of plans) {
      const holes = getPlanHoles(plan);
      if (!holes || holes.length === 0) continue;
      const drilled = (await planDrilledHoleNumbers(plan.id)).size;
      if (drilled >= holes.length) {
        rows.push({
          key: `pl-${plan.id}`,
          chip: 'drilling',
          chipVariant: 'secondary',
          title: `${plan.name} complete at ${jobs.get(plan.jobId)?.name ?? 'job'}`,
          sub: `${drilled}/${holes.length} holes — ready for your review`,
          to: `/jobs/${plan.jobId}/drill-plan/${plan.id}`,
          rank: 1,
          date: plan.updatedAt.slice(0, 10),
        });
      }
    }
    // Sent-back days lead, then patterns awaiting review, then stale
    // drafts — newest first within each; the cap applies AFTER ranking so
    // a pile of old drafts can never bury a send-back
    rows.sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date));
    return rows.slice(0, 6);
  }, []);
}

// ── Today: current day(s) with the phase + Continue ────────────────────────

function TodayDayRow({ day, jobLabel }: { day: BlastDay; jobLabel: string }) {
  const navigate = useNavigate();
  const { blastLog, shots } = useBlastDay(day.id);
  const model = useDayPhases(day, blastLog, shots);
  const phaseSub = model?.current
    ? `Phase: ${model.current.label.toLowerCase()} · ${model.current.sub}`
    : day.status === 'draft'
      ? 'ready to file'
      : `day ${day.status}`;
  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-2 text-left"
        onClick={() => navigate(`/blast-day/${day.id}`)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{jobLabel}</p>
          <p className="text-xs text-gray-400 truncate">{phaseSub}</p>
        </div>
        <Badge variant="secondary">resume</Badge>
      </button>
      {model?.current && (
        <button
          className="w-full bg-safety-orange text-white rounded-xl py-2.5 font-bold text-sm hover:bg-orange-600"
          onClick={() => navigate(`/blast-day/${day.id}?view=${model.current!.view}`)}
        >
          {model.continueLabel}
        </button>
      )}
    </div>
  );
}

// ── Months: current month open, older collapsed to a count ─────────────────

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

export function BlasterHome() {
  const navigate = useNavigate();
  const attention = useNeedsAttention();
  const summaries = useDaySummaries();
  const [search, setSearch] = useState('');
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const today = todayISO();

  const todayDays = useLiveQuery(
    async () => db.blastDays.where('date').equals(todayISO()).toArray(),
    [today],
  );
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const jobLabel = (jobId: string) => {
    const j = jobs.find((x) => x.id === jobId);
    return j ? `${j.name}${j.jobNumber ? ` · ${j.jobNumber}` : ''}` : 'Unknown job';
  };

  const months = useMemo(() => {
    const past = (summaries ?? []).filter((s) => s.day.date < today);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? past.filter(
          (s) =>
            (s.job?.name ?? '').toLowerCase().includes(q) ||
            s.day.date.includes(q) ||
            s.day.status.includes(q),
        )
      : past;
    const map = new Map<string, DaySummary[]>();
    for (const s of filtered) {
      const ym = s.day.date.slice(0, 7);
      map.set(ym, [...(map.get(ym) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [summaries, search, today]);

  return (
    <div className="space-y-4">
      {/* Band 1 — needs attention (only exists when non-empty) */}
      {attention && attention.length > 0 && (
        <div className="bg-white border border-gray-200 border-l-4 border-l-safety-orange rounded-xl px-3 py-2">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
            Needs attention · {attention.length}
          </p>
          {attention.map((row) => (
            <button
              key={row.key}
              className="w-full flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-left hover:bg-gray-50"
              onClick={() => navigate(row.to)}
            >
              <Badge variant={row.chipVariant}>{row.chip}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{row.title}</p>
                {row.sub && <p className="text-xs text-gray-400 truncate">{row.sub}</p>}
              </div>
              <span className="text-gray-300">›</span>
            </button>
          ))}
        </div>
      )}

      {/* Band 2 — today */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
          Today · {formatDate(today)}
        </p>
        {(todayDays ?? []).map((day) => (
          <TodayDayRow key={day.id} day={day} jobLabel={jobLabel(day.jobId)} />
        ))}
        {todayDays !== undefined && todayDays.length === 0 && (
          <p className="text-sm text-gray-400 py-1">No work recorded today yet.</p>
        )}
        <button
          className="w-full bg-white border border-gray-300 text-navy rounded-xl py-2.5 font-bold text-sm mt-2 hover:bg-gray-50"
          onClick={() => setShowNewDialog(true)}
        >
          {(todayDays ?? []).length > 0 ? 'Start work at another job' : 'Start work at a job'}
        </button>
      </div>

      {/* Band 3 — months, current open, older collapsed */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase flex-1">
            Recent days
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
            {search.trim() ? 'No days match.' : 'No past days yet.'}
          </p>
        )}
      </div>

      {showNewDialog && (
        <NewBlastDayDialog
          onClose={() => setShowNewDialog(false)}
          onCreate={async (jobId, date, copy, opts) => {
            const id = await createBlastDay(jobId, date, copy, opts);
            setShowNewDialog(false);
            navigate(`/blast-day/${id}`);
          }}
        />
      )}
    </div>
  );
}
