// The day as a PHASE SPINE (Round 2, blaster study): each phase shows its
// state and the one number that matters. A map, not a gate — nothing is
// enforced as sequence; Continue just targets the current phase.
import { db, useLiveQuery } from '@/db';
import type { BlastDay, BlastLog, DrillLog, Shot } from '@/db/schema';
import { getSessionUser } from '@/lib/session';

export type PhaseKey = 'drilling' | 'readiness' | 'shots' | 'seismo' | 'timecards' | 'file';
export type PhaseState = 'done' | 'now' | 'todo' | 'later';

export interface DayPhase {
  key: PhaseKey;
  label: string;
  sub: string;
  chip: string;
  chipVariant: 'compliant' | 'warning' | 'violation' | 'submitted' | 'secondary' | 'draft';
  state: PhaseState;
  /** BlastDayPage ?view= target */
  view: string;
}

export interface DayPhaseModel {
  phases: DayPhase[];
  /** The phase Continue points at (undefined when the day is filed) */
  current?: DayPhase;
  continueLabel?: string;
}

/** All drill logs feeding this day: day-parented ones plus the per-day
 *  plan logs of every plan a shot imported from. */
export async function dayDrillLogs(day: BlastDay, shots: Shot[]): Promise<DrillLog[]> {
  const byDay = await db.drillLogs.where('blastDayId').equals(day.id).toArray();
  const planIds = [...new Set(shots.map((s) => s.drillPlanId).filter((p): p is string => !!p))];
  const byPlan: DrillLog[] = [];
  for (const planId of planIds) {
    byPlan.push(...(await db.drillLogs.where('drillPlanId').equals(planId).toArray()));
  }
  const seen = new Set(byDay.map((l) => l.id));
  return [...byDay, ...byPlan.filter((l) => !seen.has(l.id))];
}

