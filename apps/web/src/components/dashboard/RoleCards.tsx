// Role-specific dashboard cards, per the approved mockup (v2):
// Blaster/Supervisor: today card w/ fill-out alerts + drilling-to-review
// Driller: checklist nudge + my open drill logs + my work days
// Mechanic: repair queue + due dates
// Admin/Office: job costing + compliance monitor + attention + week pulse
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Wrench, X } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { createDrillPlanLog, drillLogRoute, getPlanHoles, usePlanDrilling } from '@/hooks/useDrillPlans';
import { createDrillLog, getShotPlan } from '@/hooks/useDrillLogs';
import { useOpenTickets, useTodayChecklist } from '@/hooks/useMaintenance';
import { getSessionUser, getRealSessionUser, setViewRole } from '@/lib/session';
import { listSubmissionSummaries, openSubmissionPdfById } from '@/lib/archive';
import { formatDate, todayISO } from '@/lib/utils';
import { isBlastingWork, type TimeCard } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { LAST_RIG_KEY, RigPickerModal } from './RigPickerModal';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { TimeCardRow } from '@/components/forms/TimeCardsCard';
import { canEditCard, createStandaloneTimeCard } from '@/hooks/useTimeCards';

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
          <Badge variant="submitted">complete</Badge>
          <span className="text-sm text-safety-orange font-medium">Review</span>
        </button>
      ))}
    </div>
  );
}

// ── Driller home ───────────────────────────────────────────────────────────


/** Pick-your-rig modal → checklist. Remembers the choice for the nudge. */

