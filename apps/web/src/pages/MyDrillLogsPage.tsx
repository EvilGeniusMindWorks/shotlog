// The driller's own record book: every drill log they've filed, any status,
// searchable — the recall Matthew asked for. Print/PDF live at the log level
// (open a log → printer icon), not on rows.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

export function MyDrillLogsPage() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const rows = useLiveQuery(async () => {
    const logs = await db.drillLogs
      .filter((l) => !me?.id || l.drillerUserId === me.id)
      .toArray();
    const out = [];
    for (const log of logs) {
      const job = await db.jobs.get(log.jobId);
      const day = await db.blastDays.get(log.blastDayId);
      const shot = await db.shots.get(log.shotId);
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      out.push({
        log,
        jobName: job?.name ?? '—',
        dayName: day?.name,
        date: day?.date ?? log.createdAt.slice(0, 10),
        shotNumber: shot?.shotNumber,
        holes: holes.length,
        footage: holes.reduce((s, h) => s + h.actualDepth, 0),
        wet: holes.filter((h) => h.conditions.some((c) => c.code === 'W')).length,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.log.createdAt.localeCompare(a.log.createdAt));
  }, [me?.id]);

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (statusFilter !== 'all') list = list.filter((r) => r.log.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.jobName.toLowerCase().includes(q) ||
          (r.dayName ?? '').toLowerCase().includes(q) ||
          r.date.includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Drill Logs</h2>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by job, day name, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2">
        {['all', 'open', 'complete', 'accepted'].map((s) => (
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

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {filtered.map((r) => (
          <button
            key={r.log.id}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
            onClick={() => navigate(`/blast-day/${r.log.blastDayId}/drill-log/${r.log.id}`)}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {formatDate(r.date)} · {r.dayName || r.jobName} · Shot {r.shotNumber ?? '?'}
              </p>
              <p className="text-xs text-gray-400">
                {r.holes} holes · {r.footage.toFixed(0)} ft
                {r.wet > 0 && <span className="text-blue-600"> · {r.wet} wet</span>}
                {r.log.assignedBy && ` · sent by ${r.log.assignedBy}`}
              </p>
            </div>
            {r.log.reopenNote && r.log.status === 'open' && (
              <Badge variant="violation">sent back</Badge>
            )}
            <Badge variant={STATUS_BADGE[r.log.status]}>{r.log.status}</Badge>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            {search || statusFilter !== 'all' ? 'No logs match.' : 'No drill logs yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
