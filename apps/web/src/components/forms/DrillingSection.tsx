// Per-shot drilling status: the blaster's window into the drill logs
// serving this pattern. Request drilling → drillers log holes → review/
// accept each signed log. Aggregates across N logs (multiple drillers/
// days per shot is normal).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drill, Plus, Send, X } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { can } from '@/lib/perms';
import { createDrillLog, getShotPlan, useShotDrilling } from '@/hooks/useDrillLogs';
import { applyPlanToShot, shotCandidates, usePatternFacts } from '@/hooks/useDrillPlans';
import { PatternPickSheet } from './PatternPickSheet';
import { materializeDrillPlan, parseDiagram } from '@/lib/shotDiagram';
import { getSessionUser } from '@/lib/session';
import { formatDate } from '@/lib/utils';
import { hhmm } from '@/lib/dayCard';
import { useLiveQuery, db } from '@/db';
import type { ExplosiveUsage, Shot } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/** S23 push 2 (Matthew's v3 item 6: "messy"; the drill log must be per hole):
 *  a shot made from a drilled pattern shows the drilling as label/value facts —
 *  the pattern, the drill log's parts with rigs and signed dates, the drilled
 *  dates, the count and footage, off-plan and water holes, who accepted. */
function PatternFactsCard({ shot }: { shot: Shot }) {
  const navigate = useNavigate();
  const facts = usePatternFacts(shot.drillPlanId);
  const jobId = useLiveQuery(async () => {
    const log = await db.blastLogs.get(shot.blastLogId);
    const day = log ? await db.blastDays.get(log.blastDayId) : undefined;
    return day?.jobId;
  }, [shot.blastLogId]);
  if (!facts) return <p className="text-xs text-gray-400">Loading the pattern…</p>;
  const Row = ({ k, v, test }: { k: string; v: string; test: string }) => (
    <div className="flex gap-2 text-sm py-1 border-t border-gray-100 first:border-t-0" data-shot-fact={test}>
      <span className="w-28 shrink-0 text-xs text-gray-500 uppercase tracking-wide pt-0.5">{k}</span>
      <span className="flex-1 min-w-0">{v}</span>
    </div>
  );
  const short = (iso?: string) => (iso ? formatDate(iso.slice(0, 10)) : '—');
  return (
    <div className="rounded-lg border border-gray-200 p-3" data-shot-pattern-facts={facts.planId}>
      <div className="flex items-center gap-2 mb-1">
        <Drill className="h-4 w-4 text-gray-400" />
        <p className="text-sm font-semibold flex-1">Drilling — from the pattern</p>
        <button type="button" className="text-xs text-navy underline" data-shot-open-pattern onClick={() => jobId && navigate(`/jobs/${jobId}/drill-plan/${facts.planId}`)}>
          Open the pattern ›
        </button>
      </div>
      <Row k="Drill plan" v={`${facts.name}${facts.version > 1 ? ` · v${facts.version}` : ''} · ${facts.word}`} test="plan" />
      <Row k="Drill log" v={facts.parts.length ? facts.parts.map((p) => `${p.name}${p.rigs.length ? ` (${p.rigs.join(', ')})` : ''}${p.signedAt ? ` · signed ${short(p.signedAt)}` : ` · ${p.status}`}`).join(' · ') : '—'} test="log" />
      <Row k="Drilled" v={facts.from ? (facts.to && facts.to !== facts.from ? `${short(facts.from)} – ${short(facts.to)}` : short(facts.from)) : '—'} test="dates" />
      <Row k="Holes" v={`${facts.holes} of ${facts.planned} · ${Math.round(facts.footage)} ft${facts.notDrilled ? ` · ${facts.notDrilled} not drilled` : ''}`} test="holes" />
      <Row k="Off-plan · water" v={`${facts.offPlan} off-plan · ${facts.wet} wet${facts.voids ? ` · ${facts.voids} void` : ''}`} test="flags" />
      <Row k="Accepted" v={facts.acceptedBy ? `${facts.acceptedBy} · ${facts.acceptedAt ? `${short(facts.acceptedAt)} ${hhmm(facts.acceptedAt)}` : ''}` : 'not yet'} test="accepted" />
    </div>
  );
}

/** Product categories that don't belong in wet holes */
const NON_WATER_RESISTANT = new Set(['anfo', 'bulk']);

