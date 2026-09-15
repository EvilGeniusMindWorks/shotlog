// Role-specific dashboard cards, per the approved mockup (v2):
// Blaster/Supervisor: today card w/ fill-out alerts + drilling-to-review
// Driller: checklist nudge + my open drill logs + my work days
// Mechanic: repair queue + due dates
// Admin/Office: job costing + compliance monitor + attention + week pulse
import { dayGate, findDayByDate, setupPath } from '@/lib/dayCard';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Wrench, X } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { createDrillPlanLog, drillLogRoute, getPlanHoles, usePlanDrilling } from '@/hooks/useDrillPlans';
import { createDrillLog, getShotPlan } from '@/hooks/useDrillLogs';
import { useMyChecklistsToday, useOpenTickets } from '@/hooks/useMaintenance';
import { getSessionUser, getRealSessionUser, setViewRole } from '@/lib/session';
import { listSubmissionSummaries, openSubmissionPdfById } from '@/lib/archive';
import { formatDate, todayISO } from '@/lib/utils';
import { fmtLbs } from '@/lib/format';
import { isBlastingWork, type BlastDay, type DrillLog, type TimeCard } from '@/db/schema';
import { dayChecklistsFor, dayCoverage, dayDrillLogsFor, plannedHoles, type Coverage } from '@/lib/dayHub';
import { myDayIds } from '@/lib/mine';
import { Dots } from './TodaysJobs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsualRigId } from './RigPickerModal';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { TimeCardRow } from '@/components/forms/TimeCardsCard';
import { canEditCard, createStandaloneTimeCard } from '@/hooks/useTimeCards';
import { buildDueServices } from '@/lib/pm';
import { holeCountsByLog, projectTable } from '@/db/projections';
import {
  applyOrder,
  clearSavedOrder,
  readSavedOrder,
  saveOrder,
  type WorklistItem,
} from '@/lib/shopQueue';
import { LocatorMap, useLocatorData } from '@/pages/EquipmentLocatorPage';

function FleetNowRow({ label, n }: { label: string; n: number | string }) {
  return (
    <div className="flex items-center gap-2 py-1 border-t border-gray-100 first:border-t-0 text-sm">
      <span className="flex-1 text-gray-600">{label}</span>
      <span className="font-mono font-bold">{n}</span>
    </div>
  );
}

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

function dayTitle(day: { name?: string }, jobName?: string) {
  return day.name || jobName || 'Work day';
}

// ── Blaster / Supervisor extras ────────────────────────────────────────────

