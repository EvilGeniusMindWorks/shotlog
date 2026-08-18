// One driller's signed drill log for a shot. Fast entry: hole number
// auto-increments, depth defaults to the pattern's design, conditions are
// single-tap toggles. Blaster accepts a completed log to take the pattern
// for loading (which locks it against driller edits — server-enforced).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Droplets, Printer, Trash2 } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { canDrillLogTransition, canEditAcceptedLog } from '@/lib/perms';
import { useLiveQuery, db } from '@/db';
import { addHole, aggregateDrilling, drilledHoleNumbers, getShotPlan, nextHoleNumber } from '@/hooks/useDrillLogs';
import { getPlanHoles, planDrilledHoleNumbers, planToDiagram } from '@/hooks/useDrillPlans';
import { parseDiagram } from '@/lib/shotDiagram';
import { DrillPlanDiagram } from '@/components/design/DrillPlanDiagram';
import { AttachmentsCard } from '@/components/forms/AttachmentsCard';
import { useSubmissions } from '@/lib/archive';
import { findCrewId } from '@/lib/personHistory';
import { getSessionUser } from '@/lib/session';
import { nowISO, formatDate } from '@/lib/utils';
import type { HoleCondition, HoleConditionCode } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/undo-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';
import { useTodayChecklist } from '@/hooks/useMaintenance';

