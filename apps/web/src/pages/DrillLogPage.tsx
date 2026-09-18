// One driller's signed drill log for a shot. Fast entry: hole number
// auto-increments, depth defaults to the pattern's design, conditions are
// single-tap toggles. Blaster accepts a completed log to take the pattern
// for loading (which locks it against driller edits — server-enforced).
import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, Droplets, Printer, Trash2 } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { canDrillLogTransition, canEditAcceptedLog } from '@/lib/perms';
import { useBack } from '@/lib/nav';
import { BackButton } from '@/components/layout/ScreenHeader';
import { useLiveQuery, db, deleteWithTombstone } from '@/db';
import { addHole, aggregateDrilling, drilledHoleNumbers, getShotPlan, nextHoleNumber } from '@/hooks/useDrillLogs';
import { autoDrilled, closePlanShort, getPlanHoles, planDrilledHoleNumbers, planToDiagram, progressLine, usePlanProgress } from '@/hooks/useDrillPlans';
import { initials } from '@/components/day/MergedDrillingView';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { checklistComplete, checklistMissing, stopChecklist } from '@/hooks/useMaintenance';
import { Textarea } from '@/components/ui/textarea';
import { parseDiagram } from '@/lib/shotDiagram';
import { PatternGrid } from '@/components/design/PatternGrid';
import { AttachmentsCard } from '@/components/forms/AttachmentsCard';
import { useSubmissions } from '@/lib/archive';
import { findCrewId } from '@/lib/personHistory';
import { setupPath, useDayGate, type GateState } from '@/lib/dayCard';
import { getSessionUser } from '@/lib/session';
import { nowISO, formatDate, todayISO } from '@/lib/utils';
import type { HoleCondition, HoleConditionCode, BlastDay } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/undo-toast';
import { Button } from '@/components/ui/button';
import { LifecycleMenu } from '@/components/records/LifecycleMenu';
import { Input } from '@/components/ui/input';
import { DraftInput } from '@/components/ui/draft-input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';
import { propagateHourMeter, useTodayChecklist } from '@/hooks/useMaintenance';
import { rememberUsualRig } from '@/components/dashboard/RigPickerModal';
import { buildHourLedger } from '@/lib/hourLedger';

const CONDITIONS: { code: HoleConditionCode; label: string }[] = [
  { code: 'W', label: 'Water' },
  { code: 'V', label: 'Void' },
  { code: 'SR', label: 'Soft Rock' },
  { code: 'O', label: 'Overburden' },
];

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;
/** The crew's words, not the code's (S10) */
export const DRILL_LOG_STATUS_LABEL = { open: 'Open', complete: 'Complete', accepted: 'Accepted' } as const;

