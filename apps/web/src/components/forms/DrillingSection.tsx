// Per-shot drilling status: the blaster's window into the drill logs
// serving this pattern. Request drilling → drillers log holes → review/
// accept each signed log. Aggregates across N logs (multiple drillers/
// days per shot is normal).
import { useNavigate } from 'react-router-dom';
import { Drill, Plus } from 'lucide-react';
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
          <Button size="sm" variant="outline" onClick={() => void start()}>
            <Plus className="h-4 w-4 mr-1" />
            {drilling?.logs.length ? 'New drill log' : 'Request drilling'}
          </Button>
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
          </span>
          <Badge variant={STATUS_BADGE[log.status]}>{log.status}</Badge>
        </button>
      ))}
      {(!drilling || drilling.logs.length === 0) && (
        <p className="text-xs text-gray-400">No drill logs yet for this shot.</p>
      )}
    </div>
  );
}