export function TodayCard() {
  const navigate = useNavigate();
  const today = todayISO();
  const data = useLiveQuery(async () => {
    const days = await db.blastDays.filter((d) => d.date === today).toArray();
    const out = [];
    for (const day of days) {
      const job = await db.jobs.get(day.jobId);
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
      const crew = report
        ? await db.workForceEntries.where('dailyReportId').equals(report.id).toArray()
        : [];
      const reportStarted = crew.some((c) => c.timeIn || c.timeOut) || Boolean(report?.notes);
      // Dispatch alert: a shot has a drill plan but no drill log was sent/started
      let unsentPlans = 0;
      if (log) {
        const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
        for (const shot of shots) {
          if (!getShotPlan(shot)) continue;
          const logCount = await db.drillLogs.where('shotId').equals(shot.id).count();
          if (logCount === 0) unsentPlans++;
        }
      }
      out.push({
        day,
        jobName: job?.name,
        needsSignature: Boolean(log) && !log?.signatureImage,
        reportEmpty: !reportStarted,
        unsentPlans,
      });
    }
    return out;
  }, [today]);

  if (!data) return <Skeleton className="h-20 mb-3" />;
  return (
    <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3 mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Today · {formatDate(today)}
      </p>
      {data.length === 0 && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 flex-1">No work recorded today yet.</p>
        </div>
      )}
      {data.map(({ day, jobName, needsSignature, reportEmpty, unsentPlans }) => (
        <button key={day.id}
          className="w-full flex items-center gap-2 flex-wrap py-1.5 text-left hover:bg-gray-50 rounded-lg"
          onClick={() => navigate(`/blast-day/${day.id}`)}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{dayTitle(day, jobName)}</p>
            <p className="text-xs text-gray-400 truncate">{day.name ? jobName : day.date}</p>
          </div>
          <Badge variant="secondary">{(day.typeOfWork ?? '?').replace(/_/g, ' ')}</Badge>
          <Badge variant={day.status as 'draft' | 'submitted' | 'approved'}>{day.status}</Badge>
          {needsSignature && (
            <span className="text-[11px] font-medium text-safety-orange bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
              ⚠ blast log unsigned
            </span>
          )}
          {reportEmpty && (
            <span className="text-[11px] font-medium text-safety-orange bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
              ⚠ daily report empty
            </span>
          )}
          {unsentPlans > 0 && (
            <span className="text-[11px] font-medium text-safety-orange bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
              ⚠ drill plan not sent
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function DrillingReviewCard() {
  const navigate = useNavigate();
  const rows = useLiveQuery(async () => {
    const logs = await db.drillLogs.filter((l) => l.status === 'complete').toArray();
    const out = [];
    for (const log of logs) {
      const job = await db.jobs.get(log.jobId);
      const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
      const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      out.push({
        log,
        jobName: job?.name ?? '—',
        context: plan ? plan.name : `Shot ${shot?.shotNumber ?? '?'}`,
        holes: holes.length,
        wet: holes.filter((h) => h.conditions.some((c) => c.code === 'W')).length,
      });
    }
    return out;
  });
  if (!rows || rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Drilling to review · {rows.length}
      </p>
      {rows.map(({ log, jobName, context, holes, wet }) => (
        <button key={log.id}
          className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
          onClick={() => navigate(drillLogRoute(log))}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {context} — {log.drillerName || 'unassigned'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {jobName} · {holes} holes{wet > 0 ? ` · ${wet} wet` : ''}
            </p>
            {log.completionNote && (
              <p className="text-xs text-navy truncate">“{log.completionNote}”</p>
            )}
          </div>
          <Badge variant="submitted">Complete</Badge>
          <span className="text-sm text-safety-orange font-medium">Review</span>
        </button>
      ))}
    </div>
  );
}

// ── Driller home ───────────────────────────────────────────────────────────


/** Pick-your-rig modal → checklist. Remembers the choice for the nudge. */

/** Blob-free projection of every drill log — the driller home's queries
 *  share it instead of reviving signature images table-wide (perf slice) */
interface ProjectedLog {
  id: string;
  status: string;
  drillerUserId?: string;
  drillerName: string;
  assignedBy?: string;
  reopenNote?: string;
  drillPlanId?: string;
  jobId: string;
  blastDayId?: string;
  shotId?: string;
  date?: string;
  createdAt: string;
  drillRigEquipmentId?: string;
}

async function projectDrillLogs(): Promise<ProjectedLog[]> {
  const rows = await projectTable<Record<string, string | null>>('drillLogs', {
    status: 'status',
    drillerUserId: 'drillerUserId',
    drillerName: 'drillerName',
    assignedBy: 'assignedBy',
    reopenNote: 'reopenNote',
    drillPlanId: 'drillPlanId',
    jobId: 'jobId',
    blastDayId: 'blastDayId',
    shotId: 'shotId',
    date: 'date',
    createdAt: 'createdAt',
    drillRigEquipmentId: 'drillRigEquipmentId',
  });
  // SQL NULLs → undefined so the rows satisfy the app's optional fields
  return rows.map((r) => ({
    id: r.id as string,
    status: r.status ?? 'open',
    drillerUserId: r.drillerUserId ?? undefined,
    drillerName: r.drillerName ?? '',
    assignedBy: r.assignedBy ?? undefined,
    reopenNote: r.reopenNote ?? undefined,
    drillPlanId: r.drillPlanId ?? undefined,
    jobId: r.jobId ?? '',
    blastDayId: r.blastDayId ?? undefined,
    shotId: r.shotId ?? undefined,
    date: r.date ?? undefined,
    createdAt: r.createdAt ?? '',
    drillRigEquipmentId: r.drillRigEquipmentId ?? undefined,
  }));
}

/** Everything a driller could drill, one place (nav round, 2026-08-18):
 *  fresh dispatches · open plans · ready-to-drill shots. Rendered on the
 *  trio home AND as the thin /drilling page — same content, one tap from
 *  the rail without scrolling home. */
export function DrillingWork() {
  const navigate = useNavigate();
  const me = getSessionUser();

  // Fresh dispatches: the blaster sent me a plan and I haven't started
  const assigned = useLiveQuery(async () => {
    const counts = await holeCountsByLog();
    const logs = (await projectDrillLogs()).filter(
      (l) =>
        l.status === 'open' &&
        l.assignedBy &&
        (counts.get(l.id) ?? 0) === 0 &&
        (!me?.id || l.drillerUserId === me.id || !l.drillerUserId),
    );
    const out = [];
    for (const log of logs) {
      const job = await db.jobs.get(log.jobId);
      const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
      const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
      out.push({
        log,
        context: plan ? plan.name : `Shot ${shot?.shotNumber ?? '?'} · ${job?.name ?? '—'}`,
        designed: plan
          ? (getPlanHoles(plan)?.length ?? 0)
          : (getShotPlan(shot)?.length ?? shot?.totals.numHoles ?? 0),
      });
    }
    return out;
  }, [me?.id]);

  const openPlans = useLiveQuery(async () => {
    const plans = await db.drillPlans.filter((p) => p.status === 'open' && !p.archivedAt).toArray();
    const allLogs = await projectDrillLogs();
    const counts = await holeCountsByLog();
    const out = [];
    for (const plan of plans) {
      const holes = getPlanHoles(plan);
      if (!holes || holes.length === 0) continue;
      const logs = allLogs.filter((l) => l.drillPlanId === plan.id);
      let drilled = 0;
      let mineOpenToday = false;
      for (const dl of logs) {
        drilled += counts.get(dl.id) ?? 0;
        if (dl.status === 'open' && dl.drillerUserId === me?.id && dl.date === todayISO())
          mineOpenToday = true;
      }
      if (drilled >= holes.length || mineOpenToday) continue;
      const jobName = (await db.jobs.get(plan.jobId))?.name;
      out.push({ plan, jobName, target: holes.length, drilled });
    }
    return out;
  }, [me?.id]);

  // A plan I'm drilling today lives in the trio band, not here — the empty
  // state must not call the day planless (S7a rehearsal finding)
  const workingToday = useLiveQuery(
    async () =>
      // S17: a log made from a shot carries no date — its creation day counts
      (await projectDrillLogs()).some(
        (l) => l.status === 'open' && (l.date ?? l.createdAt.slice(0, 10)) === todayISO() && (!me?.id || l.drillerUserId === me.id),
      ),
    [me?.id],
  );
  const readyToDrill = useLiveQuery(async () => {
    const days = (await db.blastDays.filter((d) => d.status !== 'approved').toArray())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 15);
    const blastLogIds = new Map(
      (await projectTable<{ blastDayId: string | null }>('blastLogs', { blastDayId: 'blastDayId' })).map(
        (l) => [l.blastDayId ?? '', l.id],
      ),
    );
    const shotRows = await projectTable<{
      blastLogId: string | null;
      shotNumber: number | null;
      numHoles: number | null;
      diagram: string | null;
    }>('shots', {
      blastLogId: 'blastLogId',
      shotNumber: 'shotNumber',
      numHoles: 'totals.numHoles',
      diagram: 'designPlan.shotDiagramData',
    });
    const allLogs = await projectDrillLogs();
    const counts = await holeCountsByLog();
    const out = [];
    for (const day of days) {
      const logId = blastLogIds.get(day.id);
      if (!logId) continue;
      const shots = shotRows.filter((s) => s.blastLogId === logId);
      const jobName = (await db.jobs.get(day.jobId))?.name;
      for (const shot of shots) {
        const planHoles = getShotPlan({
          designPlan: { shotDiagramData: shot.diagram },
        } as never);
        const target = planHoles?.length ?? shot.numHoles ?? 0;
        if (!target) continue;
        const shotLogs = allLogs.filter((l) => l.shotId === shot.id);
        let drilled = 0;
        let mineOpen = false;
        for (const dl of shotLogs) {
          drilled += counts.get(dl.id) ?? 0;
          if (dl.status === 'open' && (!me?.id || dl.drillerUserId === me.id || !dl.drillerUserId))
            mineOpen = true;
        }
        if (drilled >= target || mineOpen) continue;
        out.push({
          day,
          jobName,
          shot: { id: shot.id, shotNumber: shot.shotNumber ?? 0 },
          target,
          drilled,
          joining: shotLogs.length > 0,
        });
      }
    }
    return out;
  });

  return (
    <>
      {(assigned ?? []).length > 0 && (
        <div className="rounded-xl border-2 border-navy bg-navy-50 p-3">
          <p className="text-[11px] font-semibold text-navy uppercase tracking-wider mb-1">
            📋 Assigned to you
          </p>
          {(assigned ?? []).map(({ log, context, designed }) => (
            <button
              key={log.id}
              className="w-full flex items-center gap-2 py-2 text-left hover:bg-white/60 rounded-lg"
              onClick={() => navigate(drillLogRoute(log))}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{context}</p>
                <p className="text-xs text-gray-500">
                  {designed ? `${designed} holes planned · ` : ''}sent by {log.assignedBy}
                </p>
              </div>
              <span className="text-sm text-navy font-semibold shrink-0">Open ›</span>
            </button>
          ))}
        </div>
      )}

      {(openPlans ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Open drill plans
          </p>
          {(openPlans ?? []).map(({ plan, jobName, target, drilled }) => (
            <button
              key={plan.id}
              className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 rounded-lg"
              onClick={() => {
                void createDrillPlanLog(plan).then((logId) =>
                  navigate(`/jobs/${plan.jobId}/drill-plan/${plan.id}/log/${logId}`),
                );
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{plan.name} · {jobName ?? '—'}</p>
                <p className="text-xs text-gray-400">
                  {drilled} of {target} holes drilled
                </p>
              </div>
              <span className="text-sm text-safety-orange font-semibold shrink-0">
                Today's log ›
              </span>
            </button>
          ))}
        </div>
      )}

      {(readyToDrill ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Ready to drill
          </p>
          {(readyToDrill ?? []).map(({ day, jobName, shot, target, drilled, joining }) => (
            <button
              key={shot.id}
              className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 rounded-lg"
              onClick={async () => {
                const full = await db.shots.get(shot.id);
                if (!full) return;
                const logId = await createDrillLog(full, day.id, day.jobId);
                navigate(`/blast-day/${day.id}/drill-log/${logId}`);
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  Shot {shot.shotNumber} · {day.name || jobName || formatDate(day.date)}
                </p>
                <p className="text-xs text-gray-400">
                  {drilled} of {target} holes drilled · {formatDate(day.date)}
                </p>
              </div>
              <span className="text-sm text-safety-orange font-semibold shrink-0">
                {joining ? 'Join' : 'Start'} ›
              </span>
            </button>
          ))}
        </div>
      )}

      {(assigned ?? []).length === 0 && (openPlans ?? []).length === 0 &&
        (readyToDrill ?? []).length === 0 && assigned !== undefined && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-400">
            {workingToday
              ? "Nothing else is waiting — today's pattern is above."
              : 'No drill plans yet. Ask the blaster for the job\'s drill plan — they send it to you from the job page and it shows up here. Your rig checklist and hours work without one.'}
          </p>
        </div>
      )}
    </>
  );
}

interface JobDayCard {
  day: BlastDay;
  jobName: string;
  rigLine: string;
  logLine: string;
  cardLine: string;
  coverage: Coverage;
  myLog?: DrillLog;
}

const fmtH = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`);

/** The driller's home (S17, from Matthew's six feedback reports): Today —
 *  one card per job-day I am on, opening that day's tiles; Plans sent to
 *  you; Yesterday needs you; Coming up only when a future day exists. My
 *  records and All work days live in the menu, not here. */
export function DrillerHome() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const today = todayISO();

  const homeDays = useLiveQuery(async () => {
    const mine = await myDayIds();
    const days = (await db.blastDays.toArray()).filter((d) => mine.has(d.id) && d.date >= today && d.status !== 'approved' && !d.closed);
    const out: JobDayCard[] = [];
    for (const day of days.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
      const job = await db.jobs.get(day.jobId);
      const logs = await dayDrillLogsFor(day);
      const myLogs = logs.filter((l) => l.drillerUserId === me?.id);
      const rigs = await dayChecklistsFor(day, logs);
      const myRig = rigs.find((r) => r.checklist.drillerUserId === me?.id) ?? rigs[0];
      const blastLog = await db.blastLogs.where('blastDayId').equals(day.id).first();
      const shots = blastLog ? await db.shots.where('blastLogId').equals(blastLog.id).toArray() : [];
      const planned = plannedHoles(shots);
      let holes = 0;
      for (const l of myLogs) holes += (await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()).filter((h) => !h.skipped).length;
      const card = (await db.timeCards.filter((c) => c.userId === me?.id && (c.blastDayId === day.id || (c.jobId === day.jobId && c.date === day.date))).toArray())[0];
      const open = myLogs.find((l) => l.status === 'open') ?? myLogs[0];
      // A plan sent to me that I have not started is not a day I am on yet —
      // it lives under "Plans sent to you" until the first hole
      const onlySentPlans = myLogs.length > 0 && myLogs.every((l) => l.assignedBy) && holes === 0 && !card && !rigs.some((r) => r.checklist.drillerUserId === me?.id);
      if (onlySentPlans) continue;
      out.push({
        day,
        jobName: day.name || job?.name || 'Job',
        rigLine: myRig
          ? `${myRig.asset} · ${myRig.checklist.stopHours != null ? `stopped ${fmtH(myRig.checklist.stopHours)}` : `started ${fmtH(myRig.checklist.startingHours)}`}`
          : 'No rig checklist yet',
        logLine:
          myLogs.length === 0
            ? planned > 0
              ? `Drill log · not started · plan sent, ${planned} holes`
              : 'Drill log · not started'
            : `Drill log · ${holes}${planned ? ` of ${planned}` : ''} holes · ${open?.status === 'complete' ? 'signed complete' : open?.status ?? 'open'}`,
        cardLine: card ? `My time card · ${card.status}` : 'My time card · not filed',
        coverage: await dayCoverage(day),
        myLog: open,
      });
    }
    return out;
  }, [me?.id, today]);
  const todays = (homeDays ?? []).filter((c) => c.day.date === today);
  const upcoming = (homeDays ?? []).filter((c) => c.day.date > today);

  // Plans sent to me that I have not started, and prior days' unsigned logs
  const myLogs = useLiveQuery(async () => {
    const logs = (await projectDrillLogs()).filter(
      (l) => l.status === 'open' && (!me?.id || l.drillerUserId === me.id || !l.drillerUserId),
    );
    const out = [];
    for (const log of logs) {
      const job = await db.jobs.get(log.jobId);
      const day = log.blastDayId ? await db.blastDays.get(log.blastDayId) : undefined;
      const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
      const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      const logDay = log.date ?? log.createdAt.slice(0, 10);
      out.push({
        log,
        context: plan ? plan.name : `Shot ${shot?.shotNumber ?? '?'} · ${day?.name || job?.name || '—'}`,
        sentBy: log.assignedBy ? ((await db.crewMembers.filter((m) => m.userId === log.assignedBy).first())?.name ?? '') : '',
        holes: holes.filter((h) => !h.skipped).length,
        isPrior: logDay < today,
        logDay,
        designed: plan ? (getPlanHoles(plan)?.length ?? 0) : (getShotPlan(shot)?.length ?? shot?.totals.numHoles ?? 0),
      });
    }
    return out;
  }, [me?.id, today]);
  const assignedNew = (myLogs ?? []).filter((x) => x.log.assignedBy && x.holes === 0);
  const priorLogs = (myLogs ?? []).filter((x) => x.isPrior && !(x.log.assignedBy && x.holes === 0));

  // The rig with the shop — one line, when its ticket is open
  const lastRigId = myLogs?.find((r) => r.log.drillRigEquipmentId)?.log.drillRigEquipmentId;
  const rig = useLiveQuery(() => (lastRigId ? db.equipment.get(lastRigId) : undefined), [lastRigId]);
  const tickets = useOpenTickets().filter((t) => t.equipmentId === lastRigId);

  const JobDay = ({ c }: { c: JobDayCard }) => (
    <button
      type="button"
      className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-navy"
      data-job-day={c.day.id}
      onClick={() => navigate(`/blast-day/${c.day.id}`)}
    >
      <p className="font-bold text-sm flex items-center gap-2">
        <span className="truncate">{c.jobName}</span>
        <Dots d={c.coverage} />
        {c.day.date !== today && <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{formatDate(c.day.date)}</span>}
      </p>
      <p className="text-xs text-gray-600 mt-0.5">{c.rigLine}</p>
      <p className="text-xs text-gray-600">{c.logLine}</p>
      <p className="text-xs text-gray-600">{c.cardLine}</p>
      <p className="text-[11px] font-semibold text-safety-orange mt-1">{c.myLog && c.myLog.status === 'open' ? 'Continue drilling ›' : 'Open the day ›'}</p>
    </button>
  );

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3" data-tour="home" data-driller-home>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Today · {formatDate(today)}</p>
      {todays.map((c) => (
        <JobDay key={c.day.id} c={c} />
      ))}
      {homeDays !== undefined && todays.length === 0 && (
        <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3" data-driller-home-empty>
          No job-day yet today. Start from a plan sent to you below, or tap + to log drilling at a job.
        </p>
      )}

      {assignedNew.length > 0 && (
        <div className="rounded-xl border border-gray-200 border-l-4 border-l-navy bg-white p-3" data-plans-sent>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Plans sent to you · {assignedNew.length}</p>
          {assignedNew.map(({ log, context, designed, sentBy, logDay }) => (
            <button
              key={log.id}
              type="button"
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
              data-plan-start={log.id}
              onClick={() => navigate(drillLogRoute(log))}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{context}</p>
                <p className="text-xs text-gray-400">
                  {designed} holes{sentBy ? ` · sent by ${sentBy}` : ''} · {formatDate(logDay)}
                </p>
              </div>
              <span className="text-sm font-semibold text-white bg-safety-orange rounded-lg px-3 py-1.5">Start</span>
            </button>
          ))}
        </div>
      )}

      {priorLogs.length > 0 && (
        <div className="rounded-xl border border-gray-200 border-l-4 border-l-safety-orange bg-white p-3" data-yesterday>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Yesterday needs you · {priorLogs.length}</p>
          {[...priorLogs]
            .sort((a, b) => Number(Boolean(b.log.reopenNote)) - Number(Boolean(a.log.reopenNote)) || b.logDay.localeCompare(a.logDay))
            .slice(0, 5)
            .map(({ log, context, holes, logDay }) => (
              <button key={log.id} type="button" className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg" onClick={() => navigate(drillLogRoute(log))}>
                <Badge variant="warning">unsigned</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{context}</p>
                  <p className="text-xs text-gray-400">
                    {formatDate(logDay)} · {holes} holes logged, not signed complete
                  </p>
                </div>
                {log.reopenNote && <Badge variant="violation">sent back</Badge>}
                <span className="text-gray-300">›</span>
              </button>
            ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div data-coming-up>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Coming up</p>
          {upcoming.map((c) => (
            <JobDay key={c.day.id} c={c} />
          ))}
        </div>
      )}

      {tickets.length > 0 && (
        <button type="button" className="w-full rounded-xl border border-orange-200 bg-orange-50 p-3 text-left" onClick={() => lastRigId && navigate(`/equipment/${lastRigId}`)}>
          <p className="text-sm font-medium text-safety-orange flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> {rig?.assetNumber}: “{tickets[0].description}” — with the shop ›
          </p>
        </button>
      )}
    </div>
  );
}

interface ShopWorkItem extends WorklistItem {
  kind: 'ticket' | 'service';
  equipmentId: string;
  asset: string;
  title: string;
  sub: string;
  chip: { text: string; cls: string };
}

export function MechanicHome() {
  const navigate = useNavigate();
  const tickets = useOpenTickets();
  const equipment = useLiveQuery(() => db.equipment.toArray()) ?? [];
  const assetOf = (id: string) => equipment.find((e) => e.id === id);
  const dueSoon = equipment.filter((e) => {
    const dates = [e.dotInspectionDue, e.calibrationDue].filter(Boolean) as string[];
    return dates.some((d) => (new Date(d).getTime() - Date.now()) / 86_400_000 <= 30);
  });

  // ── Round 4: the trio + ONE merged worklist the shop owns ──────────────
  const dueServices = useLiveQuery(buildDueServices, [equipment.map((e) => e.id + e.updatedAt).join(',')]);
  const { locations, pinned } = useLocatorData();
  const [orderTick, setOrderTick] = useState(0);
  const dragFrom = useRef<number | null>(null);

  const worklist = useMemo(() => {
    const items: ShopWorkItem[] = tickets.map((t) => ({
      key: `ticket:${t.id}`,
      kind: 'ticket',
      down: t.outOfService,
      date: t.createdAt.slice(0, 10),
      equipmentId: t.equipmentId,
      asset: assetOf(t.equipmentId)?.assetNumber ?? '?',
      title: t.description,
      sub: `${t.sourceType === 'drill_checklist' ? 'checklist' : 'manual'} · ${t.openedByName} · ${formatDate(t.createdAt.slice(0, 10))}`,
      chip: t.outOfService
        ? { text: 'down', cls: 'bg-red-100 text-red-700' }
        : { text: 'open', cls: 'bg-amber-100 text-amber-700' },
    }));
    for (const { equipment: eq, due } of dueServices ?? []) {
      items.push({
        key: `service:${eq.id}:${due.interval.type}`,
        kind: 'service',
        down: false,
        date: todayISO(),
        equipmentId: eq.id,
        asset: eq.assetNumber,
        title: due.interval.label,
        sub: 'assumed interval — advisory',
        chip: {
          text: `${Math.round(due.sinceHours ?? 0)}/${due.interval.intervalHours}`,
          cls: due.state === 'due' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
        },
      });
    }
    return applyOrder(items, readSavedOrder());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, dueServices, equipment, orderTick]);

  const downCount = new Set([
    ...tickets.filter((t) => t.outOfService).map((t) => t.equipmentId),
    ...equipment.filter((e) => e.isActive && e.status === 'in_shop').map((e) => e.id),
  ]).size;
  const fleetNow = {
    inService: equipment.filter((e) => e.isActive && (e.status ?? 'active') === 'active').length,
    inShop: equipment.filter((e) => e.isActive && e.status === 'in_shop').length,
    atYard: (locations ?? []).filter((l) => l.kind === 'yard').length,
  };
  const checklistsToday = useLiveQuery(async () => {
    const rigs = equipment.filter(
      (e) => e.isActive && e.status !== 'retired' && (e.category === 'rock_drill' || e.category === 'equip_drill'),
    );
    const filed = new Set(
      (await db.drillChecklists.filter((c) => c.date === todayISO()).toArray()).map((c) => c.equipmentId),
    );
    return { filed: rigs.filter((r) => filed.has(r.id)).length, total: rigs.length };
  }, [equipment.map((e) => e.id).join(',')]);

  const reorder = (from: number, to: number) => {
    const keys = worklist.map((w) => w.key);
    const [moved] = keys.splice(from, 1);
    keys.splice(to, 0, moved);
    saveOrder(keys);
    setOrderTick((t) => t + 1);
  };
  // What came in from the field: newest checklists across the whole fleet
  // (projected — checklist rows carry signature images)
  const checklists = useLiveQuery(async () =>
    (
      await projectTable<{
        equipmentId: string;
        drillerName: string | null;
        date: string;
        createdAt: string;
        outOfService: number | null;
        repairsNote: string | null;
      }>('drillChecklists', {
        equipmentId: 'equipmentId',
        drillerName: 'drillerName',
        date: 'date',
        createdAt: 'createdAt',
        outOfService: 'outOfService',
        repairsNote: 'repairsNote',
      })
    )
      .map((c) => ({ ...c, repairsNote: c.repairsNote ?? '', outOfService: Boolean(c.outOfService) }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 15),
  );
  // Fleet strip: the machinery the shop owns (skip road-fleet paperwork rows)
  const fleet = equipment
    .filter((e) => e.isActive)
    .sort((a, b) => {
      const rank = (x: (typeof equipment)[number]) =>
        x.status === 'in_shop' ? 0 : x.status === 'retired' ? 2 : 1;
      return rank(a) - rank(b) || a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true });
    });

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-3" data-tour="home">
      <h2 className="text-xl font-bold text-gray-900">My Shop</h2>

      {/* The shop trio (Round 4): Down · Tickets · Due soon */}
      <div className="flex gap-2 max-w-md" data-tour="shop-trio">
        <div className="flex-1 bg-white border border-red-200 rounded-xl px-2 py-2.5 text-center">
          <p className="font-mono text-2xl font-extrabold text-red-600">{downCount}</p>
          <p className="text-[11px] font-semibold text-gray-500">Down</p>
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-2 py-2.5 text-center">
          <p className="font-mono text-2xl font-extrabold text-navy">{tickets.length}</p>
          <p className="text-[11px] font-semibold text-gray-500">Tickets</p>
        </div>
        <div className="flex-1 bg-white border border-amber-200 rounded-xl px-2 py-2.5 text-center">
          <p className="font-mono text-2xl font-extrabold text-amber-600">
            {(dueServices ?? []).length}
          </p>
          <p className="text-[11px] font-semibold text-gray-500">Due soon</p>
        </div>
      </div>

      {/* Wide-first: worklist beside the fleet's live state + locator map */}
      <div className="lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-3 space-y-3 lg:space-y-0 items-start">
        <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3" data-tour="shop-worklist">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Worklist · your order
            </p>
            <button
              className="text-xs text-navy underline underline-offset-2"
              onClick={() => {
                clearSavedOrder();
                setOrderTick((t) => t + 1);
              }}
            >
              reset to default
            </button>
          </div>
          {worklist.map((item, i) => (
            <div
              key={item.key}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null && dragFrom.current !== i)
                  reorder(dragFrom.current, i);
                dragFrom.current = null;
              }}
              className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0"
            >
              <span className="text-gray-300 cursor-grab select-none" title="Drag to reorder">
                ⠿
              </span>
              <button
                className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-gray-50 rounded-lg py-0.5"
                data-shop-item={item.key}
                // S9a: a ticket row opens the ticket (resolve lives there); a service row, the machine
                onClick={() => navigate(item.kind === 'ticket' ? `/tickets/${item.key.slice('ticket:'.length)}` : `/equipment/${item.equipmentId}`)}
              >
                <span className="font-mono font-bold text-xs bg-blue-50 text-navy rounded-lg px-2 py-0.5 shrink-0">
                  {item.asset}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{item.title}</p>
                  <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                </div>
                <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 shrink-0 ${item.chip.cls}`}>
                  {item.chip.text}
                </span>
              </button>
            </div>
          ))}
          {worklist.length === 0 && <p className="text-sm text-gray-400 py-1">Queue's clear — nothing down, nothing due. Rig checklists filed in the field land here as tickets.</p>}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Fleet now
            </p>
            <FleetNowRow label="In service" n={fleetNow.inService} />
            <FleetNowRow label="In shop" n={fleetNow.inShop} />
            <FleetNowRow label="At the yard" n={fleetNow.atYard} />
            <FleetNowRow
              label="Checklists filed today"
              n={checklistsToday ? `${checklistsToday.filed}/${checklistsToday.total}` : '—'}
            />
          </div>
          <button
            className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left hover:bg-gray-50"
            onClick={() => navigate('/equipment-locator')}
          >
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Where's my equipment
            </p>
            <div className="hidden lg:block h-44 pointer-events-none">
              <LocatorMap pinned={pinned} compact />
            </div>
            <p className="text-xs text-navy mt-1">Open the locator ›</p>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Checklists from the field
          </p>
          <button className="text-xs text-navy underline" onClick={() => navigate('/records')}>
            All checklists →
          </button>
        </div>
        {(checklists ?? []).map((c) => {
          const flagged = c.outOfService || c.repairsNote.trim().length > 0;
          return (
            <button
              key={c.id}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
              onClick={() => navigate(`/drill-checklist-print/${c.id}`)}
            >
              <span className={flagged ? 'text-safety-orange' : 'text-green-600'}>
                {flagged ? '⚠' : '✓'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {assetOf(c.equipmentId)?.assetNumber ?? c.equipmentId} · {c.drillerName}
                </p>
                <p className={`text-xs truncate ${flagged ? 'text-safety-orange' : 'text-gray-400'}`}>
                  {formatDate(c.date)}
                  {c.outOfService
                    ? ' · OUT OF SERVICE'
                    : c.repairsNote
                      ? ` · “${c.repairsNote.slice(0, 50)}”`
                      : ' · all good'}
                </p>
              </div>
              <span className="text-xs text-gray-400">view ›</span>
            </button>
          );
        })}
        {(checklists ?? []).length === 0 && (
          <p className="text-sm text-gray-400 py-1">No rig checklists filed today — drillers file them from their home tile; they show here as they come in.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Fleet
        </p>
        <div className="flex flex-wrap gap-1.5">
          {fleet.map((e) => (
            <button
              key={e.id}
              className={`px-2 py-1 rounded-md border text-xs font-mono font-semibold ${
                e.status === 'in_shop'
                  ? 'bg-orange-50 border-orange-300 text-safety-orange'
                  : e.status === 'retired'
                    ? 'bg-gray-100 border-gray-200 text-gray-400'
                    : 'bg-green-50 border-green-200 text-green-700'
              }`}
              title={`${e.description} — ${e.status ?? 'active'}`}
              onClick={() => navigate(`/equipment/${e.id}`)}
            >
              {e.status === 'in_shop' ? '🔧 ' : ''}
              {e.assetNumber}
            </button>
          ))}
        </div>
      </div>

      {dueSoon.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Coming due</p>
          {dueSoon.map((e) => (
            <button key={e.id}
              className="w-full text-left text-sm py-1 flex items-center gap-2 hover:bg-gray-50 rounded-lg"
              onClick={() => navigate(`/equipment/${e.id}`)}>
              <AlertTriangle className="h-4 w-4 text-safety-orange" />
              {e.assetNumber} · {e.dotInspectionDue ? `DOT ${e.dotInspectionDue}` : ''}
              {e.calibrationDue ? ` calibration ${e.calibrationDue}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin / Office home ────────────────────────────────────────────────────

export function AdminHome() {
  const navigate = useNavigate();
  // S4: the costing table is windowed (10 + Show all) — 52 unwindowed
  // rows made this the 4.3-screen offender in the clutter audit
  const [showAllCosting, setShowAllCosting] = useState(false);
  const costing = useLiveQuery(async () => {
    const jobs = await db.jobs.filter((j) => j.isActive).toArray();
    const days = await db.blastDays.toArray();
    const incidents = await db.incidents.toArray();
    const rows = [];
    for (const job of jobs) {
      const jobDays = days.filter((d) => d.jobId === job.id);
      let footage = 0;
      let lbs = 0;
      for (const day of jobDays) {
        const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
        if (log) {
          const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
          lbs += usage?.totalPoundsShot ?? 0;
          const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
          for (const s of shots) footage += s.totals.totalDrillFootage;
        }
      }
      const byType: Record<string, number> = {};
      for (const d of jobDays) byType[d.typeOfWork ?? 'unknown'] = (byType[d.typeOfWork ?? 'unknown'] ?? 0) + 1;
      rows.push({
        job,
        days: jobDays.length,
        byType,
        footage,
        lbs,
        incidents: incidents.filter((i) => i.jobId === job.id && i.status !== 'closed').length,
      });
    }
    return rows;
  });

  const compliance = useLiveQuery(async () => {
    const days = await db.blastDays.toArray();
    const items: { label: string; sub: string; dayId: string }[] = [];
    let unsigned = 0;
    let emptyReports = 0;
    let staleApprovals = 0;
    for (const day of days) {
      const job = await db.jobs.get(day.jobId);
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (log && !log.signatureImage && day.status !== 'draft') {
        unsigned++;
        items.push({
          label: `Blast log unsigned — ${day.name || job?.name || day.date}`,
          sub: `${formatDate(day.date)} · ${log.blasterName || 'no blaster set'}`,
          dayId: day.id,
        });
      }
      if (day.status === 'submitted') {
        const ageDays = (Date.now() - new Date(day.updatedAt).getTime()) / 86_400_000;
        if (ageDays > 3) {
          staleApprovals++;
          items.push({
            label: `Submitted ${Math.floor(ageDays)} days ago, not reviewed`,
            sub: `${day.name || job?.name || ''} · ${formatDate(day.date)}`,
            dayId: day.id,
          });
        }
      }
      if (day.date !== todayISO() && day.status === 'draft') {
        const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
        const crew = report
          ? await db.workForceEntries.where('dailyReportId').equals(report.id).toArray()
          : [];
        if (!crew.some((c) => c.timeIn || c.timeOut)) {
          emptyReports++;
          items.push({
            label: `Daily report empty — ${(day.typeOfWork ?? '?').replace(/_/g, ' ')} day`,
            sub: `${day.name || job?.name || ''} · ${formatDate(day.date)}`,
            dayId: day.id,
          });
        }
      }
    }
    const unaccepted = await db.drillLogs.filter((l) => l.status === 'complete').count();
    return { items: items.slice(0, 8), unsigned, emptyReports, staleApprovals, unaccepted };
  });

  const tickets = useOpenTickets();
  const openIncidents = useLiveQuery(() =>
    db.incidents.filter((i) => i.status !== 'closed').count(),
  );
  // The daily paperwork pulse: newest office copies filed from the field.
  // Blob-free summaries — the PDF is fetched only when a row is tapped.
  const latestFilings = useLiveQuery(async () =>
    (await listSubmissionSummaries())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((s) => ({ id: s.id, title: s.title, by: s.submittedBy, date: s.date, version: s.version })),
  );

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-3" data-tour="home">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-900">Company</h2>
        {getRealSessionUser()?.role === 'admin' && (
          <Button size="sm" onClick={() => setViewRole('blaster')}>
            Work in the field ›
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Latest filings
          </p>
          <button className="text-xs text-navy underline" onClick={() => navigate('/records')}>
            All records →
          </button>
        </div>
        {(latestFilings ?? []).map((f) => (
          <button
            key={f.id}
            className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => openSubmissionPdfById(f.id)}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{f.title}</p>
              <p className="text-xs text-gray-400 truncate">
                {formatDate(f.date)} · filed by {f.by}
                {f.version > 1 ? ` · v${f.version}` : ''}
              </p>
            </div>
            <span className="text-xs text-navy">PDF ›</span>
          </button>
        ))}
        {(latestFilings ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nothing filed yet. When a crew files a day, checklist or incident, it lands here and in Records.</p>
        )}
      </div>

      <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Job costing</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="py-1 pr-3">Job</th>
                <th className="py-1 pr-3">Days</th>
                <th className="py-1 pr-3">Ft drilled</th>
                <th className="py-1 pr-3">Lbs shot</th>
                <th className="py-1 pr-3">Open incidents</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(showAllCosting ? (costing ?? []) : (costing ?? []).slice(0, 10)).map((r) => (
                <tr key={r.job.id} className="border-b border-gray-50">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{r.job.name}</p>
                    <p className="text-xs text-gray-400">{r.job.customer}</p>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.days}
                    <span className="text-xs text-gray-400">
                      {' '}
                      {Object.entries(r.byType)
                        .map(([t, n]) => `${n} ${t.split('_').map((w) => w[0]?.toUpperCase()).join('')}`)
                        .join(' · ')}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.footage.toFixed(0)}</td>
                  <td className="py-2 pr-3 tabular-nums">{fmtLbs(r.lbs)}</td>
                  <td className="py-2 pr-3">
                    {r.incidents > 0 ? <Badge variant="violation">{r.incidents}</Badge> : '0'}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${r.job.id}`)}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAllCosting && (costing ?? []).length > 10 && (
          <button
            className="w-full text-left px-1 py-2 text-xs text-gray-400 hover:text-navy"
            onClick={() => setShowAllCosting(true)}
            data-costing-more
          >
            Show all {(costing ?? []).length} jobs ▸
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Compliance monitor
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <MiniStat n={compliance?.unsigned ?? 0} label="unsigned blast logs" warn />
          <MiniStat n={compliance?.emptyReports ?? 0} label="empty daily reports" warn />
          <MiniStat n={compliance?.staleApprovals ?? 0} label="approvals > 3 days" />
          <MiniStat n={compliance?.unaccepted ?? 0} label="drill logs not accepted" />
        </div>
        {(compliance?.items ?? []).map((item, i) => (
          <button key={i}
            className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate(`/blast-day/${item.dayId}`)}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{item.label}</p>
              <p className="text-xs text-gray-400 truncate">{item.sub}</p>
            </div>
            <span className="text-xs text-safety-orange">open ›</span>
          </button>
        ))}
        {(compliance?.items ?? []).length === 0 && (
          <p className="text-sm text-gray-400">All paperwork in order.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Needs attention
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/equipment')}>
            <Wrench className="h-4 w-4 mr-1" /> {tickets.length} repair ticket{tickets.length === 1 ? '' : 's'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/incidents')}>
            ⚠ {openIncidents ?? 0} open incident{(openIncidents ?? 0) === 1 ? '' : 's'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/approvals')}>
            Approvals
          </Button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        warn && n > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200'
      }`}
    >
      <p className={`text-lg font-bold tabular-nums ${warn && n > 0 ? 'text-safety-orange' : ''}`}>{n}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
    </div>
  );
}
