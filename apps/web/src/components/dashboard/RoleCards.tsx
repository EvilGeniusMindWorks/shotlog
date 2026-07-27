// Role-specific dashboard cards, per the approved mockup (v2):
// Blaster/Supervisor: today card w/ fill-out alerts + drilling-to-review
// Driller: checklist nudge + my open drill logs + my work days
// Mechanic: repair queue + due dates
// Admin/Office: job costing + compliance monitor + attention + week pulse
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Wrench, X } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { createDrillLog, getShotPlan } from '@/hooks/useDrillLogs';
import { useOpenTickets, useTodayChecklist } from '@/hooks/useMaintenance';
import { getSessionUser, getRealSessionUser, setViewRole } from '@/lib/session';
import { formatDate, todayISO } from '@/lib/utils';
import { isBlastingWork } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      out.push({
        day,
        jobName: job?.name,
        needsSignature: Boolean(log) && !log?.signatureImage,
        reportEmpty: !reportStarted,
      });
    }
    return out;
  }, [today]);

  if (!data) return null;
  return (
    <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3 mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Today · {formatDate(today)}
      </p>
      {data.length === 0 && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500 flex-1">No work day started yet.</p>
        </div>
      )}
      {data.map(({ day, jobName, needsSignature, reportEmpty }) => (
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
      const shot = await db.shots.get(log.shotId);
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      out.push({
        log,
        jobName: job?.name ?? '—',
        shotNumber: shot?.shotNumber,
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
      {rows.map(({ log, jobName, shotNumber, holes, wet }) => (
        <button key={log.id}
          className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
          onClick={() => navigate(`/blast-day/${log.blastDayId}/drill-log/${log.id}`)}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              Shot {shotNumber ?? '?'} — {log.drillerName || 'unassigned'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {jobName} · {holes} holes{wet > 0 ? ` · ${wet} wet` : ''}
            </p>
          </div>
          <Badge variant="submitted">complete</Badge>
          <span className="text-sm text-safety-orange font-medium">Review</span>
        </button>
      ))}
    </div>
  );
}

// ── Driller home ───────────────────────────────────────────────────────────

const LAST_RIG_KEY = 'shotlog-last-rig';

/** Pick-your-rig modal → checklist. Remembers the choice for the nudge. */
function RigPickerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">Which rig?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {rigs.map((r) => (
            <button
              key={r.id}
              className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg border border-gray-200 hover:bg-gray-50"
              onClick={() => {
                localStorage.setItem(LAST_RIG_KEY, r.id);
                navigate(`/drill-checklist/${r.id}`);
              }}
            >
              <ClipboardCheck className="h-5 w-5 text-navy shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.assetNumber}</span>
                <span className="block text-xs text-gray-400 truncate">{r.description}</span>
              </span>
            </button>
          ))}
          {rigs.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No drills in the equipment registry yet — ask the office to add your rig.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
      const shot = await db.shots.get(log.shotId);
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      out.push({
        log,
        jobName: job?.name ?? '—',
        shotNumber: shot?.shotNumber,
        holes: holes.length,
        designed: getShotPlan(shot)?.length ?? shot?.totals.numHoles ?? 0,
      });
    }
    return out;
  });
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

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-900">My Drilling</h2>
        <Button variant="outline" size="sm" onClick={() => setShowRigPicker(true)}>
          <ClipboardCheck className="h-4 w-4 mr-1" /> Rig checklist
        </Button>
      </div>

      {lastRigId && rig && !todayChecklist && (
        <button
          className="w-full flex items-center gap-2 text-left text-sm font-medium text-safety-orange border border-orange-200 bg-orange-50 rounded-xl px-3 py-3"
          onClick={() => navigate(`/drill-checklist/${lastRigId}`)}>
          <ClipboardCheck className="h-5 w-5" />
          {rig?.assetNumber ?? 'Rig'} checklist not filed today — tap to file
        </button>
      )}

      <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          My open drill logs
        </p>
        {(myLogs ?? []).map(({ log, jobName, shotNumber, holes, designed }) => (
          <button key={log.id}
            className="w-full py-2 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate(`/blast-day/${log.blastDayId}/drill-log/${log.id}`)}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">Shot {shotNumber ?? '?'} · {jobName}</p>
                <p className="text-xs text-gray-400">
                  {holes}{designed ? ` of ${designed}` : ''} holes
                </p>
              </div>
              <span className="text-sm text-safety-orange font-semibold">
                {holes > 0 ? 'Continue' : 'Start'}
              </span>
            </div>
            {designed > 0 && (
              <div className="h-1.5 rounded bg-gray-100 mt-1.5 overflow-hidden">
                <i className="block h-full bg-safety-orange"
                  style={{ width: `${Math.min(100, (holes / designed) * 100)}%` }} />
              </div>
            )}
          </button>
        ))}
        {(myLogs ?? []).length === 0 && (
          <p className="text-sm text-gray-400 py-1">
            Nothing open — start one from “Ready to drill” below, or the blaster
            can request drilling from a shot's design.
          </p>
        )}
      </div>

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
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-sm font-medium text-safety-orange flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> {rig?.assetNumber}: “{tickets[0].description}” — with the shop
          </p>
        </div>
      )}

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
            No drill-only days yet — tap + to start one.
          </p>
        )}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate('/days')}>
          All work days
        </Button>
      </div>

      {showRigPicker && <RigPickerModal onClose={() => setShowRigPicker(false)} />}
    </div>
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
  const inShop = equipment.filter((e) => e.status === 'in_shop');

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">Shop</h2>
      <div className="rounded-xl border-l-4 border border-gray-200 border-l-safety-orange bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Repair queue · {tickets.length}
        </p>
        {tickets.map((t) => (
          <button key={t.id}
            className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
            onClick={() => navigate('/admin/equipment')}>
            <span className="font-mono text-sm text-navy">{assetOf(t.equipmentId)?.assetNumber ?? '?'}</span>
            <p className="text-sm flex-1 min-w-0 truncate">“{t.description}”</p>
            {t.outOfService && <Badge variant="violation">out of service</Badge>}
          </button>
        ))}
        {tickets.length === 0 && <p className="text-sm text-gray-400 py-1">Queue's clear.</p>}
        <Button size="sm" className="mt-2" onClick={() => navigate('/admin/equipment')}>
          Open equipment
        </Button>
      </div>
      {dueSoon.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Coming due</p>
          {dueSoon.map((e) => (
            <p key={e.id} className="text-sm py-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-safety-orange" />
              {e.assetNumber} · {e.dotInspectionDue ? `DOT ${e.dotInspectionDue}` : ''}
              {e.calibrationDue ? ` calibration ${e.calibrationDue}` : ''}
            </p>
          ))}
        </div>
      )}
      {inShop.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">In shop</p>
          {inShop.map((e) => (
            <p key={e.id} className="text-sm py-1">{e.assetNumber} — {e.description}</p>
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
