// Drilling review (Round 2, blaster study §3): every driller's log merged
// into one attributed pattern — who drilled each hole, actual depth, and
// hazards exactly where they are. Accept keeps its meaning (locks holes)
// and flows into the readiness review.
import { useState } from 'react';
import { db, useLiveQuery } from '@/db';
import type { BlastDay, DrillLog, DrillLogHole, Shot } from '@/db/schema';
import { dayDrillLogs } from '@/hooks/useDayPhases';
import { canDrillLogTransition } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { formatDate, nowISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PatternGrid } from '@/components/design/PatternGrid';
import { getPlanHoles, planToDiagram } from '@/hooks/useDrillPlans';
import { hasDrillPlan, materializeDrillPlan, parseDiagram, type ShotDiagram } from '@/lib/shotDiagram';

export const DRILLER_COLORS = ['#2d4a75', '#b7791f', '#2f855a', '#805ad5', '#c05621', '#319795'];

const CONDITION_LABEL: Record<string, string> = {
  W: 'Water',
  V: 'Void',
  SR: 'Seams',
  O: 'Overburden',
};

export function conditionText(h: DrillLogHole): string {
  return h.conditions
    .map((c) => {
      const band = c.fromFt === c.toFt ? `at ${c.fromFt} ft` : `${c.fromFt}–${c.toFt} ft`;
      return `${CONDITION_LABEL[c.code] ?? c.code} ${band}`;
    })
    .join(' · ');
}

interface MergedHole {
  hole: DrillLogHole;
  log: DrillLog;
  color: string;
}

