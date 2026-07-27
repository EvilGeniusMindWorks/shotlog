// Unified recall for every field role: everything YOU filed — blast logs,
// daily reports, drill logs, rig checklists, incidents — chronological and
// searchable, with "filed vN" chips that open the archived office PDF.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { cn, formatDate } from '@/lib/utils';
import type { Submission } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface Row {
  key: string;
  kind: 'blast_log' | 'daily_report' | 'drill_log' | 'drill_checklist' | 'incident';
  date: string;
  title: string;
  sub: string;
  status: string;
  statusVariant: 'draft' | 'submitted' | 'approved';
  to: string;
  /** sourceId used to look up filed office copies */
  sourceId: string;
}

const KIND_LABEL: Record<Row['kind'], string> = {
  blast_log: 'Blast Log',
  daily_report: 'Daily Report',
  drill_log: 'Drill Log',
  drill_checklist: 'Checklist',
  incident: 'Incident',
};

const DAY_STATUS_VARIANT = { draft: 'draft', submitted: 'submitted', approved: 'approved' } as const;

export function MyRecordsPage() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const role = me?.role ?? 'blaster';
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');

  const rows = useLiveQuery(async () => {
    const out: Row[] = [];
    const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));

    // My drill logs
    const logs = await db.drillLogs.filter((l) => !me?.id || l.drillerUserId === me.id).toArray();
    for (const log of logs) {
      const day = await db.blastDays.get(log.blastDayId);
      const shot = await db.shots.get(log.shotId);
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).count();
      out.push({
        key: `dl-${log.id}`,
        kind: 'drill_log',
        date: day?.date ?? log.createdAt.slice(0, 10),
        title: `${day?.name || jobs.get(log.jobId) || '—'} · Shot ${shot?.shotNumber ?? '?'}`,
        sub: `${holes} holes`,
        status: log.status,
        statusVariant: log.status === 'accepted' ? 'approved' : log.status === 'complete' ? 'submitted' : 'draft',
        to: `/blast-day/${log.blastDayId}/drill-log/${log.id}`,
        sourceId: log.id,
      });
    }

    // My rig checklists
    const checklists = await db.drillChecklists
      .filter((c) => !me?.id || c.drillerUserId === me.id)
      .toArray();
    for (const c of checklists) {
      const rig = await db.equipment.get(c.equipmentId);
      out.push({
        key: `cl-${c.id}`,
        kind: 'drill_checklist',
        date: c.date,
        title: `Rig checklist — ${rig?.assetNumber ?? c.equipmentId}`,
        sub: c.outOfService ? 'OUT OF SERVICE' : c.repairsNote ? 'repairs noted' : 'all good',
        status: 'filed',
        statusVariant: 'approved',
        to: `/drill-checklist-print/${c.id}`,
        sourceId: c.id,
      });
    }

    // My incidents (matched by reporter name — incidents predate user ids)
    const incidents = await db.incidents
      .filter((i) => !me?.name || i.reportedByName === me.name)
      .toArray();
    for (const i of incidents) {
      out.push({
        key: `in-${i.id}`,
        kind: 'incident',
        date: i.date,
        title: `${i.type} incident — ${i.jobId ? jobs.get(i.jobId) ?? '' : ''}`,
        sub: i.description.slice(0, 60),
        status: i.status.replace('_', ' '),
        statusVariant: i.status === 'closed' ? 'approved' : i.status === 'office_review' ? 'submitted' : 'draft',
        to: `/incident/${i.id}`,
        sourceId: i.id,
      });
    }

    // Blast logs + daily reports (blaster-and-up see the company's days —
    // they're the ones filing them)
    if (role !== 'driller' && role !== 'mechanic') {
      const days = await db.blastDays.toArray();
      for (const day of days) {
        const label = day.name || jobs.get(day.jobId) || day.date;
        const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
        if (log) {
          out.push({
            key: `bl-${log.id}`,
            kind: 'blast_log',
            date: day.date,
            title: `Blast Log — ${label}`,
            sub: jobs.get(day.jobId) ?? '',
            status: day.status,
            statusVariant: DAY_STATUS_VARIANT[day.status],
            to: `/blast-day/${day.id}`,
            sourceId: log.id,
          });
        }
        const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
        out.push({
          key: `dr-${day.id}`,
          kind: 'daily_report',
          date: day.date,
          title: `Daily Report — ${label}`,
          sub: jobs.get(day.jobId) ?? '',
          status: day.status,
          statusVariant: DAY_STATUS_VARIANT[day.status],
          to: `/blast-day/${day.id}`,
          sourceId: report?.id ?? day.id,
        });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [me?.id, role]);

  // sourceId → filed versions (newest first) for the "filed vN" chips
  const submissions = useLiveQuery(() => db.submissions.toArray());
  const filedBySource = useMemo(() => {
    const map = new Map<string, Submission[]>();
    for (const s of submissions ?? []) {
      map.set(s.sourceId, [...(map.get(s.sourceId) ?? []), s]);
    }
    for (const list of map.values()) list.sort((a, b) => b.version - a.version);
    return map;
  }, [submissions]);

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
      .map((k) => ({ value: k, label: KIND_LABEL[k] })),
  ];

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Records</h2>

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
        {filtered.map((r) => {
          const filed = filedBySource.get(r.sourceId) ?? [];
          return (
            <div key={r.key} className="flex items-center gap-2 px-3 py-2.5">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(r.to)}>
                <p className="text-sm font-semibold truncate">
                  {formatDate(r.date)} · {r.title}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {KIND_LABEL[r.kind]}
                  {r.sub ? ` · ${r.sub}` : ''}
                </p>
              </button>
              {filed.length > 0 && (
                <button
                  className="text-[11px] font-medium text-navy bg-navy-50 border border-navy/20 rounded-full px-2 py-0.5"
                  title="Open the filed office copy"
                  onClick={() => window.open(URL.createObjectURL(filed[0].pdf), '_blank')}
                >
                  filed v{filed[0].version}
                </button>
              )}
              <Badge variant={r.statusVariant}>{r.status}</Badge>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            {search || kindFilter !== 'all' ? 'Nothing matches.' : 'Nothing filed yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
