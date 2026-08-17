import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
import { formatDate } from '@/lib/utils';
import { RecordShell } from '@/components/layout/RecordShell';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { getSessionUser } from '@/lib/session';
import { JobContactsCard } from '@/components/forms/JobContactsCard';
import { matchesWorkRow, workedRow } from '@/lib/personHistory';
import { matchesAsset } from '@/lib/equipmentHistory';
import { buildDocRows } from '@/lib/docRows';
import { DocList } from '@/components/records/DocList';
import { canPerformOp, derivedKFactor, fitKFactor, powderFactor, scaledDistance, type Role } from '@shotlog/shared';
import { createDrillPlan, getPlanHoles } from '@/hooks/useDrillPlans';
import { useJobContext, type JobContext } from '@/lib/jobContext';
import { nowISO } from '@/lib/utils';
import type { Job, KFactorHistoryEntry } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const job = useLiveQuery(() => (id ? db.jobs.get(id) : undefined), [id]);
  const ctx = useJobContext(id);

  const blastDays =
    useLiveQuery(async () => {
      if (!id) return [];
      const days = await db.blastDays.where('jobId').equals(id).sortBy('date');
      return days.reverse();
    }, [id]) ?? [];

  const planCount =
    useLiveQuery(() => (id ? db.drillPlans.where('jobId').equals(id).count() : 0), [id]) ?? 0;

  // Aggregate shots + explosives across the job's history for the stats bar
  const stats = useLiveQuery(async () => {
    if (!id) return { shots: 0, totalLbs: 0, totalYards: 0 };
    const days = await db.blastDays.where('jobId').equals(id).toArray();
    let shots = 0;
    let totalLbs = 0;
    let totalYards = 0;
    for (const day of days) {
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (!log) continue;
      const dayShots = await db.shots.where('blastLogId').equals(log.id).toArray();
      shots += dayShots.length;
      totalYards += dayShots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
      const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      totalLbs += usage?.totalPoundsShot ?? 0;
    }
    return { shots, totalLbs, totalYards };
  }, [id]) ?? { shots: 0, totalLbs: 0, totalYards: 0 };

  if (!job) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }

  const avgPF = stats.totalYards > 0 ? powderFactor(stats.totalLbs, stats.totalYards) : 0;
  const isAdmin = getSessionUser()?.role === 'admin';
  const status = job.jobStatus ?? (job.isActive ? 'active' : 'complete');

  return (
    <RecordShell
      breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        ...(ctx?.customer ? [{ label: ctx.customerName, to: `/customers/${ctx.customer.id}` }] : []),
        ...(ctx?.site ? [{ label: ctx.siteName, to: `/sites/${ctx.site.id}` }] : []),
      ]}
      title={`${job.jobNumber ? `${job.jobNumber} · ` : ''}${job.name}`}
      badge={<Badge variant={status === 'active' ? 'compliant' : 'draft'}>{status}</Badge>}
      subline={
        [ctx?.address, ctx?.city, ctx?.state].filter(Boolean).join(', ') || 'No address'
      }
      stats={[
        { label: 'Blast Days', value: String(blastDays.length) },
        { label: 'Total Shots', value: String(stats.shots) },
        { label: 'Site K', value: String(ctx?.kFactor ?? job.kFactor ?? '—') },
        { label: 'Avg PF', value: avgPF > 0 ? avgPF.toFixed(2) : '—' },
      ]}
      sections={[
        {
          id: 'setup',
          label: 'Setup',
          summary: [job.jobNumber, ctx?.customerName, job.operation].filter(Boolean).join(' · '),
          render: () => (
            <div className="space-y-4">
              <CustomerSiteCard job={job} ctx={ctx} />
              <JobConfigCard job={job} />
            </div>
          ),
        },
        {
          id: 'contacts',
          label: 'Contacts',
          count: ctx?.contacts.length || undefined,
          summary: ctx?.contacts[0]
            ? `${ctx.contacts[0].name}${ctx.contacts[0].phone ? ` · ${ctx.contacts[0].phone}` : ''}`
            : 'none yet',
          render: () => (
            <JobContactsCard
              job={ctx?.site ? { ...job, contacts: ctx.contacts, contactNotes: ctx.contactNotes } : job}
              siteId={job.siteId}
              readOnly={!isAdmin}
            />
          ),
        },
        {
          id: 'site-k',
          label: 'Site K calibration',
          summary: `current K ${ctx?.kFactor ?? job.kFactor ?? '—'}`,
          defaultOpen: false,
          preview: () => (
            <p className="text-sm text-gray-500">
              Back-calculates K from this job's measured seismo readings. Current site default:{' '}
              <b>{ctx?.kFactor ?? job.kFactor ?? '—'}</b>.
            </p>
          ),
          render: () => <SiteKCard job={job} />,
        },
        {
          id: 'drill-plans',
          label: 'Drill plans',
          count: planCount || undefined,
          summary: planCount ? `${planCount} plan${planCount === 1 ? '' : 's'}` : 'none yet',
          render: () => <DrillPlansCard jobId={job.id} />,
        },
        {
          id: 'work-days',
          label: 'Work days',
          count: blastDays.length,
          summary: blastDays[0] ? `latest ${formatDate(blastDays[0].date)}` : 'none yet',
          render: () => (
            <div className="space-y-2">
              {blastDays.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">No blast days yet.</p>
              )}
              {blastDays.map((day) => (
                <button
                  key={day.id}
                  className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 active:bg-gray-100 min-h-[44px]"
                  onClick={() => navigate(`/blast-day/${day.id}`)}
                >
                  <span className="text-sm font-medium">
                    {day.name ? `${day.name} · ` : ''}
                    {formatDate(day.date)}
                  </span>
                  <Badge variant={day.status as 'draft' | 'submitted' | 'approved'}>
                    {day.status}
                  </Badge>
                </button>
              ))}
            </div>
          ),
        },
        {
          id: 'activity',
          label: 'Activity',
          summary: 'crew, equipment, documents',
          defaultOpen: false,
          preview: () => (
            <p className="text-sm text-gray-500">
              Who worked this job, the equipment used, and every document — open for the full
              rollup.
            </p>
          ),
          render: () => <JobActivity jobId={job.id} lbs={stats.totalLbs} />,
        },
      ]}
    />
  );
}