export function MergedDrillingView({
  day,
  shots,
  onAccepted,
}: {
  day: BlastDay;
  shots: Shot[];
  onAccepted: () => void;
}) {
  const [selected, setSelected] = useState<MergedHole | null>(null);
  const data = useLiveQuery(async () => {
    const logs = await dayDrillLogs(day, shots);
    const drillers = new Map<string, { name: string; color: string; count: number }>();
    const merged: MergedHole[] = [];
    for (const log of logs) {
      const key = log.drillerUserId || log.drillerName || log.id;
      if (!drillers.has(key)) {
        drillers.set(key, {
          name: log.drillerName || 'Unknown',
          color: DRILLER_COLORS[drillers.size % DRILLER_COLORS.length],
          count: 0,
        });
      }
      const d = drillers.get(key)!;
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      d.count += holes.length;
      for (const hole of holes) merged.push({ hole, log, color: d.color });
    }
    merged.sort((a, b) =>
      a.hole.holeNumber.localeCompare(b.hole.holeNumber, undefined, { numeric: true }),
    );
    // S8a follow-up: the review draws the pattern in the plan's own shape —
    // one grid per shot that has a plan (standalone plan or the shot's own)
    const patterns: { shot: Shot; diagram: ShotDiagram; fallbackDepth: number; holes: MergedHole[]; extras: MergedHole[] }[] = [];
    for (const shot of shots) {
      let diagram: ShotDiagram | null = null;
      if (shot.drillPlanId) {
        const p = await db.drillPlans.get(shot.drillPlanId);
        if (p && (getPlanHoles(p)?.length ?? 0) > 0) diagram = planToDiagram(p);
      }
      if (!diagram) {
        const d = parseDiagram(shot.designPlan.shotDiagramData);
        if (hasDrillPlan(d)) diagram = d;
      }
      if (!diagram) continue;
      const mine = merged.filter((m) => m.log.shotId === shot.id || (shot.drillPlanId && m.log.drillPlanId === shot.drillPlanId));
      const fallbackDepth = shot.totals.avgDrillDepth || 0;
      // S9a: holes on this shot's logs whose number is not on the plan — the
      // evaluation's blasters found these only by counting (they were drawn nowhere)
      const planNumbers = new Set(materializeDrillPlan(diagram, fallbackDepth).map((h) => String(h.n)));
      const extras = mine.filter((m) => !planNumbers.has(m.hole.holeNumber.trim()));
      patterns.push({ shot, diagram, fallbackDepth, holes: mine, extras });
    }
    const placed = new Set(patterns.flatMap((p) => p.holes.map((m) => m.hole.id)));
    return { logs, drillers: [...drillers.values()], merged, patterns, unplaced: merged.filter((m) => !placed.has(m.hole.id)) };
    // shots arrive a beat after the day — the query must re-run when they do
  }, [day.id, shots.map((s) => `${s.id}:${s.drillPlanId ?? ''}:${s.updatedAt}`).join(',')]);

  if (!data) return <p className="text-sm text-gray-400 p-4 text-center">Loading…</p>;
  const { logs, drillers, merged, patterns, unplaced } = data;
  const cellFor = (m: MergedHole | undefined, sel: MergedHole | null) => ({
    className:
      (m?.hole.skipped ? 'border-2 border-dashed border-gray-400 ' : m ? 'text-white ' : 'border border-gray-300 text-gray-400 bg-white ') +
      (m && sel?.hole.id === m.hole.id ? 'ring-2 ring-navy ring-offset-1' : ''),
    style: m && !m.hole.skipped ? { background: m.hole.conditions.length > 0 ? '#dd6b20' : m.color } : undefined,
    sub: m && !m.hole.skipped ? initials(m.log.drillerName || '') : undefined,
    title: m ? `H-${m.hole.holeNumber} · ${m.log.drillerName}${m.hole.skipped ? ' — skipped' : ` · ${m.hole.actualDepth} ft`}` : 'not drilled yet',
    disabled: !m,
  });
  const drilledCount = merged.filter((m) => !m.hole.skipped).length;
  const skippedCount = merged.length - drilledCount;
  const hazards = merged.filter((m) => m.hole.conditions.length > 0 && !m.hole.skipped);
  const offPlanCount = unplaced.length + patterns.reduce((n, p) => n + p.extras.length, 0);
  const completable = logs.filter(
    (l) => l.status === 'complete' && canDrillLogTransition('complete', 'accepted'),
  );
  const allAccepted = logs.length > 0 && logs.every((l) => l.status === 'accepted');

  const acceptAll = async () => {
    const me = getSessionUser();
    for (const log of completable) {
      await db.drillLogs.update(log.id, {
        status: 'accepted',
        acceptedBy: me?.name ?? '',
        acceptedAt: nowISO(),
        updatedAt: nowISO(),
      });
    }
    onAccepted();
  };

  if (logs.length === 0) {
    return (
      <p className="text-sm text-gray-400 p-4 text-center">
        No drilling recorded against this day yet. Drillers log holes from their Drilling tab; their logs show here as they come in.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">
          {drilledCount} holes · {drillers.length} driller{drillers.length === 1 ? '' : 's'}
          {hazards.length > 0 && (
            <span className="text-safety-orange"> · {hazards.length} hazards</span>
          )}
          {skippedCount > 0 && <span> · {skippedCount} skipped</span>}
          {/* S9a: both evaluation blasters found the off-plan hole only by counting */}
          {offPlanCount > 0 && <span className="text-navy" data-off-plan-count={offPlanCount}> · {offPlanCount} off-plan</span>}
        </p>
        {patterns.map(({ shot, diagram, fallbackDepth, holes, extras }) => {
          const byNumber = new Map(holes.map((m) => [m.hole.holeNumber.trim(), m]));
          return (
            <div key={shot.id} className="mb-2">
              {patterns.length > 1 && <p className="text-xs text-gray-500 mb-1">Shot {shot.shotNumber}</p>}
              <PatternGrid
                testId="review"
                diagram={diagram}
                fallbackDepth={fallbackDepth}
                cell={(p) => cellFor(byNumber.get(String(p.n)), selected)}
                onTap={(p) => {
                  const m = byNumber.get(String(p.n));
                  if (m) setSelected(selected?.hole.id === m.hole.id ? null : m);
                }}
                extras={extras.map((m) => ({
                  label: `H-${m.hole.holeNumber}`,
                  title: `H-${m.hole.holeNumber} · ${m.log.drillerName} · ${m.hole.skipped ? 'skipped' : `${m.hole.actualDepth} ft`} — not on the plan`,
                  className: (m.hole.skipped ? 'border-2 border-dashed border-gray-400 ' : 'text-white ') + (selected?.hole.id === m.hole.id ? 'ring-2 ring-navy ring-offset-1' : ''),
                  style: m.hole.skipped ? undefined : { background: m.hole.conditions.length > 0 ? '#dd6b20' : m.color },
                  onTap: () => setSelected(selected?.hole.id === m.hole.id ? null : m),
                }))}
              />
            </div>
          );
        })}
        <div className={`grid grid-cols-10 gap-1.5 mb-2 ${patterns.length > 0 && unplaced.length === 0 ? 'hidden' : ''}`}>
          {unplaced.length > 0 && patterns.length > 0 && <p className="col-span-10 text-[11px] text-gray-400">Off-plan holes:</p>}
          {(patterns.length > 0 ? unplaced : merged).map((m) => (
            <button
              key={m.hole.id}
              title={`H-${m.hole.holeNumber}${m.hole.skipped ? ' — skipped' : ''}`}
              className={
                'aspect-square rounded-full min-h-[24px] ' +
                (m.hole.skipped ? 'border-2 border-dashed border-gray-400 ' : '') +
                (selected?.hole.id === m.hole.id ? 'ring-2 ring-navy ring-offset-1' : '')
              }
              style={{
                background: m.hole.skipped
                  ? 'transparent'
                  : m.hole.conditions.length > 0
                    ? '#dd6b20'
                    : m.color,
                boxShadow:
                  !m.hole.skipped && m.hole.conditions.length > 0 ? '0 0 0 2px #fdebd9' : undefined,
              }}
              onClick={() => setSelected(selected?.hole.id === m.hole.id ? null : m)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          {drillers.map((d) => (
            <span key={d.name} className="inline-flex items-center gap-1.5">
              <span
                className="h-5 w-5 rounded-full text-white text-[9px] font-bold inline-flex items-center justify-center"
                style={{ background: d.color }}
              >
                {initials(d.name)}
              </span>
              {d.name} · {d.count}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
            Hole H-{selected.hole.holeNumber} · {selected.log.drillerName} ·{' '}
            {formatDate(selected.hole.date)}
          </p>
          {selected.hole.skipped ? (
            <p className="text-sm text-gray-500">
              Skipped by the driller — plan position deliberately not drilled.
            </p>
          ) : (
            <p className="text-sm">
              {selected.hole.plannedDepth != null && (
                <>
                  Planned <b className="font-mono">{selected.hole.plannedDepth.toFixed(1)} ft</b> →{' '}
                </>
              )}
              drilled <b className="font-mono">{selected.hole.actualDepth.toFixed(1)} ft</b>
              {selected.hole.angle > 0 && <> · angle {selected.hole.angle}°</>}
            </p>
          )}
          {selected.hole.conditions.length > 0 && (
            <p className="text-sm text-safety-orange mt-1">{conditionText(selected.hole)}</p>
          )}
          {selected.hole.comment && (
            <p className="text-xs text-gray-400 mt-1">“{selected.hole.comment}”</p>
          )}
        </div>
      )}

      {hazards.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
            Hazards
          </p>
          {hazards.map((m) => (
            <div key={m.hole.id} className="flex items-start gap-2 py-1.5 border-t border-gray-100 first:border-t-0">
              <span className="text-[11px] font-bold text-orange-700 bg-orange-50 rounded-lg px-2 py-0.5 shrink-0">
                H-{m.hole.holeNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{conditionText(m.hole)}</p>
                <p className="text-xs text-gray-400">
                  {m.log.drillerName} · {formatDate(m.hole.date)}
                  {m.hole.comment && <> · “{m.hole.comment}”</>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Logs</p>
        {logs.map((l) => (
          <div key={l.id} className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-sm">
            <span className="flex-1 min-w-0 truncate">
              {l.drillerName || 'Unknown'}
              {l.date && <span className="text-gray-400"> · {formatDate(l.date)}</span>}
            </span>
            <Badge variant={l.status === 'accepted' ? 'approved' : l.status === 'complete' ? 'submitted' : 'draft'}>
              {l.status}
            </Badge>
          </div>
        ))}
      </div>

      {completable.length > 0 ? (
        <button
          className="w-full bg-safety-orange text-white rounded-xl py-3 font-bold text-sm hover:bg-orange-600"
          onClick={() => void acceptAll()}
        >
          Accept pattern → Readiness review
        </button>
      ) : allAccepted ? (
        <button
          className="w-full bg-white border border-gray-300 text-navy rounded-xl py-3 font-bold text-sm hover:bg-gray-50"
          onClick={onAccepted}
        >
          Readiness review →
        </button>
      ) : null}
    </div>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