export function DrillerHome() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const [showRigPicker, setShowRigPicker] = useState(false);
  const myLogs = useLiveQuery(async () => {
    const logs = await db.drillLogs
      .filter((l) => l.status === 'open' && (!me?.id || l.drillerUserId === me.id || !l.drillerUserId))
      .toArray();
    const out = [];
    for (const log of logs) {
      const job = await db.jobs.get(log.jobId);
      const day = log.blastDayId ? await db.blastDays.get(log.blastDayId) : undefined;
      const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
      const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      // A log belongs to TODAY (trio) or to a prior day ("yesterday needs
      // you") — plan logs carry a date; shot logs fall back to creation
      const logDay = log.date ?? log.createdAt.slice(0, 10);
      out.push({
        log,
        jobId: log.jobId,
        jobName: job?.name ?? '—',
        context: plan ? plan.name : `Shot ${shot?.shotNumber ?? '?'} · ${day?.name || job?.name || '—'}`,
        holes: holes.filter((h) => !h.skipped).length,
        holesToday: holes.filter((h) => h.date === todayISO() && !h.skipped).length,
        isPrior: logDay < todayISO(),
        designed: plan
          ? (getPlanHoles(plan)?.length ?? 0)
          : (getShotPlan(shot)?.length ?? shot?.totals.numHoles ?? 0),
      });
    }
    return out;
  });
  // Fresh dispatches: the blaster sent me this plan and I haven't started
  const assignedNew = (myLogs ?? []).filter((x) => x.log.assignedBy && x.holes === 0);
  const activeLogs = (myLogs ?? []).filter((x) => !(x.log.assignedBy && x.holes === 0));
  // Round 3 trio split: today's work up top, prior days need attention
  const todayLogs = activeLogs.filter((x) => !x.isPrior);
  const priorLogs = activeLogs.filter((x) => x.isPrior);
  // The rig from my most recent log (or my last picker choice) drives the nudge
  const lastRigId =
    myLogs?.find((r) => r.log.drillRigEquipmentId)?.log.drillRigEquipmentId ??
    localStorage.getItem(LAST_RIG_KEY) ??
    undefined;
  const rig = useLiveQuery(() => (lastRigId ? db.equipment.get(lastRigId) : undefined), [lastRigId]);
  const todayChecklist = useTodayChecklist(lastRigId);
  const tickets = useOpenTickets().filter((t) => t.equipmentId === lastRigId);
  const myDays = useLiveQuery(async () => {
    const days = await db.blastDays
      .filter((d) => !isBlastingWork(d.typeOfWork))
      .toArray();
    const withJobs = [];
    for (const day of [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)) {
      withJobs.push({ day, jobName: (await db.jobs.get(day.jobId))?.name });
    }
    return withJobs;
  });

  // Trio: my hours — today's time card (bound to a job, day optional)
  const [showHours, setShowHours] = useState(false);
  const myCardToday = useLiveQuery(
    async () =>
      me
        ? db.timeCards
            .filter((c) => c.userId === me.id && c.date === todayISO())
            .first()
        : undefined,
    [me?.id],
  );
  // My drilling on today's plan, all drillers merged — the progress line.
  // Prefer the log I'm actually working (most holes today) — stale
  // zero-hole logs must never shadow the live pattern.
  const drillingToday = useLiveQuery(async () => {
    const mine = (myLogs ?? [])
      .filter((x) => !x.isPrior && !(x.log.assignedBy && x.holes === 0))
      .sort((a, b) => b.holesToday - a.holesToday || b.holes - a.holes);
    const first = mine[0];
    if (!first) return null;
    let others = 0;
    let total = first.designed;
    if (first.log.drillPlanId) {
      const siblings = await db.drillLogs
        .filter((l) => l.drillPlanId === first.log.drillPlanId && l.id !== first.log.id)
        .toArray();
      for (const s of siblings)
        others += (await db.drillLogHoles.where('drillLogId').equals(s.id).toArray()).filter(
          (h) => !h.skipped,
        ).length;
    }
    return { ...first, others, total };
  }, [myLogs?.map((x) => x.log.id + x.holes).join(',')]);

  // Open standalone drill plans where I have no open log TODAY — the
  // per-driller-per-day model: each day on a plan is its own log
  const openPlans = useLiveQuery(async () => {
    const plans = await db.drillPlans.filter((p) => p.status === 'open' && !p.archivedAt).toArray();
    const out = [];
    for (const plan of plans) {
      const holes = getPlanHoles(plan);
      if (!holes || holes.length === 0) continue;
      const logs = await db.drillLogs.filter((l) => l.drillPlanId === plan.id).toArray();
      let drilled = 0;
      let mineOpenToday = false;
      for (const dl of logs) {
        drilled += await db.drillLogHoles.where('drillLogId').equals(dl.id).count();
        if (dl.status === 'open' && dl.drillerUserId === me?.id && dl.date === todayISO())
          mineOpenToday = true;
      }
      if (drilled >= holes.length || mineOpenToday) continue;
      const jobName = (await db.jobs.get(plan.jobId))?.name;
      out.push({ plan, jobName, target: holes.length, drilled });
    }
    return out;
  }, [me?.id]);

  // Shots with designed holes still to drill where I have no open log —
  // the driller-initiated path (blaster still accepts at the end)
  const readyToDrill = useLiveQuery(async () => {
    const days = (await db.blastDays.filter((d) => d.status !== 'approved').toArray())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 15);
    const out = [];
    for (const day of days) {
      const blastLog = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (!blastLog) continue;
      const shots = await db.shots.where('blastLogId').equals(blastLog.id).toArray();
      const jobName = (await db.jobs.get(day.jobId))?.name;
      for (const shot of shots) {
        const target = getShotPlan(shot)?.length ?? shot.totals?.numHoles ?? 0;
        if (!target) continue;
        const shotLogs = await db.drillLogs.where('shotId').equals(shot.id).toArray();
        let drilled = 0;
        let mineOpen = false;
        for (const dl of shotLogs) {
          drilled += await db.drillLogHoles.where('drillLogId').equals(dl.id).count();
          if (dl.status === 'open' && (!me?.id || dl.drillerUserId === me.id || !dl.drillerUserId))
            mineOpen = true; // already in "My open drill logs"
        }
        if (drilled >= target || mineOpen) continue;
        out.push({ day, jobName, shot, target, drilled, joining: shotLogs.length > 0 });
      }
    }
    return out;
  });

  const holesTodayTotal = todayLogs.reduce((s, x) => s + x.holesToday, 0);
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Drilling</h2>

      {/* Yesterday needs you — unsigned prior logs, only when non-empty */}
      {priorLogs.length > 0 && (
        <div className="rounded-xl border border-gray-200 border-l-4 border-l-safety-orange bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Yesterday needs you
          </p>
          {priorLogs.map(({ log, context, holes }) => (
            <button
              key={log.id}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
              onClick={() => navigate(drillLogRoute(log))}
            >
              <Badge variant="warning">unsigned</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{context}</p>
                <p className="text-xs text-gray-400">
                  {holes} holes logged, not signed complete
                </p>
              </div>
              {log.reopenNote && <Badge variant="violation">sent back</Badge>}
              <span className="text-gray-300">›</span>
            </button>
          ))}
        </div>
      )}

      {/* The trio — the day's three obligations. All green = done. */}
      <div className="flex gap-2">
        <TrioTile
          state={todayChecklist ? 'done' : 'todo'}
          label={`Checklist${rig ? `\n${rig.assetNumber}` : ''}`}
          onClick={() => (lastRigId ? navigate(`/drill-checklist/${lastRigId}`) : setShowRigPicker(true))}
        />
        <TrioTile
          state={
            todayLogs.length > 0 ? 'active' : holesTodayTotal > 0 ? 'done' : 'todo'
          }
          label={`Drill log${holesTodayTotal > 0 ? `\n${holesTodayTotal} holes` : ''}`}
          onClick={() =>
            todayLogs[0]
              ? navigate(drillLogRoute(todayLogs[0].log))
              : undefined
          }
        />
        <TrioTile
          state={
            myCardToday
              ? myCardToday.status === 'draft'
                ? 'active'
                : 'done'
              : 'todo'
          }
          label={'My hours'}
          onClick={() => setShowHours(true)}
        />
      </div>

      {/* Drilling today — the active pattern with everyone's progress */}
      {drillingToday && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Drilling today · {drillingToday.context}
          </p>
          <div className="flex items-center gap-2 py-1 text-sm">
            <div className="flex-1 min-w-0">
              <p>Progress (all drillers)</p>
              <p className="text-xs text-gray-400">
                you {drillingToday.holes}
                {drillingToday.others > 0 && ` · others ${drillingToday.others}`}
                {drillingToday.total > 0 &&
                  ` · ${Math.max(0, drillingToday.total - drillingToday.holes - drillingToday.others)} open`}
              </p>
            </div>
            {drillingToday.total > 0 && (
              <span className="font-mono font-bold">
                {drillingToday.holes + drillingToday.others}/{drillingToday.total}
              </span>
            )}
          </div>
          <button
            className="w-full bg-safety-orange text-white rounded-xl py-2.5 font-bold text-sm mt-1 hover:bg-orange-600"
            onClick={() => navigate(drillLogRoute(drillingToday.log))}
          >
            Continue drilling
          </button>
        </div>
      )}

      {assignedNew.length > 0 && (
        <div className="rounded-xl border-2 border-navy bg-navy-50 p-3">
          <p className="text-[11px] font-semibold text-navy uppercase tracking-wider mb-1">
            📋 Assigned to you
          </p>
          {assignedNew.map(({ log, context, designed }) => (
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

      {/* More than one log open today — the rest live here */}
      {todayLogs.length > 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Also open today
          </p>
          {todayLogs.slice(1).map(({ log, context, holes, designed }) => (
            <button key={log.id}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
              onClick={() => navigate(drillLogRoute(log))}>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{context}</p>
                <p className="text-xs text-gray-400">
                  {holes}{designed ? ` of ${designed}` : ''} holes
                </p>
              </div>
              <span className="text-sm text-safety-orange font-semibold">Continue</span>
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
                const logId = await createDrillLog(shot, day.id, day.jobId);
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

      {tickets.length > 0 && (
        <button
          className="w-full rounded-xl border border-orange-200 bg-orange-50 p-3 text-left"
          onClick={() => lastRigId && navigate(`/equipment/${lastRigId}`)}
        >
          <p className="text-sm font-medium text-safety-orange flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> {rig?.assetNumber}: “{tickets[0].description}” — with the shop ›
          </p>
        </button>
      )}

      {/* No work anywhere: every hole lives under a plan (Round 3 —
          the no-plan path is retired; small jobs get trivial plans) */}
      {!drillingToday && assignedNew.length === 0 && (openPlans ?? []).length === 0 &&
        (readyToDrill ?? []).length === 0 && myLogs !== undefined && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-400">
            No open drill plans. Drilling starts from a plan — the blaster
            makes one on the job page in seconds, even for a small job, or
            sends you one directly.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <button
          className="w-full flex items-center gap-2 py-1 text-left text-sm hover:bg-gray-50 rounded-lg"
          onClick={() => navigate('/records')}
        >
          <span className="flex-1">My records</span>
          <span className="text-gray-300">›</span>
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          My work days
        </p>
        {(myDays ?? []).map(({ day, jobName }) => (
          <button key={day.id}
            className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate(`/blast-day/${day.id}`)}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{dayTitle(day, jobName)}</p>
              <p className="text-xs text-gray-400">{jobName} · {formatDate(day.date)}</p>
            </div>
            <Badge variant="secondary">{(day.typeOfWork ?? '?').replace(/_/g, ' ')}</Badge>
            <Badge variant={day.status as 'draft' | 'submitted' | 'approved'}>{day.status}</Badge>
          </button>
        ))}
        {(myDays ?? []).length === 0 && (
          <p className="text-sm text-gray-400 py-1">
            No drill-only days yet — tap + to log drilling at a job.
          </p>
        )}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/days')}>
          All work days
        </Button>
      </div>

      {showRigPicker && <RigPickerModal onClose={() => setShowRigPicker(false)} />}
      {showHours && (
        <MyHoursSheet
          card={myCardToday}
          defaultJobId={drillingToday?.jobId ?? todayLogs[0]?.jobId}
          onClose={() => setShowHours(false)}
        />
      )}
    </div>
  );
}

/** One trio tile: ✅ done · 🟠 in progress · — not yet */
function TrioTile({
  state,
  label,
  onClick,
}: {
  state: 'done' | 'active' | 'todo';
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex-1 bg-white border border-gray-200 rounded-xl px-2 py-2.5 text-center hover:bg-gray-50 min-h-[72px]"
      onClick={onClick}
    >
      <span className="block text-xl leading-none mb-1">
        {state === 'done' ? '✅' : state === 'active' ? '🟠' : '—'}
      </span>
      <span className="block text-[11px] font-semibold text-gray-500 whitespace-pre-line leading-tight">
        {label}
      </span>
    </button>
  );
}

/** My hours, standalone (Round 3): the driller's card may exist before any
 *  work day does — cards bind to a job + date; the day attaches later. */
function MyHoursSheet({
  card,
  defaultJobId,
  onClose,
}: {
  card: TimeCard | undefined;
  defaultJobId?: string;
  onClose: () => void;
}) {
  const me = getSessionUser();
  const jobs = useLiveQuery(() => db.jobs.filter((j) => j.isActive && !j.archivedAt).toArray()) ?? [];
  const [jobId, setJobId] = useState(defaultJobId ?? '');
  const roster = useLiveQuery(() => db.crewMembers.filter((m) => m.isActive).toArray()) ?? [];
  return (
    <ConsequenceSheet onClose={onClose}>
      <h3 className="font-bold text-lg mb-2">My hours · today</h3>
      {card ? (
        <TimeCardRow card={card} editable={canEditCard(card, roster)} />
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Which job?</Label>
          <Select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Pick a job…"
            options={jobs.map((j) => ({ value: j.id, label: j.name }))}
          />
          <Button
            className="w-full"
            disabled={!jobId || !me}
            onClick={() =>
              void createStandaloneTimeCard(jobId, {
                name: me!.name,
                userId: me!.id,
                crewMemberId: roster.find((m) => m.userId === me!.id)?.id,
              })
            }
          >
            Add my card
          </Button>
        </div>
      )}
      <Button variant="outline" className="w-full mt-3" onClick={onClose}>
        Close
      </Button>
    </ConsequenceSheet>
  );
}

// ── Mechanic home ──────────────────────────────────────────────────────────

export function MechanicHome() {
  const navigate = useNavigate();
  const tickets = useOpenTickets();
  const equipment = useLiveQuery(() => db.equipment.toArray()) ?? [];
  const assetOf = (id: string) => equipment.find((e) => e.id === id);
  const dueSoon = equipment.filter((e) => {
    const dates = [e.dotInspectionDue, e.calibrationDue].filter(Boolean) as string[];
    return dates.some((d) => (new Date(d).getTime() - Date.now()) / 86_400_000 <= 30);
  });
  // What came in from the field: newest checklists across the whole fleet
  const checklists = useLiveQuery(async () =>
    (await db.drillChecklists.toArray())
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
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Shop</h2>

      <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Repair queue · {tickets.length}
        </p>
        {tickets.map((t) => (
          <button key={t.id}
            className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate(`/equipment/${t.equipmentId}`)}>
            <span className="font-mono text-sm text-navy">{assetOf(t.equipmentId)?.assetNumber ?? '?'}</span>
            <p className="text-sm flex-1 min-w-0 truncate">“{t.description}”</p>
            {t.outOfService && <Badge variant="violation">out of service</Badge>}
          </button>
        ))}
        {tickets.length === 0 && <p className="text-sm text-gray-400 py-1">Queue's clear.</p>}
        <Button size="sm" className="mt-2" onClick={() => navigate('/admin/equipment')}>
          Resolve in registry
        </Button>
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
          <p className="text-sm text-gray-400 py-1">No checklists filed yet.</p>
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
    <div className="p-4 max-w-4xl mx-auto space-y-3">
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
          <p className="text-sm text-gray-400">Nothing filed yet — submitted paperwork lands here.</p>
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
              {(costing ?? []).map((r) => (
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
                  <td className="py-2 pr-3 tabular-nums">{r.lbs.toFixed(0)}</td>
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