/**
 * Loading-time guard: when accepted drill logs report wet holes and the
 * chosen products include non-water-resistant ones, say so loudly.
 */
export function WetHoleLoadingWarning({
  shots,
  explosiveUsage,
}: {
  shots: Shot[];
  explosiveUsage: ExplosiveUsage | undefined;
}) {
  const wet =
    useLiveQuery(async () => {
      let count = 0;
      const perShot: string[] = [];
      for (const shot of shots) {
        const logs = await db.drillLogs.where('shotId').equals(shot.id).toArray();
        let shotWet = 0;
        for (const log of logs) {
          const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
          shotWet += holes.filter((h) => h.conditions.some((c) => c.code === 'W')).length;
        }
        if (shotWet > 0) {
          count += shotWet;
          perShot.push(`Shot ${shot.shotNumber}: ${shotWet}`);
        }
      }
      return { count, perShot };
    }, [shots.map((s) => s.id).join(',')]) ?? { count: 0, perShot: [] };

  if (wet.count === 0) return null;
  const products = explosiveUsage?.products ?? [];
  const risky = products.filter((p) => {
    const cat = (p as { category?: string }).category;
    return cat ? NON_WATER_RESISTANT.has(cat) : false;
  });

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm border ${
        risky.length > 0
          ? 'bg-orange-50 border-orange-200 text-safety-orange font-medium'
          : 'bg-blue-50 border-blue-200 text-blue-700'
      }`}
    >
      💧 Drillers logged {wet.count} wet hole{wet.count === 1 ? '' : 's'} ({wet.perShot.join(' · ')}).
      {risky.length > 0
        ? ` The load includes ${risky.length} non-water-resistant product${risky.length === 1 ? '' : 's'} — confirm suitability or switch to WR/emulsion.`
        : ' Products chosen look water-suitable — verify at the hole.'}
    </div>
  );
}

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

/** Dispatch modal: pick who the drill plan goes to. Each pick becomes a
 *  pre-assigned open log on that driller's home ("Assigned to you").
 *  Exported for the day page's DrillPlanCard — one dispatch UI everywhere. */
export function SendToDrillersModal({
  shot,
  blastDayId,
  jobId,
  alreadyAssigned,
  onClose,
  onSent,
}: {
  shot: Shot;
  blastDayId: string;
  jobId: string;
  alreadyAssigned: Set<string>;
  onClose: () => void;
  /** S8: called after logs were created (the plan page returns to the day) */
  onSent?: (count: number) => void;
}) {
  const crewQuery = useLiveQuery(() => db.crewMembers.filter((c) => c.isActive).toArray());
  const crew = crewQuery ?? [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  // Drillers first, then the rest of the enrolled crew, then not-enrolled
  const sorted = [...crew].sort((a, b) => {
    const rank = (c: (typeof crew)[number]) =>
      !c.userId ? 2 : c.role === 'driller' ? 0 : 1;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const send = async () => {
    setSending(true);
    let n = 0;
    for (const c of crew) {
      if (!c.userId || !picked.has(c.id)) continue;
      await createDrillLog(shot, blastDayId, jobId, { userId: c.userId, name: c.name });
      n++;
    }
    onSent?.(n);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
      {/* S8: header and Send stay put; only the crew list scrolls (Matthew:
          "I have to scroll the whole list of drillers to get to the send button").
          z-[60]: the sheet covers the mobile nav (z-50) instead of hiding under it. */}
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 pb-[max(1rem,var(--sab))] max-h-[80vh] flex flex-col" data-send-drillers>
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold">Send drill plan to…</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Each person gets this shot in their queue with the plan attached.
        </p>
        <div className="space-y-1 overflow-auto flex-1 min-h-0 pr-1">
          {sorted.map((c) => {
            const assigned = c.userId ? alreadyAssigned.has(c.userId) : false;
            const disabled = !c.userId || assigned;
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  disabled ? 'border-gray-100 opacity-50' : 'border-gray-200 cursor-pointer hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-gray-300 text-navy"
                  disabled={disabled}
                  checked={assigned || picked.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    setPicked(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{c.name}</span>
                  <span className="block text-xs text-gray-400">
                    {assigned ? 'already sent' : !c.userId ? 'not enrolled — no app account' : c.role || 'crew'}
                  </span>
                </span>
              </label>
            );
          })}
          {crewQuery === undefined && <p className="text-sm text-gray-400 py-2">Loading the roster…</p>}
          {crewQuery !== undefined && sorted.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No active crew on the roster yet.</p>
          )}
        </div>
        <Button className="w-full mt-3" disabled={picked.size === 0 || sending} onClick={() => void send()}>
          <Send className="h-4 w-4 mr-1" />
          {sending ? 'Sending…' : `Send to ${picked.size || '…'}`}
        </Button>
      </div>
    </div>
  );
}

export function DrillingSection({
  shot,
  blastDayId,
  jobId,
}: {
  shot: Shot;
  blastDayId: string;
  jobId: string;
}) {
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  const drilling = useShotDrilling(shot.id);
  const canRequest = can('drillLogs', 'PUT');
  // S18 (Matthew: "I'm not able to do a second drill plan for it"): the door
  // to build this shot's plan sits here, where he looked, until a plan exists.
  // S23 push 2: that door is gone — the pattern is a paper of the job; a shot
  // with no pattern is laid onto one from the job ("From a drilled pattern…")
  // or is drilled by others and filled by hand.
  const plan = getShotPlan(shot);
  const [showSend, setShowSend] = useState(false);
  const [pickPattern, setPickPattern] = useState(false);
  const hasPatterns = useLiveQuery(async () => (await shotCandidates(jobId)).length > 0, [jobId]) ?? false;
  const assignedUserIds = new Set((drilling?.logs ?? []).map((l) => l.drillerUserId).filter(Boolean));

  const start = async () => {
    const logId = await createDrillLog(shot, blastDayId, jobId);
    navigate(`/blast-day/${blastDayId}/drill-log/${logId}`);
  };

  if (shot.drillPlanId) return <PatternFactsCard shot={shot} />;

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Drill className="h-4 w-4 text-gray-400" />
        <p className="text-sm font-semibold flex-1">
          Drilling
          {drilling && drilling.totalHoles > 0 && (
            <span className="font-normal text-gray-500">
              {' '}
              — {drilling.totalHoles} holes
              {drilling.planned
                ? ` of ${drilling.planned} planned`
                : shot.totals.numHoles
                  ? ` of ${shot.totals.numHoles} designed`
                  : ''}{' '}
              · {drilling.totalFootage.toFixed(0)} ft
            </span>
          )}
        </p>
        {canRequest && (
          <>
            {plan ? (
              <Button
                size="sm"
                variant={drilling?.logs.length ? 'outline' : 'default'}
                onClick={() => setShowSend(true)}
                title="Pick which drillers this plan goes to"
              >
                <Send className="h-4 w-4 mr-1" />
                {drilling?.logs.length ? 'Send to more' : 'Send to drillers'}
              </Button>
            ) : hasPatterns && can('shots', 'PATCH') ? (
              <Button
                size="sm"
                data-shot-from-pattern={shot.id}
                onClick={() => setPickPattern(true)}
                title="Lay one of the job's drilled patterns onto this shot"
              >
                <Drill className="h-4 w-4 mr-1" />
                From a drilled pattern…
              </Button>
            ) : null}
            {plan && (
              <Button size="sm" variant="outline" onClick={() => void start()} title="Start a drill log yourself">
                <Plus className="h-4 w-4 mr-1" />
                Log
              </Button>
            )}
          </>
        )}
      </div>
      {!plan && !hasPatterns && (drilling?.logs.length ?? 0) === 0 && (
        <p className="text-xs text-gray-500" data-shot-drilled-by-others>
          Drilled by others — no pattern on this job. Fill the shot's holes and footage by hand, or plan the drilling from the + for next time.
        </p>
      )}
      {pickPattern && (
        <PatternPickSheet
          jobId={jobId}
          many={false}
          allowBlank={false}
          title={`Shot ${shot.shotNumber} — from which pattern?`}
          onPick={async (ids) => { if (ids[0]) await applyPlanToShot(shot.id, ids[0]); }}
          onClose={() => setPickPattern(false)}
        />
      )}
      {drilling && drilling.wetHoles > 0 && (
        <p className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
          💧 {drilling.wetHoles} wet hole{drilling.wetHoles === 1 ? '' : 's'} logged — check
          product suitability when loading.
        </p>
      )}
      <PlanCoverageBadge shot={shot} />
      {drilling && drilling.duplicateNumbers.length > 0 && (
        <p className="text-xs text-safety-orange">
          ⚠ hole number{drilling.duplicateNumbers.length === 1 ? '' : 's'}{' '}
          {drilling.duplicateNumbers.join(', ')} appear in more than one log.
        </p>
      )}
      {drilling && drilling.planned !== null && drilling.totalHoles > 0 && (
        <>
          {drilling.undrilled.length > 0 && (
            <p className="text-xs text-safety-orange">
              ⚠ {drilling.undrilled.length} plan hole{drilling.undrilled.length === 1 ? '' : 's'} not
              drilled{drilling.undrilled.length <= 12 && `: ${drilling.undrilled.join(', ')}`}
            </p>
          )}
          {drilling.flagged.length > 0 && (
            <p className="text-xs text-safety-orange">
              ⚠ {drilling.flagged.length} hole{drilling.flagged.length === 1 ? '' : 's'} off plan (
              {drilling.flagged
                .slice(0, 6)
                .map((f) => `#${f.holeNumber} ${f.depthDelta > 0 ? '+' : ''}${f.depthDelta.toFixed(1)} ft`)
                .join(', ')}
              {drilling.flagged.length > 6 ? ', …' : ''})
            </p>
          )}
          {drilling.undrilled.length === 0 && drilling.flagged.length === 0 && (
            <p className="text-xs text-green-700">✓ Pattern drilled to plan.</p>
          )}
        </>
      )}
      {drilling?.logs.map((log) => (
        <button
          key={log.id}
          className="w-full flex items-center gap-2 text-left text-sm py-1.5 border-t border-gray-100 hover:bg-gray-50"
          onClick={() => navigate(`/blast-day/${blastDayId}/drill-log/${log.id}`)}
        >
          <span className="flex-1 min-w-0 truncate">
            {log.drillerName || 'unassigned'} · {log.holeCount} holes · {log.footage.toFixed(0)} ft
            {log.wetHoles > 0 && <span className="text-blue-600"> · {log.wetHoles} wet</span>}
            {log.deviations > 0 && (
              <span className="text-safety-orange"> · {log.deviations} off-plan</span>
            )}
            {log.assignedBy && <span className="text-gray-400"> · sent by {log.assignedBy}</span>}
          </span>
          <Badge variant={STATUS_BADGE[log.status]}>{log.status}</Badge>
        </button>
      ))}
      {(!drilling || drilling.logs.length === 0) && (plan || hasPatterns) && (
        <p className="text-xs text-gray-400">
          {drilling?.planned
            ? '⚠ Plan ready but not sent to a driller yet.'
            : 'No drilling on this shot yet — lay a drilled pattern onto it, or fill it by hand.'}
        </p>
      )}

      {showSend && (
        <SendToDrillersModal
          shot={shot}
          blastDayId={blastDayId}
          jobId={jobId}
          alreadyAssigned={assignedUserIds as Set<string>}
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}

/** After "Import from drill plan": does the shot's design use every hole
 *  that was actually drilled on the plan? Mark's verification ask. */
function PlanCoverageBadge({ shot }: { shot: Shot }) {
  const check = useLiveQuery(async () => {
    if (!shot.drillPlanId) return null;
    const plan = await db.drillPlans.get(shot.drillPlanId);
    if (!plan) return null;
    const logs = await db.drillLogs.filter((l) => l.drillPlanId === plan.id).toArray();
    let drilledCount = 0;
    for (const l of logs) drilledCount += await db.drillLogHoles.where('drillLogId').equals(l.id).count();
    const shotHoles = materializeDrillPlan(
      parseDiagram(shot.designPlan.shotDiagramData),
      shot.totals.avgDrillDepth || 0,
    ).length;
    return { name: plan.name, drilledCount, shotHoles };
  }, [shot.drillPlanId, shot.designPlan.shotDiagramData]);
  if (!check || check.drilledCount === 0) return null;
  const covered = check.shotHoles >= check.drilledCount;
  return covered ? (
    <p className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
      ✓ Shot plan covers all {check.drilledCount} drilled holes from {check.name}.
    </p>
  ) : (
    <p className="text-xs font-medium text-safety-orange bg-orange-50 border border-orange-200 rounded px-2 py-1">
      ⚠ Only {check.shotHoles} of {check.drilledCount} drilled holes from {check.name} are in
      this shot plan — {check.drilledCount - check.shotHoles} drilled hole
      {check.drilledCount - check.shotHoles === 1 ? '' : 's'} unused.
    </p>
  );
}
