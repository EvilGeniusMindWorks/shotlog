// Drill-only day — solo report & file (Round 3, driller study §4): no
// blaster required. The trio flows in automatically; filing is
// confirmation, not re-entry. Extras stay one tap away but never block.
import { useNavigate } from 'react-router-dom';
import { db, useLiveQuery } from '@/db';
import type { BlastDay } from '@/db/schema';
import { canDayTransition } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { Badge } from '@/components/ui/badge';

function ReadyRow({ label, sub, state }: { label: string; sub?: string; state: 'signed' | 'open' | 'none' }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-sm">
      <div className="flex-1 min-w-0">
        <p className="truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
      <Badge variant={state === 'signed' ? 'compliant' : state === 'open' ? 'warning' : 'draft'}>
        {state === 'signed' ? 'signed' : state === 'open' ? 'open' : '—'}
      </Badge>
    </div>
  );
}

export function DrillOnlyFileCard({ day }: { day: BlastDay }) {
  const navigate = useNavigate();
  const me = getSessionUser();

  const trio = useLiveQuery(async () => {
    if (!me) return undefined;
    const logs = (await db.drillLogs.where('blastDayId').equals(day.id).toArray()).filter(
      (l) => l.drillerUserId === me.id,
    );
    let holeCount = 0;
    for (const l of logs)
      holeCount += (await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()).filter(
        (h) => !h.skipped,
      ).length;
    const logState: 'signed' | 'open' | 'none' =
      logs.length === 0 ? 'none' : logs.every((l) => l.status !== 'open') ? 'signed' : 'open';

    // The checklist for the rig my log used, filed today
    const rigId = logs.find((l) => l.drillRigEquipmentId)?.drillRigEquipmentId;
    const rig = rigId ? await db.equipment.get(rigId) : undefined;
    const checklist = rigId
      ? await db.drillChecklists
          .filter((c) => c.equipmentId === rigId && c.date === day.date)
          .first()
      : undefined;

    const card = await db.timeCards
      .filter((c) => c.userId === me.id && (c.blastDayId === day.id || c.date === day.date))
      .first();

    return {
      logState,
      holeCount,
      rigLabel: rig?.assetNumber,
      checklistState: (checklist ? 'signed' : rigId ? 'none' : 'none') as 'signed' | 'none',
      hasRig: Boolean(rigId),
      cardState: (card ? (card.status === 'draft' ? 'open' : 'signed') : 'none') as
        | 'signed'
        | 'open'
        | 'none',
      cardHours: card ? card.straightTime + card.overtime : 0,
    };
  }, [day.id, day.date, me?.id]);

  if (day.status !== 'draft' || !canDayTransition('draft', 'submitted')) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
      <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
        File the day
      </p>
      {trio && (
        <>
          <ReadyRow
            label={`Your log${trio.holeCount > 0 ? ` · ${trio.holeCount} holes` : ''}`}
            state={trio.logState}
          />
          {trio.hasRig && (
            <ReadyRow label={`Checklist · ${trio.rigLabel ?? 'rig'}`} state={trio.checklistState} />
          )}
          <ReadyRow
            label={`Your hours${trio.cardHours > 0 ? ` · ${trio.cardHours.toFixed(1)}` : ''}`}
            sub={trio.cardState === 'none' ? 'add it in Time Cards below' : undefined}
            state={trio.cardState}
          />
        </>
      )}
      <p className="text-xs text-gray-400 mt-1">
        Equipment, materials, and subs live below — only if used; a plain drilling day files in
        seconds.
      </p>
      <button
        className="w-full bg-safety-orange text-white rounded-xl py-2.5 font-bold text-sm mt-2 hover:bg-orange-600"
        onClick={() => navigate(`/blast-day/${day.id}/submit`)}
      >
        Sign &amp; submit the day
      </button>
    </div>
  );
}
