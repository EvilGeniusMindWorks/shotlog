// The hazard rail (Round 2, blaster study §5): while loading, the drill's
// findings stay one glance away. Chips per hazardous hole; renders nothing
// on clean patterns.
import { db, useLiveQuery } from '@/db';
import type { Shot } from '@/db/schema';
import { conditionText } from '@/components/day/MergedDrillingView';

export function ShotHazardRail({ shot }: { shot: Shot }) {
  const hazards = useLiveQuery(async () => {
    // Logs feeding this shot: shot-parented + its imported plan's logs
    const logs = await db.drillLogs.where('shotId').equals(shot.id).toArray();
    if (shot.drillPlanId) {
      const planLogs = await db.drillLogs.where('drillPlanId').equals(shot.drillPlanId).toArray();
      const seen = new Set(logs.map((l) => l.id));
      logs.push(...planLogs.filter((l) => !seen.has(l.id)));
    }
    const out: { holeNumber: string; text: string }[] = [];
    for (const log of logs) {
      for (const h of await db.drillLogHoles.where('drillLogId').equals(log.id).toArray()) {
        if (h.conditions.length > 0) out.push({ holeNumber: h.holeNumber, text: conditionText(h) });
      }
    }
    return out;
  }, [shot.id, shot.drillPlanId]);

  if (!hazards || hazards.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 border-l-4 border-l-safety-orange rounded-xl px-3 py-2 mb-3">
      <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
        Hazards in this shot
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hazards.map((h, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-50 rounded-lg px-2 py-0.5"
          >
            H-{h.holeNumber} · {h.text}
          </span>
        ))}
      </div>
    </div>
  );
}