/** The whole job at a glance: totals, crew who worked it, equipment used,
 *  and every document — the office's per-job record view. */
function JobActivity({ jobId, lbs }: { jobId: string; lbs: number }) {
  const navigate = useNavigate();
  const role = getSessionUser()?.role ?? '';
  const showHours = role === 'admin' || role === 'office' || role === 'supervisor';

  const activity = useLiveQuery(async () => {
    const days = await db.blastDays.where('jobId').equals(jobId).toArray();
    const roster = await db.crewMembers.toArray();
    const equipment = await db.equipment.toArray();
    const byType: Record<string, number> = {};
    let footage = 0;
    let crewHours = 0;
    const crew = new Map<string, { name: string; role?: string; crewId?: string; days: number; hours: number }>();
    const assets = new Map<string, { id?: string; label: string }>();
    for (const day of days) {
      byType[day.typeOfWork ?? 'unknown'] = (byType[day.typeOfWork ?? 'unknown'] ?? 0) + 1;
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (log) {
        const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
        for (const s of shots) footage += s.totals.totalDrillFootage;
      }
      const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
      if (report) {
        const rows = await db.workForceEntries.where('dailyReportId').equals(report.id).toArray();
        for (const row of rows) {
          if (!workedRow(row)) continue;
          const member = roster.find((c) => matchesWorkRow(row, c));
          const key = member?.id ?? row.workerName.trim().toLowerCase();
          const hours = row.straightTime + row.overtime;
          crewHours += hours;
          const entry = crew.get(key) ?? {
            name: member?.name ?? row.workerName,
            role: member?.role,
            crewId: member?.id,
            days: 0,
            hours: 0,
          };
          entry.days += 1;
          entry.hours += hours;
          crew.set(key, entry);
        }
        const equipRows = await db.equipmentEntries.where('dailyReportId').equals(report.id).toArray();
        for (const e of equipRows) {
          if (!(e.hoursEnd > e.hoursStart)) continue; // only assets actually used
          const match = equipment.find((eq) => matchesAsset(e, eq));
          assets.set(match?.id ?? e.assetNumber, {
            id: match?.id,
            label: match?.assetNumber ?? e.assetNumber,
          });
        }
      }
    }
    // rigs from the job's drill logs count as used
    const drillLogs = await db.drillLogs.filter((l) => l.jobId === jobId).toArray();
    for (const l of drillLogs) {
      if (!l.drillRigEquipmentId) continue;
      const eq = equipment.find((x) => x.id === l.drillRigEquipmentId);
      if (eq) assets.set(eq.id, { id: eq.id, label: eq.assetNumber });
    }
    const incidents = await db.incidents.filter((i) => i.jobId === jobId && i.status !== 'closed').count();
    return {
      days: days.length,
      byType,
      footage,
      crewHours,
      incidents,
      crew: [...crew.values()].sort((a, b) => b.days - a.days),
      assets: [...assets.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    };
  }, [jobId]);

  const docs = useLiveQuery(async () => {
    const rows = await buildDocRows({ scope: 'company', role: role || 'admin' });
    return rows.filter((r) => r.jobId === jobId);
  }, [jobId]);

  const typeLine = useMemo(
    () =>
      Object.entries(activity?.byType ?? {})
        .map(([t, n]) => `${n} ${t.split('_').map((w) => w[0]?.toUpperCase()).join('')}`)
        .join(' · '),
    [activity?.byType],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatBox label={`Days${typeLine ? ` (${typeLine})` : ''}`} value={String(activity?.days ?? '—')} />
        <StatBox label="Ft Drilled" value={activity ? activity.footage.toFixed(0) : '—'} />
        <StatBox label="Lbs Shot" value={lbs ? lbs.toFixed(0) : '—'} />
        <StatBox label="Open Incidents" value={String(activity?.incidents ?? '—')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Crew{showHours && activity ? ` · ${+activity.crewHours.toFixed(1)} total hrs` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(activity?.crew ?? []).map((c) => (
            <button
              key={c.crewId ?? c.name}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg disabled:hover:bg-transparent"
              disabled={!c.crewId}
              onClick={() => c.crewId && navigate(`/crew/${c.crewId}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {c.name}
                  {!c.crewId && <span className="text-xs text-gray-400"> · not on roster</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {c.role ? `${c.role} · ` : ''}
                  {c.days} day{c.days === 1 ? '' : 's'}
                  {showHours ? ` · ${+c.hours.toFixed(1)} hrs` : ''}
                </p>
              </div>
              {c.crewId && <span className="text-xs text-gray-400">›</span>}
            </button>
          ))}
          {activity !== undefined && activity.crew.length === 0 && (
            <p className="text-sm text-gray-400 py-1">No logged hours yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipment used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {(activity?.assets ?? []).map((a) => (
              <button
                key={a.id ?? a.label}
                className="px-2 py-1 rounded-md border border-gray-300 text-xs font-mono font-semibold text-navy hover:bg-gray-50 disabled:text-gray-400"
                disabled={!a.id}
                onClick={() => a.id && navigate(`/equipment/${a.id}`)}
              >
                {a.label}
              </button>
            ))}
            {activity !== undefined && activity.assets.length === 0 && (
              <p className="text-sm text-gray-400">No equipment hours logged yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <DocList rows={docs} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Site K calibration: back-calculate K from the job's own seismograph
 * history (K = PPV × SD^1.6 per reading, SD from the shot's design plan —
 * i.e. assuming the seismograph sits at the structure of concern). The
 * geometric mean is the site's typical response; the ENVELOPE (worst
 * reading) is the conservative choice — predictions made with it never
 * under-called any measured shot. Applying updates the job default; every
 * shot's design can still override.
 */
/** Standalone drill plans for this job — Mark's plan-ahead workflow: author
 *  here, drillers work it over days, the blast report imports the result. */
function DrillPlansCard({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'driller') as Role;
  const canCreate = canPerformOp('drillPlans', 'PUT', role);
  const plans = useLiveQuery(
    async () =>
      (await db.drillPlans.where('jobId').equals(jobId).toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [jobId],
  );
  const rows = useLiveQuery(async () => {
    const out = [];
    for (const plan of (plans ?? []).slice(0, 5)) {
      const holes = getPlanHoles(plan)?.length ?? 0;
      const logs = await db.drillLogs.filter((l) => l.drillPlanId === plan.id).toArray();
      let drilled = 0;
      for (const l of logs) drilled += await db.drillLogHoles.where('drillLogId').equals(l.id).count();
      out.push({ plan, holes, drilled });
    }
    return out;
  }, [plans?.map((p) => p.id + p.updatedAt).join(',')]);
  if (!canCreate && (plans ?? []).length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Drill Plans</CardTitle>
        {canCreate && (
          <Button size="sm" variant="outline"
            onClick={() =>
              void createDrillPlan(jobId).then((id) => navigate(`/jobs/${jobId}/drill-plan/${id}`))
            }>
            New Drill Plan
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {(rows ?? []).map(({ plan, holes, drilled }) => (
          <button
            key={plan.id}
            className="w-full flex items-center gap-2 py-2 px-2 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate(`/jobs/${jobId}/drill-plan/${plan.id}`)}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{plan.name}</p>
              <p className="text-xs text-gray-400">
                {drilled} of {holes} holes drilled · {formatDate(plan.createdAt.slice(0, 10))}
              </p>
            </div>
            <Badge variant={plan.status === 'complete' ? 'approved' : 'draft'}>{plan.status}</Badge>
          </button>
        ))}
        {(rows ?? []).length === 0 && (
          <p className="text-sm text-gray-400">
            Plan drilling ahead of the blast — build the pattern here and send it to
            your drillers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SiteKCard({ job }: { job: Job }) {
  const site = useLiveQuery(() => (job.siteId ? db.sites.get(job.siteId) : undefined), [job.siteId]);
  const isAdmin = getSessionUser()?.role === 'admin';
  // Re-run once after mount: on a fresh page load, live queries can resolve
  // empty before local hydration finishes and never re-fire on their own
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTick(1), 1500);
    return () => clearTimeout(t);
  }, []);
  const calib = useLiveQuery(async () => {
    const days = await db.blastDays.where('jobId').equals(job.id).toArray();
    const entries: KFactorHistoryEntry[] = [];
    for (const day of days) {
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (!log) continue;
      const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
      for (const shot of shots) {
        const d = shot.designPlan.closestStructureDistance;
        const w = shot.designPlan.maxPoundsPerDelay;
        if (!(d > 0) || !(w > 0)) continue;
        const sd = scaledDistance(d, w);
        // Projection: readings carry printout photos — never revive those
        // blobs just to read three PPV numbers
        const readings = await getPowerSync().getAll<{
          ppvTran: number; ppvVert: number; ppvLong: number;
        }>(
          `SELECT json_extract(payload,'$.ppvTran') AS ppvTran,
                  json_extract(payload,'$.ppvVert') AS ppvVert,
                  json_extract(payload,'$.ppvLong') AS ppvLong
           FROM records
           WHERE table_name = 'seismoReadings'
             AND json_extract(payload,'$.shotId') = ?`,
          [shot.id],
        );
        for (const r of readings) {
          const ppv = Math.max(r.ppvTran ?? 0, r.ppvVert ?? 0, r.ppvLong ?? 0);
          if (!(ppv > 0)) continue;
          entries.push({
            date: day.date,
            actualPPV: ppv,
            sd: +sd.toFixed(2),
            derivedK: Math.round(derivedKFactor(ppv, sd)),
          });
        }
      }
    }
    const fit = fitKFactor(entries.map((e) => ({ ppv: e.actualPPV, sd: e.sd })));
    return { entries, fit };
  }, [job.id, tick]);

  const apply = (value: number) => {
    const changes = {
      kFactor: value,
      // snapshot the evidence the number came from
      kFactorHistory: (calib?.entries ?? []).slice(-200),
      updatedAt: nowISO(),
    };
    // K belongs to the SITE (the ground) — legacy jobs fall back to the job
    if (site) void db.sites.update(site.id, changes);
    else void db.jobs.update(job.id, changes);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Site K calibration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!calib || calib.entries.length === 0 ? (
          <p className="text-sm text-gray-400">
            No usable seismograph history yet — readings calibrate K once shots have a structure
            distance, max lbs/delay, and measured PPV.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              From <b>{calib.fit!.n}</b> measured reading{calib.fit!.n === 1 ? '' : 's'} on this
              site: typical K ≈ <b>{calib.fit!.bestFit}</b>, conservative envelope K ≈{' '}
              <b>{calib.fit!.envelope}</b> (no measured shot exceeded a prediction made with it).
              Current site default: <b>{site?.kFactor ?? job.kFactor}</b>.
            </p>
            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                {(site?.kFactor ?? job.kFactor) !== calib.fit!.envelope && (
                  <Button size="sm" onClick={() => apply(calib.fit!.envelope)}>
                    Use envelope {calib.fit!.envelope} (safe)
                  </Button>
                )}
                {(site?.kFactor ?? job.kFactor) !== calib.fit!.bestFit && (
                  <Button size="sm" variant="outline" onClick={() => apply(calib.fit!.bestFit)}>
                    Use typical {calib.fit!.bestFit}
                  </Button>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              Assumes readings were taken at the structure of concern (SD from each shot's design
              distance and max lbs/delay). New shots inherit the site default; any shot's design
              can still override its K.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Where this job sits in the hierarchy — the site owns the ground facts */
function CustomerSiteCard({ job, ctx }: { job: Job; ctx: JobContext | undefined }) {
  const navigate = useNavigate();
  if (!job.siteId && !job.customer) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer &amp; Site</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-20 text-xs">Customer</span>
          {ctx?.customer ? (
            <button className="font-medium text-navy underline" onClick={() => navigate(`/customers/${ctx.customer!.id}`)}>
              {ctx.customerName}
            </button>
          ) : (
            <span className="font-medium">{ctx?.customerName || '—'}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-20 text-xs">Site</span>
          {ctx?.site ? (
            <button className="font-medium text-navy underline text-left" onClick={() => navigate(`/sites/${ctx.site!.id}`)}>
              {ctx.siteName}
            </button>
          ) : (
            <span className="font-medium">{[ctx?.address, ctx?.city, ctx?.state].filter(Boolean).join(', ') || '—'}</span>
          )}
        </div>
        <p className="text-xs text-gray-400 pt-1">
          Address, state, Site K, local limits, and jobsite contacts live on the site —
          every job here inherits them.
        </p>
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="font-mono text-lg font-bold text-navy">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

const JOB_STATUS_OPTIONS = [
  { value: 'quoted', label: 'Quoted' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'complete', label: 'Complete' },
];

function JobConfigCard({ job }: { job: Job }) {
  const { draft, setField } = useDraftRecord(db.jobs, job);
  // Jobs are admin-managed (spec §A3) — everyone else sees them read-only
  const readOnly = getSessionUser()?.role !== 'admin';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Job Configuration
          {readOnly && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              read-only — managed by your office admin
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          readOnly
            ? 'pointer-events-none select-none opacity-70 grid grid-cols-1 sm:grid-cols-2 gap-3'
            : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
        }
      >
        <div>
          <Label className="text-xs">Job Name</Label>
          <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">
              Job #<span className="text-gray-400 font-normal"> — auto, editable</span>
            </Label>
            <Input
              value={draft.jobNumber ?? ''}
              placeholder="26-041"
              onChange={(e) => setField('jobNumber', e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Customer PO</Label>
            <Input
              value={draft.customerPO ?? ''}
              onChange={(e) => setField('customerPO', e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={draft.jobStatus ?? (draft.isActive ? 'active' : 'complete')}
            onChange={(e) => {
              const status = e.target.value as NonNullable<Job['jobStatus']>;
              setField('jobStatus', status);
              // isActive stays the legacy mirror every list/picker filters on
              setField('isActive', status === 'active' || status === 'quoted');
            }}
            options={JOB_STATUS_OPTIONS}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">Start</Label>
            <Input
              type="date"
              value={draft.startDate ?? ''}
              onChange={(e) => setField('startDate', e.target.value || undefined)}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Target end</Label>
            <Input
              type="date"
              value={draft.targetDate ?? ''}
              onChange={(e) => setField('targetDate', e.target.value || undefined)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Quote ref</Label>
          <Input
            value={draft.quoteRef ?? ''}
            onChange={(e) => setField('quoteRef', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Engineer of record</Label>
          <Input
            value={draft.engineerOfRecord ?? ''}
            onChange={(e) => setField('engineerOfRecord', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Type of Rock</Label>
          <Input value={draft.typeOfRock} onChange={(e) => setField('typeOfRock', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Type of Terrain</Label>
          <Input
            value={draft.typeOfTerrain}
            onChange={(e) => setField('typeOfTerrain', e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
