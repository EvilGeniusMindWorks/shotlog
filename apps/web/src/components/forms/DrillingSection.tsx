// Per-shot drilling status: the blaster's window into the drill logs
// serving this pattern. Request drilling → drillers log holes → review/
// accept each signed log. Aggregates across N logs (multiple drillers/
// days per shot is normal).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drill, Plus, Send, X } from 'lucide-react';
import { canPerformOp, type Role } from '@shotlog/shared';
import { createDrillLog, useShotDrilling } from '@/hooks/useDrillLogs';
import { getSessionUser } from '@/lib/session';
import { useLiveQuery, db } from '@/db';
import type { ExplosiveUsage, Shot } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
}: {
  shot: Shot;
  blastDayId: string;
  jobId: string;
  alreadyAssigned: Set<string>;
  onClose: () => void;
}) {
  const crew = useLiveQuery(() => db.crewMembers.filter((c) => c.isActive).toArray()) ?? [];
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
    for (const c of crew) {
      if (!c.userId || !picked.has(c.id)) continue;
      await createDrillLog(shot, blastDayId, jobId, { userId: c.userId, name: c.name });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold">Send drill plan to…</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Each person gets this shot in their queue with the plan attached.
        </p>
        <div className="space-y-1">
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
          {sorted.length === 0 && (
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
  const canRequest = canPerformOp('drillLogs', 'PUT', role);
  const [showSend, setShowSend] = useState(false);
  const assignedUserIds = new Set((drilling?.logs ?? []).map((l) => l.drillerUserId).filter(Boolean));

  const start = async () => {
    const logId = await createDrillLog(shot, blastDayId, jobId);
    navigate(`/blast-day/${blastDayId}/drill-log/${logId}`);
  };

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
            <Button
              size="sm"
              variant={drilling?.logs.length ? 'outline' : 'default'}
              onClick={() => setShowSend(true)}
              title="Pick which drillers this plan goes to"
            >
              <Send className="h-4 w-4 mr-1" />
              {drilling?.logs.length ? 'Send to more' : 'Send to drillers'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void start()} title="Start a drill log yourself">
              <Plus className="h-4 w-4 mr-1" />
              Log
            </Button>
          </>
        )}
      </div>
      {drilling && drilling.wetHoles > 0 && (
        <p className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
          💧 {drilling.wetHoles} wet hole{drilling.wetHoles === 1 ? '' : 's'} logged — check
          product suitability when loading.
        </p>
      )}
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
      {(!drilling || drilling.logs.length === 0) && (
        <p className="text-xs text-gray-400">
          {drilling?.planned
            ? '⚠ Plan ready but not sent to a driller yet.'
            : 'No drill logs yet for this shot.'}
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