export function useDayPhases(
  day: BlastDay | undefined,
  blastLog: BlastLog | undefined,
  shots: Shot[],
): DayPhaseModel | undefined {
  return useLiveQuery(async () => {
    if (!day || !blastLog) return { phases: [] };
    const me = getSessionUser();

    // ── drilling ──
    const logs = await dayDrillLogs(day, shots);
    let holeCount = 0;
    let hazardCount = 0;
    for (const log of logs) {
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      holeCount += holes.length;
      hazardCount += holes.filter((h) => h.conditions.length > 0).length;
    }
    const drillerNames = [...new Set(logs.map((l) => l.drillerName).filter(Boolean))];
    const allAccepted = logs.length > 0 && logs.every((l) => l.status === 'accepted');
    const hasDrilling = logs.length > 0;

    // ── shots (per-shot sign-off, model (a); a log-level signature covers
    // single-blaster days that never used the per-shot row) ──
    const signedCount = shots.filter((s) => s.signatureImage).length;
    const logSigned = Boolean(blastLog.signatureImage);
    const allSigned = shots.length > 0 && (signedCount === shots.length || (logSigned && signedCount === 0));
    const firstUnsigned = shots.find((s) => !s.signatureImage);

    // ── seismo ──
    const readShots = new Set<string>();
    for (const s of shots) {
      if ((await db.seismoReadings.where('shotId').equals(s.id).count()) > 0) readShots.add(s.id);
    }
    const shotsWithReadings = readShots.size;

    // ── time cards ──
    const cards = await db.timeCards.where('blastDayId').equals(day.id).toArray();
    const mine = me ? cards.find((c) => c.userId === me.id) : undefined;
    const others = cards.filter((c) => c.id !== mine?.id);
    const othersFiled = others.filter((c) => c.status !== 'draft').length;

    const review = blastLog.readinessReview;
    const phases: DayPhase[] = [];

    if (hasDrilling) {
      phases.push({
        key: 'drilling',
        label: 'Drilling',
        sub: `${holeCount} holes · ${drillerNames.length} driller${drillerNames.length === 1 ? '' : 's'}${hazardCount > 0 ? ` · ${hazardCount} hazards` : ''}`,
        chip: allAccepted ? 'accepted' : 'in progress',
        chipVariant: allAccepted ? 'compliant' : 'warning',
        state: allAccepted ? 'done' : 'now',
        view: 'drilling',
      });
      phases.push({
        key: 'readiness',
        label: 'Readiness review',
        sub: review
          ? `design confirmed${review.maxPoundsPerDelay ? ` · max ${review.maxPoundsPerDelay} lbs/delay` : ''}`
          : 'plan intent vs as-drilled → adjust',
        chip: review ? 'confirmed' : 'open',
        chipVariant: review ? 'compliant' : 'warning',
        state: review ? 'done' : allAccepted ? 'now' : 'todo',
        view: 'readiness',
      });
    }

    phases.push({
      key: 'shots',
      label: 'Shots',
      sub:
        shots.length === 0
          ? 'none yet'
          : logSigned && signedCount === 0
            ? `${shots.length} shot${shots.length === 1 ? '' : 's'} · log signed`
            : `${signedCount} of ${shots.length} signed`,
      chip: allSigned ? 'signed' : 'in progress',
      chipVariant: allSigned ? 'compliant' : 'warning',
      state: allSigned ? 'done' : 'now',
      view: 'blast-log',
    });

    phases.push({
      key: 'seismo',
      label: 'Seismo',
      sub:
        shots.length === 0
          ? '—'
          : shots
              .map((s, i) => `shot ${s.shotNumber || i + 1} ${readShots.has(s.id) ? 'attached' : '—'}`)
              .slice(0, 2)
              .join(' · ') + (shots.length > 2 ? ' …' : ''),
      chip: shotsWithReadings >= shots.length && shots.length > 0 ? 'attached' : 'later ok',
      chipVariant: shotsWithReadings >= shots.length && shots.length > 0 ? 'compliant' : 'submitted',
      // Late attachment is NORMAL — this phase never becomes "now"
      state: shotsWithReadings >= shots.length && shots.length > 0 ? 'done' : 'later',
      view: 'blast-log',
    });

    phases.push({
      key: 'timecards',
      label: 'Time cards',
      sub: `mine ${mine ? mine.status : '—'}${others.length > 0 ? ` · crew ${othersFiled}/${others.length} filed` : ''}`,
      chip: mine && mine.status !== 'draft' ? 'filed' : 'open',
      chipVariant: mine && mine.status !== 'draft' ? 'compliant' : 'warning',
      state: mine && mine.status !== 'draft' ? 'done' : 'todo',
      view: 'daily-report',
    });

    phases.push({
      key: 'file',
      label: 'Report & file',
      sub: day.status === 'draft' ? 'equipment, materials, sign, submit' : `day ${day.status}`,
      chip: day.status,
      chipVariant: day.status === 'draft' ? 'draft' : day.status === 'submitted' ? 'submitted' : 'compliant',
      state: day.status !== 'draft' ? 'done' : 'todo',
      view: 'daily-report',
    });

    // Continue targets the first live phase, in day order
    const order: PhaseKey[] = ['drilling', 'readiness', 'shots', 'timecards', 'file'];
    let current: DayPhase | undefined;
    for (const key of order) {
      const p = phases.find((x) => x.key === key);
      if (p && p.state !== 'done' && p.state !== 'later') {
        current = p;
        break;
      }
    }
    if (current) current.state = 'now';
    const continueLabel = !current
      ? undefined
      : current.key === 'shots' && firstUnsigned
        ? `Continue — Shot ${firstUnsigned.shotNumber}`
        : current.key === 'drilling'
          ? 'Continue — drilling review'
          : current.key === 'readiness'
            ? 'Continue — readiness review'
            : current.key === 'timecards'
              ? 'Continue — my time card'
              : 'Continue — report & file';

    return { phases, current, continueLabel };
  }, [day?.id, day?.status, day?.updatedAt, blastLog?.id, blastLog?.updatedAt, shots.map((s) => s.id + (s.signatureImage ? 's' : '')).join(',')]);
}