export function DrillLogPage() {
  // Serves BOTH routes: /blast-day/:id/drill-log/:logId (shot-parented) and
  // /jobs/:jobId/drill-plan/:planId/log/:logId (plan-parented) — the log
  // record itself decides which world it lives in.
  const { logId } = useParams<{ logId: string }>();
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'driller') as Role;
  const me = getSessionUser();

  const log = useLiveQuery(() => (logId ? db.drillLogs.get(logId) : undefined), [logId]);
  const holes =
    useLiveQuery(
      async () =>
        logId
          ? (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
              a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
            )
          : [],
      [logId],
    ) ?? [];
  const shot = useLiveQuery(
    () => (log?.shotId ? db.shots.get(log.shotId) : undefined),
    [log?.shotId],
  );
  const drillPlan = useLiveQuery(
    () => (log?.drillPlanId ? db.drillPlans.get(log.drillPlanId) : undefined),
    [log?.drillPlanId],
  );
  const job = useLiveQuery(() => (log ? db.jobs.get(log.jobId) : undefined), [log?.jobId]);
  // S13: the day's card asks once — the first time a job is known for the
  // driller that day (a checklist with no job never waits)
  // S20: the lookup says WHICH day it answered for, so a stale answer (from
  // before the log itself had loaded) never passes for "looked up, not here"
  // — that gap let the page show, then blink to "Loading…" once the day and
  // its card gate caught up, taking an open sheet's signature pad with it
  const logDayLookup = useLiveQuery(
    async () => {
      const id = log?.blastDayId ?? null;
      return { forId: id, day: id ? ((await db.blastDays.get(id)) ?? null) : null };
    },
    [log?.blastDayId],
  );
  const lookedUp = logDayLookup && logDayLookup.forId === (log?.blastDayId ?? null) ? logDayLookup : undefined;
  // A day that blinks out for a beat (a sync checkpoint swapping rows) keeps
  // its last copy, so the gate never re-decides from nothing mid-page
  const lastDay = useRef<BlastDay | undefined>(undefined);
  if (lookedUp?.day) lastDay.current = lookedUp.day;
  const logDay = lookedUp?.day ?? lastDay.current;
  const dayPending = Boolean(log?.blastDayId) && !lookedUp && !lastDay.current;
  const gateNow = useDayGate(logDay);
  // S20: the gate re-decides whenever the day changes (a sync echo, a card edit)
  // and answers `undefined` while it thinks — keep the last answer meanwhile, or
  // the page blinks to "Loading…" and an open sheet loses its signature pad
  // (harness60 caught it on the phone's Mark complete sheet)
  const lastGate = useRef<GateState | undefined>(undefined);
  if (gateNow !== undefined) lastGate.current = gateNow;
  const gate = gateNow ?? lastGate.current;
  const location = useLocation();
  useEffect(() => {
    if ((gate === 'form' || gate === 'confirm') && logDay)
      navigate(setupPath(logDay.id, location.pathname + location.search), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, logDay?.id]);
  // Until the day's card has answered, show nothing a tap could be lost on.
  // S20: the page waits for the day AND the gate's first answer together —
  // the log's own query answers before the day's, and showing the page in
  // between blinked it to "Loading…" a beat later, taking an open sheet's
  // signature pad with it (harness60). A re-decision keeps the last answer
  // (lastGate), so the page never blinks once it is up; a day that is not
  // here at all (null) renders the log as it always did.
  const gateUndecided =
    Boolean(log?.blastDayId) &&
    (dayPending || (logDay !== undefined && (gate === undefined || gate === 'form' || gate === 'confirm')));
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];

  const todayChecklistNoJob = useTodayChecklist(log?.drillRigEquipmentId);
  // S23: the rig's checklist at THIS job today (a checklist filed from a day
  // carries the job; the rig-only lookup above misses it)
  const todayChecklistAtJob = useTodayChecklist(log?.drillRigEquipmentId, log?.jobId);
  const todayChecklist = todayChecklistAtJob ?? todayChecklistNoJob;
  // S23: a plan log is one driller's PART of the pattern's one drill log —
  // the count, the days and the drillers are the pattern's
  const isPart = Boolean(log?.drillPlanId);
  const planProgress = usePlanProgress(log?.drillPlanId ?? undefined);
  // who drilled which hole, across every part, for the initials on the grid
  const holeOwners =
    useLiveQuery(async () => {
      const out = new Map<string, string>();
      if (!log?.drillPlanId) return out;
      const parts = await db.drillLogs.filter((l) => l.drillPlanId === log.drillPlanId).toArray();
      for (const p of parts) {
        for (const h of await db.drillLogHoles.where('drillLogId').equals(p.id).toArray()) out.set(h.holeNumber.trim(), initials(h.drillerName || p.drillerName || ''));
      }
      return out;
    }, [log?.drillPlanId]) ?? new Map<string, string>();
  // S23: Change rig — the old rig's checklist takes its stop hours, the new rig's opens
  const [rigChange, setRigChange] = useState<{ toRigId: string; stop: string; down: boolean; error: string | null } | null>(null);
  const [closeShort, setCloseShort] = useState<string | null>(null);

  // The blaster's per-hole plan + the claim ledger: a hole drilled in ANY
  // log (any driller, any day) is off everyone's remaining list
  const plan = log?.drillPlanId ? getPlanHoles(drillPlan) : getShotPlan(shot);
  const drilling = useLiveQuery(async () => {
    if (!log) return undefined;
    if (log.drillPlanId) {
      const p = await db.drillPlans.get(log.drillPlanId);
      const logs = await db.drillLogs.filter((l) => l.drillPlanId === log.drillPlanId).toArray();
      return aggregateDrilling(logs, getPlanHoles(p));
    }
    if (!log.shotId) return undefined;
    const s = await db.shots.get(log.shotId);
    const logs = await db.drillLogs.where('shotId').equals(log.shotId).toArray();
    return aggregateDrilling(logs, getShotPlan(s));
  }, [log?.shotId, log?.drillPlanId]);
  const filedCopies = useSubmissions(log?.id);
  // The driller's name in the header is a door to their person page
  const drillerCrewId = useLiveQuery(
    async () =>
      log ? findCrewId({ userId: log.drillerUserId || undefined, name: log.drillerName }) : null,
    [log?.drillerUserId, log?.drillerName],
  );
  const drilled = useLiveQuery(async () => {
    if (!log) return undefined;
    if (log.drillPlanId) return planDrilledHoleNumbers(log.drillPlanId);
    if (log.shotId) return drilledHoleNumbers(log.shotId);
    return new Set<string>();
  }, [log?.shotId, log?.drillPlanId]);
  const remaining = plan && drilled ? plan.filter((p) => !drilled.has(String(p.n))) : null;

  // Quick-entry state
  const [holeNumber, setHoleNumber] = useState('');
  // Sep 15 2026 (Matthew's Beta log: hole 37 twice, one second apart): a
  // second tap while the first is still saving, or a number already logged,
  // adds nothing — the list says so instead
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);
  // Round 3 batch-first: grid selection → "Log N as planned" in one tap
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState('');
  const [conditions, setConditions] = useState<HoleConditionCode[]>([]);
  // Per-condition hazard detail: at-depth (ft) + free note — optional,
  // shown inline under each toggled-on condition
  const [condDetail, setCondDetail] = useState<
    Partial<Record<HoleConditionCode, { at: string; note: string }>>
  >({});
  const [comment, setComment] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [angle, setAngle] = useState('0');
  const [subdrill, setSubdrill] = useState('');
  // S8a follow-up: the logged-holes list is windowed (newest first)
  const [showAllHoles, setShowAllHoles] = useState(false);
  // Handoff-note prompts: driller → blaster at complete, blaster → driller at reopen
  const [notePrompt, setNotePrompt] = useState<'complete' | 'reopen' | null>(null);
  const [noteText, setNoteText] = useState('');
  // S14: the rig's meter is asked on the rig's own checklist (its odometer),
  // never here — the log only names the rig it was drilled with


  useEffect(() => {
    if (!log || holeNumber) return;
    // S23: a pattern part waits for its plan to load — the log answers a beat
    // before the plan, and "1" would stick (harness85: "Hole 1 is already logged")
    if (log.drillPlanId && !drillPlan) return;
    if (plan) {
      if (drilled) {
        const next = plan.find((p) => !drilled.has(String(p.n)));
        setHoleNumber(next ? String(next.n) : String(plan.length + 1));
      }
    } else if (log.shotId) {
      void nextHoleNumber(log.shotId).then((n) => setHoleNumber(String(n)));
    } else {
      setHoleNumber('1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id, plan !== null, drilled !== undefined, drillPlan?.id]);

  // Jumping to a different hole pulls in ITS planned angle
  useEffect(() => {
    const p = plan?.find((x) => String(x.n) === holeNumber.trim());
    if (p) setAngle(String(p.angle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  // The navigation round: the arrow goes up to the day the log belongs to (or its
  // plan) — or back to where you came from (the driller's home card, the Drilling
  // page). The S7 "a driller's arrow goes home" rule retires with it.
  const back = useBack(
    log
      ? log.blastDayId
        ? { to: `/blast-day/${log.blastDayId}`, label: job?.name ?? 'the work day' }
        : { to: `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`, label: 'Drill plan' }
      : null,
    log ? 'Drill log' : undefined,
  );
  if (!log || gateUndecided) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  // Where "print" and "accept" go depends on the log's world
  const logBase = log.drillPlanId
    ? `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}/log/${log.id}`
    : `/blast-day/${log.blastDayId}/drill-log/${log.id}`;
  const contextTitle = drillPlan ? drillPlan.name : `Shot ${shot?.shotNumber ?? '?'}`;

  const designDepth = shot?.totals.avgDrillDepth || log.faceHeight || 0;
  const designSubdrill = shot?.drillParams.subDrill ?? 0;
  const locked = log.status === 'accepted' && !canEditAcceptedLog();
  const editable = !locked && log.status !== 'accepted';
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const recentHoles = [...holes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const planHole = plan?.find((p) => String(p.n) === holeNumber.trim());
  // The driller drills the LENGTH — for kicked holes that's longer than the
  // vertical depth, so it is the plan target everywhere on this page
  const planTarget = planHole ? +(planHole.holeLength || planHole.depth).toFixed(1) : undefined;
  const targetDepth = planTarget || designDepth;

  const update = (changes: Record<string, unknown>) =>
    db.drillLogs.update(log.id, { ...changes, updatedAt: nowISO() });

  // S23 / feedback item 3: the part's end-of-day buttons wait for today's rig
  // checklist to be complete (start, stop or out of service, signature)
  const checklistGate: { text: string; to: string; kind: 'none' | 'incomplete' } | null = (() => {
    if (!isPart || !log.drillRigEquipmentId) return null;
    const door = `/drill-checklist/${log.drillRigEquipmentId}?job=${log.jobId}&date=${todayISO()}`;
    if (!todayChecklist) return { kind: 'none', text: `File ${rigs.find((r) => r.id === log.drillRigEquipmentId)?.assetNumber ?? 'the rig'}'s checklist first`, to: door };
    if (!checklistComplete(todayChecklist)) return { kind: 'incomplete', text: `Complete ${rigs.find((r) => r.id === log.drillRigEquipmentId)?.assetNumber ?? 'the rig'}'s checklist first — ${checklistMissing(todayChecklist).join(' and ')}`, to: door };
    return null;
  })();
  const afterHole = () => {
    if (log.drillPlanId) void autoDrilled(log.drillPlanId);
  };
  const changeRig = async () => {
    if (!rigChange || !rigChange.toRigId) return;
    const oldRig = log.drillRigEquipmentId;
    const now = nowISO();
    if (oldRig && todayChecklist && todayChecklist.stopHours == null && !todayChecklist.outOfService) {
      const v = parseFloat(rigChange.stop);
      if (!Number.isFinite(v)) return setRigChange({ ...rigChange, error: 'Enter the old rig’s meter reading.' });
      if (todayChecklist.startingHours != null && v < todayChecklist.startingHours) return setRigChange({ ...rigChange, error: `The stop reading can't be below the start reading (${todayChecklist.startingHours}).` });
      await stopChecklist(todayChecklist, v, { outOfService: rigChange.down, note: rigChange.down ? `Out of service at ${v} h — rig changed on the drill log` : undefined });
    }
    await update({ drillRigEquipmentId: rigChange.toRigId, rigChanges: [...(log.rigChanges ?? []), { at: now, fromRigId: oldRig, toRigId: rigChange.toRigId }] });
    void rememberUsualRig(rigChange.toRigId);
    const to = rigChange.toRigId;
    setRigChange(null);
    // the new rig's checklist: its start hours and checks, then back here
    navigate(`/drill-checklist/${to}?job=${log.jobId}&date=${todayISO()}`);
  };

  const alreadyLogged = holes.some((h) => h.holeNumber.trim() === holeNumber.trim());
  const submitHole = async () => {
    const d = parseFloat(depth) || targetDepth;
    if (!holeNumber.trim() || d <= 0 || adding) return;
    if (alreadyLogged) {
      setAddNote(`Hole ${holeNumber.trim()} is already on this log — find it in the list to change or remove it.`);
      return;
    }
    setAddNote(null);
    setAdding(true);
    try {
    const a = angle.trim() === '' ? (planHole?.angle ?? 0) : parseFloat(angle) || 0;
    // Condition toggles mark the whole hole; an at-depth detail narrows the
    // band to that point and a note rides along ("water at 8 ft")
    const fullConditions: HoleCondition[] = conditions.map((code) => {
      const detail = condDetail[code];
      const at = detail && detail.at !== '' ? parseFloat(detail.at) : NaN;
      return {
        fromFt: Number.isNaN(at) ? 0 : at,
        toFt: Number.isNaN(at) ? d : at,
        code,
        ...(detail?.note.trim() ? { note: detail.note.trim() } : {}),
      };
    });
    await addHole(log, {
      holeNumber: holeNumber.trim(),
      actualDepth: d,
      angle: a,
      subdrill: subdrill === '' ? designSubdrill : parseFloat(subdrill) || 0,
      conditions: fullConditions,
      comment: comment.trim(),
      plannedDepth: planTarget,
      plannedAngle: planHole?.angle !== undefined ? +planHole.angle.toFixed(1) : undefined,
      plannedKick: planHole?.kick,
      plannedKickDir: planHole?.kickDir,
    });
    afterHole();
    if (plan && drilled) {
      // Advance to the next unclaimed plan hole (the one just drilled included)
      const nowDrilled = new Set(drilled);
      nowDrilled.add(holeNumber.trim());
      const next = plan.find((p) => !nowDrilled.has(String(p.n)));
      setHoleNumber(next ? String(next.n) : '');
    } else {
      const n = parseInt(holeNumber, 10);
      setHoleNumber(Number.isNaN(n) ? '' : String(n + 1));
    }
    setDepth('');
    setConditions([]);
    setCondDetail({});
    setComment('');
    } finally {
      setAdding(false);
    }
  };

  // ── Batch actions (Round 3): the normal case is "holes 12–18, all as
  // planned" — two taps, never seven identical entries ──────────────────
  const sortedSelection = () =>
    [...selected].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const planValues = (n: string) => {
    const p = plan?.find((x) => String(x.n) === n);
    if (!p) return null;
    const t = +(p.holeLength || p.depth).toFixed(1);
    return {
      target: t,
      angle: p.angle !== undefined ? +p.angle.toFixed(1) : 0,
      kick: p.kick,
      kickDir: p.kickDir,
    };
  };

  const logSelectedAsPlanned = async () => {
    const picks = sortedSelection();
    for (const n of picks) {
      const v = planValues(n);
      if (!v) continue;
      await addHole(log, {
        holeNumber: n,
        actualDepth: v.target,
        angle: v.angle,
        subdrill: designSubdrill,
        conditions: [],
        comment: '',
        plannedDepth: v.target,
        plannedAngle: v.angle || undefined,
        plannedKick: v.kick,
        plannedKickDir: v.kickDir,
      });
    }
    setSelected(new Set());
    afterHole();
    showToast(`Logged ${picks.length} hole${picks.length === 1 ? '' : 's'} as planned`);
  };

  const markSelectedSkipped = async () => {
    const picks = sortedSelection();
    for (const n of picks) {
      const v = planValues(n);
      await addHole(log, {
        holeNumber: n,
        actualDepth: 0,
        angle: 0,
        subdrill: 0,
        conditions: [],
        comment: '',
        plannedDepth: v?.target,
        skipped: true,
      });
    }
    setSelected(new Set());
    afterHole();
    showToast(`Marked ${picks.length} hole${picks.length === 1 ? '' : 's'} skipped`);
  };

  const logWithChanges = () => {
    const first = sortedSelection()[0];
    if (first) setHoleNumber(first);
    setSelected(new Set());
  };

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        {/* S20 follow-up: on a phone the arrow's label, the status chip, the ⋯
            menu, Mark Complete and Print left the title no width at all (the
            title is the one thing in the row that may shrink) — harness79
            waited 30 s for a title 0 px wide. The chip and the buttons wrap
            onto their own row under the title on narrow screens. */}
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <BackButton back={back} />
          <div className="flex-1 min-w-0" data-tour="log-header">
            <h2 className="font-bold text-lg truncate leading-tight">
              Drill Log — {contextTitle}{isPart && me?.id === log.drillerUserId ? ' · your part' : ''}
            </h2>
            <p className="text-xs text-navy-200 truncate" data-log-header-line>
              {job?.name} ·{' '}
              {drillerCrewId ? (
                <button className="underline" onClick={() => navigate(`/crew/${drillerCrewId}`)}>
                  {log.drillerName}
                </button>
              ) : (
                log.drillerName || 'unassigned'
              )}{' '}
              · {holes.length} holes · {footage.toFixed(0)} ft
              {isPart && planProgress && planProgress.planned > 0 ? ` · pattern ${progressLine(planProgress, me?.id)}` : ''}
            </p>
          </div>
          <div className="basis-full flex items-center gap-2 sm:contents" data-log-header-actions>
          <Badge variant={STATUS_BADGE[log.status]} data-log-status={log.status} className="mr-auto sm:mr-0">{DRILL_LOG_STATUS_LABEL[log.status]}</Badge>
          {/* S9b follow-up (Matthew, Sep 9): a log opened by mistake on a finished
              pattern could not be removed anywhere — the lifecycle menu, with an
              empty log always deletable by whoever may delete field records */}
          <LifecycleMenu
            table="drillLogs"
            record={log}
            label={`Drill log — ${log.drillerName || 'unassigned'}`}
            kind="drill log"
            allowArchive={false}
            canDeleteOverride={holes.length === 0}
            deleteDescription={holes.length === 0 ? 'This log has no holes. Removing it takes it off the day and the driller\'s home.' : `${holes.length} logged holes go with it. The plan stays.`}
            deleteFn={async () => {
              for (const h of holes) await db.drillLogHoles.delete(h.id);
              await deleteWithTombstone('drillLogs', log.id);
            }}
            onDeleted={() => navigate(log.blastDayId ? `/blast-day/${log.blastDayId}` : '/')}
            buttonClassName="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
          />
          {log.status === 'open' && !isPart && canDrillLogTransition('open', 'complete') && (
            <Button size="sm" variant="secondary" disabled={holes.length === 0}
              data-tour="log-complete"
              onClick={() => { setNoteText(''); setNotePrompt('complete'); }}>
              Mark Complete
            </Button>
          )}
          {log.status === 'complete' && canDrillLogTransition('complete', 'accepted') && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => navigate(`${logBase}/submit`)}>
              <Check className="h-4 w-4 mr-1" /> Accept &amp; File
            </Button>
          )}
          {log.status === 'complete' && canDrillLogTransition('complete', 'open') && (
            <Button size="sm" variant="secondary"
              onClick={() => { setNoteText(''); setNotePrompt('reopen'); }}>
              Reopen
            </Button>
          )}
          {log.status === 'accepted' &&
            filedCopies !== undefined &&
            filedCopies.length === 0 &&
            canDrillLogTransition('complete', 'accepted') && (
              // Backfill: accepted before the archive existed → no office copy
              <Button size="sm" variant="secondary"
                onClick={() => navigate(`${logBase}/submit`)}>
                File to office
              </Button>
            )}
          {log.status === 'accepted' && canDrillLogTransition('accepted', 'complete') && (
            <Button size="sm" variant="secondary" onClick={() => void update({ status: 'complete' })}>
              Reopen
            </Button>
          )}
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title="Print Drill Log"
            onClick={() => navigate(`${logBase}/print`)}
          >
            <Printer className="h-5 w-5" />
          </button>
          </div>
        </div>
      </div>

      <div className={locked ? 'p-4 max-w-3xl mx-auto space-y-4 pointer-events-none opacity-70' : 'p-4 max-w-3xl mx-auto space-y-4'}>
        {log.status === 'accepted' && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            Accepted by {log.acceptedBy || 'blaster'} — this pattern feeds the shot's loading.
          </p>
        )}

        {log.status === 'open' && log.reopenNote && (
          <p className="text-sm text-safety-orange border border-orange-200 bg-orange-50 rounded-lg px-3 py-2">
            ↩ Sent back by the blaster: “{log.reopenNote}”
          </p>
        )}
        {/* S23: the pattern's own line — the plan's version note and who else is on it */}
        {isPart && drillPlan && drillPlan.revisions && drillPlan.revisions.length > 0 && (
          <p className="text-sm text-amber-800 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2" data-log-plan-revision={drillPlan.version ?? 1}>
            Plan v{drillPlan.version ?? 1} · changed {formatDate(drillPlan.revisions[drillPlan.revisions.length - 1].at.slice(0, 10))} by {drillPlan.revisions[drillPlan.revisions.length - 1].byName}
            {drillPlan.revisions[drillPlan.revisions.length - 1].note ? `: “${drillPlan.revisions[drillPlan.revisions.length - 1].note}”` : ''}
          </p>
        )}
        {isPart && drillPlan?.status === 'complete' && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2" data-log-plan-drilled>
            The pattern is drilled{drillPlan.closedShort ? ` — closed short by ${drillPlan.closedShort.byName}: “${drillPlan.closedShort.reason}”` : ''}.
          </p>
        )}
        {log.status !== 'open' && log.completionNote && (
          <p className="text-sm text-navy border border-gray-200 bg-navy-50 rounded-lg px-3 py-2">
            Driller's note: “{log.completionNote}”
          </p>
        )}

        {/* Plan-vs-actual review — what the blaster checks before accepting.
            Informational only: nothing here blocks acceptance. */}
        {log.status === 'complete' && drilling && drilling.planned !== null && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Review against plan — {isPart ? 'the whole pattern' : 'shot-wide'}
            </p>
            <p className="text-sm">
              {drilling.totalHoles} of {drilling.planned} plan holes drilled
              {drilling.undrilled.length > 0 && (
                <span className="text-safety-orange font-medium">
                  {' '}· {drilling.undrilled.length} not drilled
                  {drilling.undrilled.length <= 12 && `: ${drilling.undrilled.join(', ')}`}
                </span>
              )}
            </p>
            {drilling.extras.length > 0 && (
              <p className="text-sm text-gray-600">
                {drilling.extras.length} hole{drilling.extras.length === 1 ? '' : 's'} outside the
                plan: {drilling.extras.slice(0, 12).join(', ')}
              </p>
            )}
            {drilling.flagged.map((f) => (
              <p key={f.holeNumber} className="text-sm text-safety-orange">
                ⚠ Hole {f.holeNumber} — plan {f.plannedDepth} ft, drilled {f.actualDepth} ft (
                {f.depthDelta > 0 ? '+' : ''}
                {f.depthDelta.toFixed(1)})
                {f.angleChanged && ' · angle changed'}
              </p>
            ))}
            {(drilling.wetHoles > 0 || drilling.voidHoles > 0) && (
              <p className="text-sm text-blue-700">
                {drilling.wetHoles > 0 && `${drilling.wetHoles} wet`}
                {drilling.wetHoles > 0 && drilling.voidHoles > 0 && ' · '}
                {drilling.voidHoles > 0 && `${drilling.voidHoles} void`} — check product
                suitability at loading
              </p>
            )}
            {drilling.flagged.length === 0 &&
              drilling.undrilled.length === 0 &&
              drilling.extras.length === 0 && (
                <p className="text-sm text-green-700">✓ Every hole drilled to plan.</p>
              )}
          </div>
        )}

        {log.drillRigEquipmentId && !todayChecklist && editable && (
          <button
            className="w-full text-left text-sm text-safety-orange border border-orange-200 bg-orange-50 rounded-lg px-3 py-2"
            onClick={() =>
              navigate(
                `/drill-checklist/${log.drillRigEquipmentId}?job=${log.jobId}&date=${log.date ?? log.createdAt.slice(0, 10)}${log.blastDayId ? `&day=${log.blastDayId}` : ''}`,
              )
            }
          >
            ⚠ Rig checklist not filed today — tap to file it now.
          </button>
        )}

        {/* Header card — pattern info prefilled from design (S17: the plan's numbers, named as such) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {shot && shot.drillParams.holeDiameter === log.holeDiameter && shot.drillParams.burden === log.burden && shot.drillParams.spacing === log.spacing && (log.holeDiameter > 0 || log.burden > 0) && (
            <p className="col-span-2 sm:col-span-4 text-[11px] text-blue-800 -mb-1" data-log-from-plan>
              Diameter, burden and spacing filled from the blaster's plan — change one only if the ground says otherwise.
            </p>
          )}
          <div><Label className="text-xs">Diameter (in)</Label>
            <DraftInput type="number" value={log.holeDiameter || ''} disabled={!editable} data-log-field="holeDiameter"
              onCommit={(v) => void update({ holeDiameter: parseFloat(v) || 0 })} /></div>
          <div><Label className="text-xs">Burden (ft)</Label>
            <DraftInput type="number" value={log.burden || ''} disabled={!editable} data-log-field="burden"
              onCommit={(v) => void update({ burden: parseFloat(v) || 0 })} /></div>
          <div><Label className="text-xs">Spacing (ft)</Label>
            <DraftInput type="number" value={log.spacing || ''} disabled={!editable} data-log-field="spacing"
              onCommit={(v) => void update({ spacing: parseFloat(v) || 0 })} /></div>
          <div><Label className="text-xs">Face height (ft)</Label>
            <DraftInput type="number" value={log.faceHeight || ''} disabled={!editable} data-log-field="faceHeight"
              onCommit={(v) => void update({ faceHeight: parseFloat(v) || 0 })} /></div>
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Drill rig</Label>
              <span className="flex items-center gap-3">
                {isPart && editable && log.drillRigEquipmentId && (
                  <button
                    type="button"
                    className="text-[11px] text-safety-orange font-semibold underline"
                    data-log-change-rig
                    onClick={() => setRigChange({ toRigId: '', stop: '', down: false, error: null })}
                  >
                    Change rig…
                  </button>
                )}
                {log.drillRigEquipmentId && (
                  <button
                    className="text-[11px] text-navy underline"
                    onClick={() => navigate(`/equipment/${log.drillRigEquipmentId}`)}
                  >
                    rig history
                  </button>
                )}
              </span>
            </div>
            {isPart && (log.rigChanges ?? []).length > 0 && (
              <p className="text-[11px] text-gray-500 mb-1" data-log-rig-changes={(log.rigChanges ?? []).length}>
                {(log.rigChanges ?? []).map((c) => `${rigs.find((r) => r.id === c.fromRigId)?.assetNumber ?? '—'} → ${rigs.find((r) => r.id === c.toRigId)?.assetNumber ?? '—'} ${formatDate(c.at.slice(0, 10))}`).join(' · ')}
              </p>
            )}
            <Select value={log.drillRigEquipmentId ?? ''} disabled={!editable}
              data-log-rig
              onChange={(e) => {
                const id = e.target.value || undefined;
                void update({ drillRigEquipmentId: id });
                // S7 follow-up: the rig you actually log holes on becomes your
                // usual rig — the checklist tile follows it
                if (id) void rememberUsualRig(id);
              }}
              options={[{ value: '', label: 'Pick rig…' },
                ...rigs.map((r) => ({ value: r.id, label: `${r.assetNumber} — ${r.description}` }))]} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Location / GPS</Label>
            <DraftInput value={log.locationNote} placeholder="e.g. NE corner, lift 2" disabled={!editable} data-log-field="locationNote"
              onCommit={(v) => void update({ locationNote: v })} />
          </div>
        </div>

        {/* Quick hole entry */}
        {editable && (
          <div className="rounded-xl border-2 border-safety-orange/40 bg-white p-4 space-y-3" data-tour="log-entry">
            {plan && remaining && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {/* Skipped markers claim a grid position but are NOT
                        drilled holes — the count says so */}
                    Pattern:{' '}
                    <b>{plan.length - remaining.length - (drilling?.skipped.length ?? 0)}</b> of{' '}
                    {plan.length} holes drilled
                    {(drilling?.skipped.length ?? 0) > 0 && ` · ${drilling!.skipped.length} skipped`}
                    {remaining.length === 0 && ' — plan complete ✓'}
                  </span>
                  {planHole && (
                    <span className="font-medium text-navy">
                      Hole {planHole.n} — plan {planTarget} ft
                      {planHole.angle ? ` · ${planHole.angle.toFixed(1)}°` : ''}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded bg-gray-100 overflow-hidden mb-2">
                  <i
                    className="block h-full bg-safety-orange"
                    style={{
                      width: `${Math.min(100, ((plan.length - remaining.length) / plan.length) * 100)}%`,
                    }}
                  />
                </div>
                {/* Round 3: the batch-first grid — tap to select open holes,
                    then one tap logs them all to plan. Deviations are
                    ordinary: skip and add-off-plan sit right beside it. */}
                {/* S8a follow-up: the pattern in the pattern's own shape (rows ×
                    cols from the plan), always on screen; tap holes, a row
                    handle, or "all open" to select; one tap logs them to plan */}
                {(() => {
                  const openNumbers = remaining.filter((r) => !(drilling?.skipped ?? []).includes(String(r.n))).map((r) => String(r.n));
                  const toggle = (ns: string[]) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      const allIn = ns.length > 0 && ns.every((n) => next.has(n));
                      for (const n of ns) allIn ? next.delete(n) : next.add(n);
                      return next;
                    });
                  const diagram = drillPlan ? planToDiagram(drillPlan) : parseDiagram(shot!.designPlan.shotDiagramData);
                  return (
                    <>
                      {openNumbers.length > 0 && (
                        <div className="flex items-center gap-2 mb-1.5 text-xs">
                          <button type="button" className="rounded-md border border-gray-300 px-2 py-1 font-medium text-navy" data-select-all-open onClick={() => toggle(openNumbers)}>
                            {openNumbers.every((n) => selected.has(n)) ? 'Clear' : `Select all open (${openNumbers.length})`}
                          </button>
                          {selected.size > 0 && (
                            <button type="button" className="text-gray-400 underline" onClick={() => setSelected(new Set())}>clear</button>
                          )}
                          <span className="text-gray-400">· R1, R2… selects a row</span>
                        </div>
                      )}
                      <PatternGrid
                        testId="log"
                        diagram={diagram}
                        fallbackDepth={shot?.totals.avgDrillDepth || 0}
                        onTapRow={(_, rowHoles) => toggle(rowHoles.map((h) => String(h.n)).filter((n) => openNumbers.includes(n)))}
                        onTap={(p) => {
                          const n = String(p.n);
                          if (!openNumbers.includes(n)) return;
                          toggle([n]);
                        }}
                        cell={(p) => {
                          const n = String(p.n);
                          const isSkipped = (drilling?.skipped ?? []).includes(n);
                          const isOpen = openNumbers.includes(n);
                          const isSel = selected.has(n);
                          const hasHazard = holes.some((h) => h.holeNumber.trim() === n && h.conditions.length > 0);
                          const depth = +(p.holeLength || p.depth).toFixed(1);
                          return {
                            // S23: a drilled hole on a pattern part wears its driller's initials
                            sub: isOpen ? `${depth}` : isPart && !isSkipped ? holeOwners.get(n) : undefined,
                            title: `H-${n} · plan ${depth} ft${isSkipped ? ' — skipped' : ''}`,
                            disabled: !isOpen,
                            className: isSkipped
                              ? 'border-2 border-dashed border-gray-400 text-gray-400'
                              : isSel
                                ? 'bg-safety-orange text-white ring-2 ring-orange-200'
                                : isOpen
                                  ? 'bg-gray-100 border border-gray-300 text-gray-600'
                                  : hasHazard
                                    ? 'bg-safety-orange/90 text-white'
                                    : 'bg-navy text-white',
                          };
                        }}
                        extras={(drilling?.extras ?? []).map((n) => ({ label: n, className: 'bg-navy text-white', title: `H-${n} — not on the plan` }))}
                      />
                      <p className="text-[11px] text-gray-400 mt-1 mb-1">
                        ● drilled · <span className="text-safety-orange">● hazard</span> · ○ open (planned ft) —
                        tap open holes, a row handle, or "all open" to select{selected.size > 0 && ` · ${selected.size} selected`}.
                        Off-plan hole? Type any number below — ordinary entry.
                      </p>
                    </>
                  );
                })()}

                {selected.size > 0 && (() => {
                  const picks = sortedSelection();
                  const v = planValues(picks[0]);
                  return (
                    <div className="rounded-xl border border-gray-200 p-3 mb-1">
                      <p className="text-sm">
                        <b>
                          H-{picks[0]}
                          {picks.length > 1 && <> … H-{picks[picks.length - 1]}</>}
                        </b>{' '}
                        · plan calls for
                      </p>
                      <p className="text-xs text-gray-400 mb-2">
                        {v ? `${v.target} ft` : '—'}
                        {v?.kick ? ` · kick ${v.kick} ft ${v.kickDir ?? ''}` : ''} ·{' '}
                        {log.holeDiameter}" bit
                      </p>
                      <button
                        className="w-full bg-safety-orange text-white rounded-xl py-2.5 font-bold text-sm hover:bg-orange-600"
                        onClick={() => void logSelectedAsPlanned()}
                      >
                        Log {picks.length} as planned
                      </button>
                      <div className="flex gap-2 mt-2">
                        <button
                          className="flex-1 bg-white border border-gray-300 text-navy rounded-xl py-2 font-semibold text-sm hover:bg-gray-50"
                          onClick={logWithChanges}
                        >
                          Log with changes…
                        </button>
                        <button
                          className="flex-1 bg-white border border-gray-300 text-gray-600 rounded-xl py-2 font-semibold text-sm hover:bg-gray-50"
                          onClick={() => void markSelectedSkipped()}
                        >
                          Mark skipped ⊘
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* THE hole card — what the driller needs at the controls, big */}
            {planHole && (
              <div className="rounded-xl bg-navy text-white px-4 py-3 flex items-end gap-5 flex-wrap">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-navy-200">Hole {planHole.n}</p>
                  <p className="text-[32px] leading-none font-bold font-mono">
                    {planTarget}<span className="text-base font-semibold"> ft</span>
                  </p>
                  {planHole.kick ? (
                    <p className="text-xs text-navy-200 mt-1">{planHole.depth} ft vertical</p>
                  ) : null}
                </div>
                {planHole.angle ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-navy-200">Angle</p>
                    <p className="text-[24px] leading-none font-bold font-mono">
                      {planHole.angle.toFixed(1)}°
                    </p>
                  </div>
                ) : null}
                {planHole.kick ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-navy-200">Kick</p>
                    <p className="text-[24px] leading-none font-bold font-mono">
                      {planHole.kick} ft {planHole.kickDir ?? ''}
                    </p>
                  </div>
                ) : null}
                <div className="ml-auto">
                  <p className="text-[11px] uppercase tracking-wider text-navy-200">Bit</p>
                  <p className="text-[24px] leading-none font-bold font-mono">{log.holeDiameter}"</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <div className="w-24">
                <Label className="text-xs">Hole #</Label>
                <Input value={holeNumber} onChange={(e) => setHoleNumber(e.target.value)} data-hole-number />
              </div>
              <div className="flex-1">
                <Label className="text-xs">
                  Depth drilled (ft) — {planHole ? `plan ${planTarget}` : `design ${designDepth || '—'}`}
                </Label>
                <Input type="number" inputMode="decimal" placeholder={String(targetDepth || '')}
                  value={depth} data-hole-depth onChange={(e) => setDepth(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map(({ code, label }) => {
                const on = conditions.includes(code);
                return (
                  <button key={code} type="button"
                    className={`min-h-[44px] px-4 rounded-full border text-sm font-medium ${
                      on
                        ? code === 'W'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-navy text-white border-navy'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                    onClick={() =>
                      setConditions(on ? conditions.filter((c) => c !== code) : [...conditions, code])
                    }>
                    {code === 'W' && <Droplets className="h-3.5 w-3.5 inline mr-1" />}
                    {label}
                  </button>
                );
              })}
            </div>
            {/* Hazard detail — optional at-depth + note per active condition */}
            {conditions.map((code) => (
              <div key={code} className="flex items-center gap-2 pl-1">
                <span className="text-xs font-bold text-gray-500 w-16">
                  {CONDITIONS.find((c) => c.code === code)?.label}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="w-20 h-10"
                  placeholder="at ft"
                  value={condDetail[code]?.at ?? ''}
                  onChange={(e) =>
                    setCondDetail({
                      ...condDetail,
                      [code]: { at: e.target.value, note: condDetail[code]?.note ?? '' },
                    })
                  }
                />
                <Input
                  className="flex-1 h-10"
                  placeholder={code === 'W' ? 'e.g. water at 8 ft, heavy' : 'note (optional)'}
                  value={condDetail[code]?.note ?? ''}
                  onChange={(e) =>
                    setCondDetail({
                      ...condDetail,
                      [code]: { at: condDetail[code]?.at ?? '', note: e.target.value },
                    })
                  }
                />
              </div>
            ))}
            {showDetail ? (
              <div className="flex gap-2">
                <div className="w-24"><Label className="text-xs">Angle (°)</Label>
                  <Input type="number" value={angle} onChange={(e) => setAngle(e.target.value)} /></div>
                <div className="w-28"><Label className="text-xs">Subdrill (ft)</Label>
                  <Input type="number" placeholder={String(designSubdrill)} value={subdrill}
                    onChange={(e) => setSubdrill(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-xs">Comment</Label>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
              </div>
            ) : (
              <button className="text-xs text-gray-400 underline" onClick={() => setShowDetail(true)}>
                angle / subdrill / comment
              </button>
            )}
            <Button className="w-full" size="lg" onClick={() => void submitHole()} data-add-hole
              disabled={!holeNumber.trim() || adding || alreadyLogged}>
              {adding
                ? 'Adding…'
                : alreadyLogged
                  ? `Hole ${holeNumber.trim()} is already logged`
                  : planHole && depth === ''
                    ? `Add hole ${holeNumber} — ${targetDepth} ft to plan`
                    : `Add hole ${holeNumber}`}
            </Button>
            {(addNote || alreadyLogged) && (
              <p className="text-xs text-amber-800" data-add-hole-note>
                {addNote ?? `Hole ${holeNumber.trim()} is already on this log — find it in the list to change or remove it.`}
              </p>
            )}
          </div>
        )}

        {/* Holes drilled — newest first, windowed (S8a follow-up: 77 rows is not a list) */}
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100" data-holes-list>
          {holes.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
              <span>
                {holes.length} hole{holes.length === 1 ? '' : 's'} · {footage.toFixed(0)} ft
                {holes.filter((h) => h.conditions.length > 0).length > 0 && ` · ${holes.filter((h) => h.conditions.length > 0).length} with conditions`}
              </span>
              {holes.length > 8 && (
                <button className="underline text-navy" data-holes-show-all onClick={() => setShowAllHoles(!showAllHoles)}>
                  {showAllHoles ? 'Show latest 8' : `Show all ${holes.length}`}
                </button>
              )}
            </div>
          )}
          {(showAllHoles ? recentHoles : recentHoles.slice(0, 8)).map((h) => (
            <div key={h.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-mono font-bold text-navy w-10">{h.holeNumber}</span>
              <div className="flex-1 min-w-0 text-sm">
                {h.actualDepth} ft
                {h.angle ? ` · ${h.angle}°` : ''}
                {h.subdrill ? ` · ${h.subdrill} sub` : ''}
                {h.plannedDepth !== undefined &&
                  (Math.abs(h.actualDepth - h.plannedDepth) >= 1 ||
                    (h.angle || 0) !== (h.plannedAngle ?? 0)) && (
                    <span className="text-safety-orange font-medium"> · plan {h.plannedDepth}</span>
                  )}
                {h.comment && <span className="text-gray-400"> · {h.comment}</span>}
              </div>
              {h.conditions.map((c) => (
                <span key={c.code}
                  title={c.note}
                  className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${
                    c.code === 'W' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                  {c.code}
                  {c.note ? ` · ${c.note}` : c.fromFt === c.toFt && c.fromFt > 0 ? ` @${c.fromFt}ft` : ''}
                </span>
              ))}
              <span className="text-[11px] text-gray-300">{formatDate(h.date)}</span>
              {editable && (
                <Button variant="ghost" size="icon" onClick={() => void db.drillLogHoles.delete(h.id)}>
                  <Trash2 className="h-4 w-4 text-gray-300" />
                </Button>
              )}
            </div>
          ))}
          {holes.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No holes yet — log them as you drill.</p>
          )}
        </div>

        {/* Driller media: hole conditions, rig problems, drilled-face photos */}
        <AttachmentsCard
          parentId={log.id}
          parentType="drill_log"
          title="Drill log photos & media"
          defaultKind="photo"
        />

        {/* Handoff-note prompt (complete: driller → blaster; reopen: reverse) */}
        {notePrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
            <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 space-y-3">
              <p className="font-bold">
                {notePrompt === 'complete' ? 'Mark complete' : 'Send back to the driller'}
              </p>
              {/* S9b: "complete" means signed — an unsigned log signs here */}
              {notePrompt === 'complete' && !log.signatureImage && (
                <div data-log-complete-signature>
                  <Label className="text-xs">Your signature — {log.drillerName || me?.name}</Label>
                  <SignatureField value={log.signatureImage} onChange={(blob) => void update({ signatureImage: blob })} />
                </div>
              )}
              {notePrompt === 'complete' && log.drillRigEquipmentId && (
                <p className="text-xs text-gray-500" data-log-meter-note>
                  The rig's meter reading is entered on its checklist — stop the rig from the day's rig list when you park it.
                </p>
              )}
              {/* S20 (Driller Test, Sep 16 2026: "I shouldn't be able to submit this
                  without the rig having been selected"): the rig is what the hours,
                  the checklist and the billing tie to — Complete waits for it */}
              {notePrompt === 'complete' && !log.drillRigEquipmentId && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2 space-y-1" data-log-complete-rig>
                  <Label className="text-xs font-semibold text-red-800">Which rig drilled it?</Label>
                  <p className="text-[11px] text-red-700">A log can't be marked complete without its rig — the hours, the checklist and the billing tie to it.</p>
                  <Select
                    value=""
                    data-log-complete-rig-select
                    onChange={(e) => {
                      const id = e.target.value || undefined;
                      if (!id) return;
                      void update({ drillRigEquipmentId: id });
                      void rememberUsualRig(id);
                    }}
                    options={[{ value: '', label: 'Pick the rig…' },
                      ...rigs.map((r) => ({ value: r.id, label: `${r.assetNumber} — ${r.description}` }))]}
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">
                  {notePrompt === 'complete'
                    ? 'Anything the blaster should know? (optional)'
                    : 'What needs fixing? (optional)'}
                </Label>
                <Input
                  value={noteText}
                  placeholder={notePrompt === 'complete' ? 'e.g. row 3 ran wet, watch the toe' : 'e.g. hole 12 short — re-drill'}
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNotePrompt(null)}>
                  Cancel
                </Button>
                <Button
                  data-log-complete-confirm
                  disabled={notePrompt === 'complete' && (!log.signatureImage || !log.drillRigEquipmentId)}
                  onClick={() => {
                    const note = noteText.trim() || undefined;
                    if (notePrompt === 'complete') {
                      // completing clears any sent-back reason from last round;
                      // the navigation round (Matthew): finishing lands forward —
                      // on the day (or the plan), where the log reads Signed complete
                      void update({
                        status: 'complete',
                        completedAt: nowISO(),
                        completionNote: note,
                        reopenNote: undefined,
                        sentBackAt: undefined,
                        sentBackByName: undefined,
                      }).then(async () => {
                        // S23: the last driller to close his part may close the pattern
                        // short when holes remain — the pattern turns Drilled by itself
                        // only at the full count
                        if (isPart && drillPlan && drillPlan.status === 'open') {
                          const others = await db.drillLogs.filter((l) => l.drillPlanId === drillPlan.id && l.id !== log.id && l.status === 'open').count();
                          const p = await (await import('@/hooks/useDrillPlans')).planProgress(drillPlan.id);
                          if (others === 0 && p && p.notDrilled > 0 && p.plan.status === 'open') {
                            setCloseShort('');
                            return;
                          }
                        }
                        if (back) back.go();
                        else navigate(log.blastDayId ? `/blast-day/${log.blastDayId}` : `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`, { replace: true });
                      });
                    } else {
                      void update({ status: 'open', reopenNote: note, sentBackAt: nowISO(), sentBackByName: me?.name ?? '' });
                    }
                    setNotePrompt(null);
                  }}
                >
                  {notePrompt === 'complete'
                    ? !log.drillRigEquipmentId
                      ? 'Pick the rig first'
                      : log.signatureImage
                        ? isPart ? 'My part is done' : 'Complete'
                        : isPart ? 'Sign — my part is done' : 'Sign and complete'
                    : 'Send back'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Driller signature (part of marking complete) — and Mark complete right
            here, so nobody scrolls back to the top after signing (Matthew, S8a) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <Label className="text-xs">Driller signature — {log.drillerName || me?.name}</Label>
            <SignatureField
              value={log.signatureImage}
              onChange={(blob) => void update({ signatureImage: blob })}
            />
          </div>
          {log.status === 'open' && !isPart && canDrillLogTransition('open', 'complete') && (
            <Button
              className="w-full"
              size="lg"
              disabled={holes.length === 0}
              data-log-complete-bottom
              onClick={() => { setNoteText(''); setNotePrompt('complete'); }}
            >
              <Check className="h-4 w-4 mr-1" /> Mark complete{holes.length > 0 ? ` · ${holes.length} holes` : ''}
            </Button>
          )}
          {/* S23: the end of a drilling day on a pattern — Done for today leaves the part
              open, My part is done signs it once; both wait for today's rig checklist */}
          {log.status === 'open' && isPart && canDrillLogTransition('open', 'complete') && (
            <div className="space-y-2" data-log-end-of-day>
              {checklistGate && (
                <button
                  type="button"
                  className="w-full text-left text-sm text-amber-900 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2"
                  data-log-checklist-gate={checklistGate.kind}
                  onClick={() => navigate(checklistGate.to)}
                >
                  {checklistGate.text} · <span className="font-semibold underline">Open the checklist ›</span>
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                  disabled={Boolean(checklistGate)}
                  data-log-done-today
                  onClick={() => {
                    if (back) back.go();
                    else navigate(`/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`, { replace: true });
                  }}
                >
                  Done for today
                </Button>
                <Button
                  className="flex-[2] min-h-[48px]"
                  size="lg"
                  disabled={holes.length === 0 || Boolean(checklistGate)}
                  data-log-part-done
                  onClick={() => { setNoteText(''); setNotePrompt('complete'); }}
                >
                  <Check className="h-4 w-4 mr-1" /> My part is done{holes.length > 0 ? ` · ${holes.length} holes` : ''}
                </Button>
              </div>
            </div>
          )}
          {log.status === 'complete' && (
            <p className="text-sm text-green-700 text-center" data-log-complete-done>
              {isPart ? '✓ Your part is signed — the blaster accepts the drill log from the pattern.' : '✓ Marked complete — the blaster reviews it from the day.'}
            </p>
          )}
        </div>

        {rigChange && (
          <ConsequenceSheet onClose={() => setRigChange(null)}>
            <div data-log-rig-change-sheet>
              <h3 className="font-bold text-lg">Change rig</h3>
              <p className="text-xs text-gray-500 mb-2">
                {rigs.find((r) => r.id === log.drillRigEquipmentId)?.assetNumber ?? 'The old rig'}'s checklist takes its stop hours now; the new rig's checklist opens for its start hours, and every hole from here on carries the new rig.
              </p>
              {todayChecklist && todayChecklist.stopHours == null && !todayChecklist.outOfService && (
                <div className="mb-2">
                  <Label className="text-xs">{rigs.find((r) => r.id === log.drillRigEquipmentId)?.assetNumber} — stop hours (started at {todayChecklist.startingHours ?? '—'})</Label>
                  <Input type="number" inputMode="decimal" className="font-mono" value={rigChange.stop} data-log-rig-change-stop placeholder="read the gauge" onChange={(e) => setRigChange({ ...rigChange, stop: e.target.value, error: null })} />
                  <label className="flex items-center gap-2 text-sm mt-2 cursor-pointer">
                    <input type="checkbox" checked={rigChange.down} data-log-rig-change-down onChange={(e) => setRigChange({ ...rigChange, down: e.target.checked })} />
                    <span className={rigChange.down ? 'font-semibold text-safety-orange' : ''}>It is out of service — open a ticket for the shop</span>
                  </label>
                </div>
              )}
              <Label className="text-xs">The new rig</Label>
              <Select
                value={rigChange.toRigId}
                data-log-rig-change-to
                onChange={(e) => setRigChange({ ...rigChange, toRigId: e.target.value })}
                options={[{ value: '', label: 'Pick the rig…' }, ...rigs.filter((r) => r.id !== log.drillRigEquipmentId).map((r) => ({ value: r.id, label: `${r.assetNumber} — ${r.description}` }))]}
              />
              {rigChange.error && <p className="text-xs text-red-700 mt-1" data-log-rig-change-error>{rigChange.error}</p>}
              <Button className="w-full mt-3 min-h-[48px]" disabled={!rigChange.toRigId} data-log-rig-change-go onClick={() => void changeRig()}>
                Change rig and open its checklist
              </Button>
              <Button variant="outline" className="w-full mt-2" onClick={() => setRigChange(null)}>Cancel</Button>
            </div>
          </ConsequenceSheet>
        )}

        {closeShort !== null && drillPlan && (
          <ConsequenceSheet onClose={() => setCloseShort(null)}>
            <div data-log-close-short-sheet>
              <h3 className="font-bold text-lg">Close the pattern short?</h3>
              <p className="text-xs text-gray-500 mb-2">
                Your part is signed and nobody else has an open part, but {planProgress?.notDrilled ?? 'some'} planned hole{(planProgress?.notDrilled ?? 2) === 1 ? '' : 's'} {(planProgress?.notDrilled ?? 2) === 1 ? 'is' : 'are'} not drilled. Close it with the reason, or leave it open for another day.
              </p>
              <Textarea rows={2} value={closeShort} data-log-close-short-reason placeholder="e.g. the ledge ends at row 4 — the last row is not rock" onChange={(e) => setCloseShort(e.target.value)} />
              <Button
                className="w-full mt-3 min-h-[48px]"
                disabled={!closeShort.trim()}
                data-log-close-short-go
                onClick={() => void closePlanShort(drillPlan, closeShort).then(() => { setCloseShort(null); navigate(`/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`, { replace: true }); })}
              >
                Close the pattern short
              </Button>
              <Button variant="outline" className="w-full mt-2" data-log-close-short-leave onClick={() => { setCloseShort(null); navigate(`/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`, { replace: true }); }}>
                Leave it open
              </Button>
            </div>
          </ConsequenceSheet>
        )}
      </div>
    </div>
  );
}
