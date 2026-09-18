// The blasting log's WALKTHROUGH (navigation round, Matthew's six steps,
// Sep 16 2026): Drill plan → Drilling → Review drilling → Fill out the
// blasting log → Check and sign → Mark the blasting log complete. One
// vocabulary for the chips (Later · To do · Waiting · In progress · Done ·
// Complete), exactly one step wears the ring, and Continue always reads
// "Next: …" — or "Waiting: …" while the drillers work. A map, not a gate:
// nothing is enforced as a sequence. The daily report and time cards are
// tiles of the day, not steps of the log.
import { db, useLiveQuery } from '@/db';
import type { BlastDay, BlastLog, DrillLog, Shot } from '@/db/schema';
import { getShotPlan } from '@/hooks/useDrillLogs';
import { logChecks } from '@/lib/logChecks';
import { hhmm } from '@/lib/dayCard';

export type PhaseKey = 'plan' | 'drilling' | 'review' | 'fill' | 'check' | 'complete';
export type PhaseState = 'done' | 'now' | 'wait' | 'todo' | 'later';

export interface DayPhase {
  key: PhaseKey;
  label: string;
  sub: string;
  chip: string;
  chipVariant: 'compliant' | 'warning' | 'violation' | 'submitted' | 'secondary' | 'draft';
  state: PhaseState;
  /** BlastDayPage ?view= target */
  view: string;
  /** a full route to open instead of a day view (the plan page) */
  to?: string;
}

