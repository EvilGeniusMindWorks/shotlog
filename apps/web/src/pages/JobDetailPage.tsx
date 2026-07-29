import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
import { cn, formatDate } from '@/lib/utils';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { getSessionUser } from '@/lib/session';
import { JobContactsCard } from '@/components/forms/JobContactsCard';
import { matchesWorkRow, workedRow } from '@/lib/personHistory';
import { matchesAsset } from '@/lib/equipmentHistory';
import { buildDocRows } from '@/lib/docRows';
import { DocList } from '@/components/records/DocList';
import { derivedKFactor, fitKFactor, powderFactor, scaledDistance } from '@shotlog/shared';
import { nowISO } from '@/lib/utils';
import type { Job, KFactorHistoryEntry } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<'details' | 'activity'>('details');
  const job = useLiveQuery(() => (id ? db.jobs.get(id) : undefined), [id]);

  const blastDays =
    useLiveQuery(async () => {
      if (!id) return [];
      const days = await db.blastDays.where('jobId').equals(id).sortBy('date');
      return days.reverse();
    }, [id]) ?? [];

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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{job.name}</h2>
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {[job.address, job.city, job.state].filter(Boolean).join(', ') || 'No address'}
          </p>
        </div>
        <Badge variant={job.isActive ? 'compliant' : 'draft'}>
          {job.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {/* Details = config; Activity = who/what/documents across the job */}
      <div className="px-4 pt-3 flex gap-2">
        {(['details', 'activity'] as const).map((v) => (
          <button
            key={v}
            className={cn(
              'min-h-[38px] px-4 rounded-full border text-sm font-medium capitalize',
              view === v ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-300',
            )}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'details' ? (
      <div className="p-4 space-y-4">
        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Blast Days" value={String(blastDays.length)} />
          <StatBox label="Total Shots" value={String(stats.shots)} />
          <StatBox label="Site K" value={String(job.kFactor)} />
          <StatBox label="Avg PF" value={avgPF > 0 ? avgPF.toFixed(2) : '—'} />
        </div>

        <JobContactsCard job={job} readOnly={getSessionUser()?.role !== 'admin'} />
        <JobConfigCard job={job} />
        <SiteKCard job={job} />

        {/* Blast day history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blast Day History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>
      </div>
      ) : (
        <JobActivity jobId={job.id} lbs={stats.totalLbs} />
      )}
    </div>
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
    <div className="p-4 space-y-4">
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
function SiteKCard({ job }: { job: Job }) {
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
    void db.jobs.update(job.id, {
      kFactor: value,
      // snapshot the evidence the number came from
      kFactorHistory: (calib?.entries ?? []).slice(-200),
      updatedAt: nowISO(),
    });
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
              Current site default: <b>{job.kFactor}</b>.
            </p>
            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                {job.kFactor !== calib.fit!.envelope && (
                  <Button size="sm" onClick={() => apply(calib.fit!.envelope)}>
                    Use envelope {calib.fit!.envelope} (safe)
                  </Button>
                )}
                {job.kFactor !== calib.fit!.bestFit && (
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="font-mono text-lg font-bold text-navy">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

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
        <div>
          <Label className="text-xs">Customer</Label>
          <Input value={draft.customer} onChange={(e) => setField('customer', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Input value={draft.address} onChange={(e) => setField('address', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">City</Label>
          <Input value={draft.city} onChange={(e) => setField('city', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">State</Label>
          <Input
            value={draft.state}
            onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
          />
        </div>
        <div>
          <Label className="text-xs">
            Site K
            <span className="text-gray-400 font-normal">
              {' '}
              — the default for new shots; each shot's design can override it
            </span>
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={draft.kFactor || ''}
            onChange={(e) => setField('kFactor', parseFloat(e.target.value) || 0)}
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
        <div>
          <Label className="text-xs">
            Local Regulation
            <span className="text-gray-400 font-normal"> — e.g. Whately Bylaw</span>
          </Label>
          <Input
            value={draft.localRegName ?? ''}
            onChange={(e) => setField('localRegName', e.target.value)}
            placeholder="None"
          />
        </div>
        <div>
          <Label className="text-xs">
            Local PPV Limit (in/s)
            <span className="text-gray-400 font-normal"> — most restrictive wins</span>
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={draft.localPPVLimit || ''}
            onChange={(e) => setField('localPPVLimit', parseFloat(e.target.value) || 0)}
            placeholder="—"
          />
        </div>
      </CardContent>
    </Card>
  );
}