const CONDITIONS: { code: HoleConditionCode; label: string }[] = [
  { code: 'W', label: 'Water' },
  { code: 'V', label: 'Void' },
  { code: 'SR', label: 'Soft Rock' },
  { code: 'O', label: 'Overburden' },
];

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

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
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];

  const todayChecklist = useTodayChecklist(log?.drillRigEquipmentId);

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
  const [showMap, setShowMap] = useState(true);
  // Handoff-note prompts: driller → blaster at complete, blaster → driller at reopen
  const [notePrompt, setNotePrompt] = useState<'complete' | 'reopen' | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!log || holeNumber) return;
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
  }, [log?.id, plan !== null, drilled !== undefined]);

  // Jumping to a different hole pulls in ITS planned angle
  useEffect(() => {
    const p = plan?.find((x) => String(x.n) === holeNumber.trim());
    if (p) setAngle(String(p.angle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  if (!log) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  // Where "back", "print", and "accept" go depends on the log's world
  const backTo = log.drillPlanId
    ? `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}`
    : `/blast-day/${log.blastDayId}`;
  const logBase = log.drillPlanId
    ? `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}/log/${log.id}`
    : `/blast-day/${log.blastDayId}/drill-log/${log.id}`;
  const contextTitle = drillPlan ? drillPlan.name : `Shot ${shot?.shotNumber ?? '?'}`;

  const designDepth = shot?.totals.avgDrillDepth || log.faceHeight || 0;
  const designSubdrill = shot?.drillParams.subDrill ?? 0;
  const locked = log.status === 'accepted' && !canEditAcceptedLog();
  const editable = !locked && log.status !== 'accepted';
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const planHole = plan?.find((p) => String(p.n) === holeNumber.trim());
  // The driller drills the LENGTH — for kicked holes that's longer than the
  // vertical depth, so it is the plan target everywhere on this page
  const planTarget = planHole ? +(planHole.holeLength || planHole.depth).toFixed(1) : undefined;
  const targetDepth = planTarget || designDepth;

  const update = (changes: Record<string, unknown>) =>
    db.drillLogs.update(log.id, { ...changes, updatedAt: nowISO() });

  const submitHole = async () => {
    const d = parseFloat(depth) || targetDepth;
    if (!holeNumber.trim() || d <= 0) return;
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
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">
              Drill Log — {contextTitle}
            </h2>
            <p className="text-xs text-navy-200 truncate">
              {job?.name} ·{' '}
              {drillerCrewId ? (
                <button className="underline" onClick={() => navigate(`/crew/${drillerCrewId}`)}>
                  {log.drillerName}
                </button>
              ) : (
                log.drillerName || 'unassigned'
              )}{' '}
              · {holes.length} holes · {footage.toFixed(0)} ft
            </p>
          </div>
          <Badge variant={STATUS_BADGE[log.status]}>{log.status}</Badge>
          {log.status === 'open' && canDrillLogTransition('open', 'complete') && (
            <Button size="sm" variant="secondary" disabled={holes.length === 0}
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
              Un-accept
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
              Review against plan — shot-wide
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
            onClick={() => navigate(`/drill-checklist/${log.drillRigEquipmentId}?job=${log.jobId}`)}
          >
            ⚠ Rig checklist not filed today — tap to file it now.
          </button>
        )}

        {/* Header card — pattern info prefilled from design */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label className="text-xs">Diameter (in)</Label>
            <Input type="number" value={log.holeDiameter || ''} disabled={!editable}
              onChange={(e) => void update({ holeDiameter: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Burden (ft)</Label>
            <Input type="number" value={log.burden || ''} disabled={!editable}
              onChange={(e) => void update({ burden: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Spacing (ft)</Label>
            <Input type="number" value={log.spacing || ''} disabled={!editable}
              onChange={(e) => void update({ spacing: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Face height (ft)</Label>
            <Input type="number" value={log.faceHeight || ''} disabled={!editable}
              onChange={(e) => void update({ faceHeight: parseFloat(e.target.value) || 0 })} /></div>
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Drill rig</Label>
              {log.drillRigEquipmentId && (
                <button
                  className="text-[11px] text-navy underline"
                  onClick={() => navigate(`/equipment/${log.drillRigEquipmentId}`)}
                >
                  rig history
                </button>
              )}
            </div>
            <Select value={log.drillRigEquipmentId ?? ''} disabled={!editable}
              onChange={(e) => void update({ drillRigEquipmentId: e.target.value || undefined })}
              options={[{ value: '', label: 'Pick rig…' },
                ...rigs.map((r) => ({ value: r.id, label: `${r.assetNumber} — ${r.description}` }))]} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Location / GPS</Label>
            <Input value={log.locationNote} placeholder="e.g. NE corner, lift 2" disabled={!editable}
              onChange={(e) => void update({ locationNote: e.target.value })} />
          </div>
        </div>

        {/* Quick hole entry */}
        {editable && (
          <div className="rounded-xl border-2 border-safety-orange/40 bg-white p-4 space-y-3">
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
                {remaining.length > 0 && (
                  <>
                    <div className="grid grid-cols-10 gap-1.5 mb-1">
                      {plan!.map((p) => {
                        const n = String(p.n);
                        const isSkipped = (drilling?.skipped ?? []).includes(n);
                        const isOpen = remaining.some((r) => String(r.n) === n);
                        const isSel = selected.has(n);
                        const hasHazard = holes.some(
                          (h) => h.holeNumber.trim() === n && h.conditions.length > 0,
                        );
                        return (
                          <button
                            key={p.n}
                            type="button"
                            title={`H-${n} · plan ${+(p.holeLength || p.depth).toFixed(1)} ft${isSkipped ? ' — skipped' : ''}`}
                            className={
                              'aspect-square rounded-full min-h-[28px] text-[10px] font-mono font-bold ' +
                              (isSkipped
                                ? 'border-2 border-dashed border-gray-400 text-gray-400'
                                : isSel
                                  ? 'bg-safety-orange text-white ring-2 ring-orange-200'
                                  : isOpen
                                    ? 'bg-gray-200 text-gray-500'
                                    : hasHazard
                                      ? 'bg-safety-orange/90 text-white'
                                      : 'bg-navy text-white')
                            }
                            onClick={() => {
                              if (!isOpen || isSkipped) return;
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(n)) next.delete(n);
                                else next.add(n);
                                return next;
                              });
                            }}
                          >
                            {p.n}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 mb-1">
                      ● drilled · <span className="text-safety-orange">● hazard</span> · ○ open —
                      tap open holes to select{selected.size > 0 && ` · ${selected.size} selected`}.
                      Off-plan hole? Type any number below — ordinary entry.
                    </p>
                  </>
                )}

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
                <Input value={holeNumber} onChange={(e) => setHoleNumber(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">
                  Depth drilled (ft) — {planHole ? `plan ${planTarget}` : `design ${designDepth || '—'}`}
                </Label>
                <Input type="number" inputMode="decimal" placeholder={String(targetDepth || '')}
                  value={depth} onChange={(e) => setDepth(e.target.value)} />
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
            <Button className="w-full" size="lg" onClick={() => void submitHole()}
              disabled={!holeNumber.trim()}>
              {planHole && depth === ''
                ? `Add hole ${holeNumber} — ${targetDepth} ft to plan`
                : `Add hole ${holeNumber}`}
            </Button>
          </div>
        )}

        {/* The blaster's pattern map — read-only reference; tap targets a hole */}
        {plan && (shot || drillPlan) && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Pattern plan
              </p>
              <button
                className="text-xs text-gray-400 underline"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? 'Hide' : 'Show'}
              </button>
            </div>
            {showMap && (
              <DrillPlanDiagram
                diagram={
                  drillPlan
                    ? planToDiagram(drillPlan)
                    : parseDiagram(shot!.designPlan.shotDiagramData)
                }
                fallbackDepth={shot?.totals.avgDrillDepth || 0}
                drilled={drilled}
                selected={holeNumber.trim()}
                onTapHole={editable ? (n) => setHoleNumber(String(n)) : undefined}
              />
            )}
          </div>
        )}

        {/* Holes drilled */}
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {holes.map((h) => (
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
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 space-y-3">
              <p className="font-bold">
                {notePrompt === 'complete' ? 'Mark complete' : 'Send back to the driller'}
              </p>
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
                  onClick={() => {
                    const note = noteText.trim() || undefined;
                    if (notePrompt === 'complete') {
                      // completing clears any sent-back reason from last round
                      void update({
                        status: 'complete',
                        completedAt: nowISO(),
                        completionNote: note,
                        reopenNote: undefined,
                      });
                    } else {
                      void update({ status: 'open', reopenNote: note });
                    }
                    setNotePrompt(null);
                  }}
                >
                  {notePrompt === 'complete' ? 'Complete' : 'Send back'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Driller signature (part of marking complete) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Label className="text-xs">Driller signature — {log.drillerName || me?.name}</Label>
          <SignatureField
            value={log.signatureImage}
            onChange={(blob) => void update({ signatureImage: blob })}
          />
        </div>
      </div>
    </div>
  );
}