export interface DayPhaseModel {
  phases: DayPhase[];
  /** The step Continue points at (undefined when the log is complete) */
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

const VARIANT: Record<PhaseState, DayPhase['chipVariant']> = { done: 'compliant', now: 'warning', wait: 'submitted', todo: 'warning', later: 'secondary' };

export function useDayPhases(
  day: BlastDay | undefined,
  blastLog: BlastLog | undefined,
  shots: Shot[],
): DayPhaseModel | undefined {
  return useLiveQuery(async () => {
    if (!day || !blastLog) return { phases: [] };

    // ── drilling ──
    const logs = await dayDrillLogs(day, shots);
    let holeCount = 0;
    const holesByLog = new Map<string, number>();
    let hazardCount = 0;
    for (const log of logs) {
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      holeCount += holes.length;
      holesByLog.set(log.id, holes.length);
      hazardCount += holes.filter((h) => h.conditions.length > 0).length;
    }
    // S9b follow-up: a stray empty open log on a finished pattern must not drag
    // the day back — but a freshly SENT plan is an empty open log too
    const anyHoles = logs.some((l) => (holesByLog.get(l.id) ?? 0) > 0);
    const counted = logs.filter((l) => !(anyHoles && l.status === 'open' && (holesByLog.get(l.id) ?? 0) === 0));
    const drillerNames = [...new Set(counted.map((l) => l.drillerName).filter(Boolean))];
    const allAccepted = counted.length > 0 && counted.every((l) => l.status === 'accepted');
    const allComplete = counted.length > 0 && counted.every((l) => l.status !== 'open');
    const hasDrilling = logs.length > 0;
    const plannedHoles = shots.reduce((a, s) => a + (getShotPlan(s)?.length ?? 0), 0);
    const hasPlan = plannedHoles > 0;
    const drillingDay = day.typeOfWork !== 'blasting';
    const firstShot = shots[0];
    // a blaster who went straight to loading skipped the plan on purpose
    const shotStarted = shots.some((s) => s.totals.numHoles > 0 || Boolean(s.signatureImage));
    const holesLine = `${holeCount}${plannedHoles ? `/${plannedHoles}` : ''} holes`;
    const who = drillerNames.slice(0, 2).join(', ');

    // ── the log itself ──
    const checks = await logChecks(day.id);
    const reds = checks.filter((c) => c.level === 'red');
    const signed = Boolean(blastLog.signatureImage);
    const complete = Boolean(blastLog.doneAt);
    const fillDone = reds.every((c) => c.key === 'sig');

    const phases: DayPhase[] = [];
    const push = (p: Omit<DayPhase, 'chipVariant'>) => phases.push({ ...p, chipVariant: VARIANT[p.state] });

    // S23 push 2 (Matthew's v3 item 7: one flow, a week or a day): the first step
    // is the PATTERN — a paper of the job, drilled and accepted before the shot.
    // "Next: build the drill plan" inside a shot is gone; a shot with no pattern
    // is laid onto one from the job (Add shot › From a drilled pattern) or is
    // drilled by others. Older shots with an inline plan keep their steps.
    const patternShots = shots.filter((s) => s.drillPlanId);
    const patternNames: string[] = [];
    for (const s of patternShots) {
      const p = s.drillPlanId ? await db.drillPlans.get(s.drillPlanId) : undefined;
      if (p) patternNames.push(p.name);
    }
    if (drillingDay && firstShot && patternShots.length > 0) {
      const planTo = `/jobs/${day.jobId}/drill-plan/${patternShots[0].drillPlanId}`;
      push({ key: 'plan', label: 'Pattern', sub: `${patternNames.join(', ') || 'the pattern'} · drilled`, chip: 'Done', state: 'done', view: 'walkthrough', to: planTo });
      if (!allComplete) push({ key: 'drilling', label: 'Drilling', sub: `${holesLine}${who ? ` · ${who}` : ''}${hazardCount ? ` · ${hazardCount} hazards` : ''}`, chip: 'Waiting', state: 'wait', view: 'drilling' });
      else push({ key: 'drilling', label: 'Drilling', sub: `${holesLine}${who ? ` · ${who}` : ''}${hazardCount ? ` · ${hazardCount} hazards` : ''}`, chip: allAccepted ? 'Done' : 'Signed complete', state: 'done', view: 'drilling' });
      if (!allComplete) push({ key: 'review', label: 'Review drilling', sub: 'accept, or send a part back with a note', chip: 'Later', state: 'later', view: 'drilling' });
      else if (!allAccepted) push({ key: 'review', label: 'Review drilling', sub: `${counted.length} part${counted.length === 1 ? '' : 's'} signed`, chip: 'To do', state: 'now', view: 'drilling' });
      else {
        const at = counted.map((l) => l.acceptedAt ?? '').sort().pop();
        push({ key: 'review', label: 'Review drilling', sub: `accepted${at ? ` ${hhmm(at)}` : ''}`, chip: 'Done', state: 'done', view: 'drilling' });
      }
    } else if (drillingDay && firstShot && !hasPlan && !hasDrilling) {
      // no pattern on the shot and no inline plan: pick one from the job, or drilled by others
      push({ key: 'plan', label: 'Pattern', sub: 'from a drilled pattern (Add shot), or drilled by others', chip: shotStarted ? 'Skipped' : 'To do', state: shotStarted ? 'later' : 'now', view: 'blast-log' });
      push({ key: 'drilling', label: 'Drilling', sub: 'reads from the pattern', chip: 'Later', state: 'later', view: 'drilling' });
      push({ key: 'review', label: 'Review drilling', sub: 'accept, or send a part back with a note', chip: 'Later', state: 'later', view: 'drilling' });
    } else if (drillingDay && firstShot) {
      const planTo = `/blast-day/${day.id}/design/${firstShot.id}?mode=plan`;
      // 1 · Drill plan (an older shot's inline plan)
      if (hasDrilling) push({ key: 'plan', label: 'Drill plan', sub: `sent · ${plannedHoles} holes`, chip: 'Done', state: 'done', view: 'walkthrough', to: planTo });
      else push({ key: 'plan', label: 'Drill plan', sub: `${plannedHoles} holes planned · not sent to a driller yet`, chip: shotStarted ? 'Skipped' : 'Built · not sent', state: shotStarted ? 'later' : 'now', view: 'walkthrough', to: planTo });
      // 2 · Drilling — the drillers' logs; yours to watch, not to do
      if (!hasDrilling) push({ key: 'drilling', label: 'Drilling', sub: hasPlan ? 'starts when the plan is sent' : 'starts when the plan is sent', chip: 'Later', state: 'later', view: 'drilling' });
      else if (!allComplete) push({ key: 'drilling', label: 'Drilling', sub: `${holesLine}${who ? ` · ${who}` : ''}${hazardCount ? ` · ${hazardCount} hazards` : ''}`, chip: 'Waiting', state: 'wait', view: 'drilling' });
      else push({ key: 'drilling', label: 'Drilling', sub: `${holesLine}${who ? ` · ${who}` : ''}${hazardCount ? ` · ${hazardCount} hazards` : ''}`, chip: allAccepted ? 'Done' : 'Signed complete', state: 'done', view: 'drilling' });
      // 3 · Review drilling — accept, or send a log back
      if (!hasDrilling || !allComplete) push({ key: 'review', label: 'Review drilling', sub: 'accept, or send a log back with a note', chip: 'Later', state: 'later', view: 'drilling' });
      else if (!allAccepted) push({ key: 'review', label: 'Review drilling', sub: `${counted.length} log${counted.length === 1 ? '' : 's'} signed complete`, chip: 'To do', state: 'now', view: 'drilling' });
      else {
        const at = counted.map((l) => l.acceptedAt ?? '').sort().pop();
        push({ key: 'review', label: 'Review drilling', sub: `accepted${at ? ` ${hhmm(at)}` : ''}`, chip: 'Done', state: 'done', view: 'drilling' });
      }
    }
    const drillingSettled = !drillingDay || !firstShot || allAccepted || (shotStarted && !hasDrilling);

    // 4 · Fill out the blasting log
    const fillState: PhaseState = complete || signed || fillDone ? 'done' : drillingSettled ? 'now' : 'later';
    const openReds = reds.filter((c) => c.key !== 'sig');
    push({
      key: 'fill',
      label: 'Fill out the blasting log',
      sub:
        shots.length === 0
          ? 'no shots yet'
          : fillState === 'done'
            ? `${shots.length} shot${shots.length === 1 ? '' : 's'} · nothing missing`
            : `${shots.length} shot${shots.length === 1 ? '' : 's'} · parameters, explosives, timing, seismo${openReds.length ? ` · ${openReds.length} missing` : ''}`,
      chip: fillState === 'done' ? 'Done' : fillState === 'now' ? 'In progress' : 'Later',
      state: fillState,
      view: 'blast-log',
    });
    // 5 · Check and sign
    const checkState: PhaseState = signed ? 'done' : fillState === 'done' ? 'now' : 'later';
    push({
      key: 'check',
      label: 'Check and sign',
      sub: signed ? `signed${blastLog.blasterName ? ` by ${blastLog.blasterName}` : ''}` : openReds.length ? `${openReds.length} thing${openReds.length === 1 ? '' : 's'} to fix first` : 'nothing missing — sign it',
      chip: signed ? 'Done' : checkState === 'now' ? 'To do' : 'Later',
      state: checkState,
      view: 'check',
    });
    // 6 · Mark the blasting log complete
    const completeState: PhaseState = complete ? 'done' : signed ? 'now' : 'later';
    push({
      key: 'complete',
      label: 'Mark the blasting log complete',
      sub: complete ? `complete ${hhmm(blastLog.doneAt!)}${blastLog.doneByName ? ` · ${blastLog.doneByName}` : ''} · ready to file` : "the log's own done mark — File this day waits for it",
      chip: complete ? 'Complete' : completeState === 'now' ? 'To do' : 'Later',
      state: completeState,
      view: 'check',
    });

    // exactly one ring: the first live step in order
    const order: PhaseKey[] = ['plan', 'drilling', 'review', 'fill', 'check', 'complete'];
    let current: DayPhase | undefined;
    for (const key of order) {
      const p = phases.find((x) => x.key === key);
      if (p && (p.state === 'now' || p.state === 'wait')) {
        current = p;
        break;
      }
    }
    for (const p of phases) if (p.state === 'now' && p !== current) p.state = 'todo';
    const continueLabel = !current
      ? undefined
      : current.key === 'plan'
        ? hasPlan
          ? 'Next: send the plan to drillers'
          : 'Next: pick the pattern'
        : current.key === 'drilling'
          ? who
            ? `Waiting: ${who} · ${holeCount}${plannedHoles ? ` of ${plannedHoles}` : ''}`
            : 'Waiting: drilling to start'
          : current.key === 'review'
            ? 'Next: review the drilling'
            : current.key === 'fill'
              ? shots.length === 1
                ? 'Next: fill out Shot 1'
                : 'Next: fill out the blasting log'
              : current.key === 'check'
                ? 'Next: check and sign'
                : 'Next: mark the log complete';

    return { phases, current, continueLabel };
  }, [day?.id, day?.status, day?.updatedAt, blastLog?.id, blastLog?.updatedAt, shots.map((s) => s.id + (s.signatureImage ? 's' : '') + s.updatedAt).join(',')]);
}
