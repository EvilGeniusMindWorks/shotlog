// Standalone drill-plan flows: the blaster authors a plan under a JOB,
// ahead of any blast day; drillers work it via per-driller-per-day logs;
// the blast report later imports the as-drilled result.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';
import { materializeDrillPlan, type PlanHole, type ShotDiagram } from '@/lib/shotDiagram';
import type { DrillLog, DrillPlanRecord } from '@/db/schema';
import { aggregateDrilling, type ShotDrilling } from './useDrillLogs';

/** Route to a drill log's page — plan-parented logs live under the job's
 *  plan; shot-parented (legacy) logs live under the blast day. */
export function drillLogRoute(
  log: Pick<DrillLog, 'id' | 'jobId' | 'blastDayId' | 'drillPlanId'>,
): string {
  if (log.drillPlanId) return `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}/log/${log.id}`;
  return `/blast-day/${log.blastDayId ?? ''}/drill-log/${log.id}`;
}

export async function createDrillPlan(jobId: string, name?: string): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const existing = await db.drillPlans.where('jobId').equals(jobId).count();
  const plan: DrillPlanRecord = {
    id,
    jobId,
    name: name?.trim() || `Drill Plan ${existing + 1}`,
    status: 'open',
    rows: 5,
    cols: 10,
    overrides: {},
    holeDiameter: 3,
    burden: 6,
    spacing: 7,
    createdBy: session?.id ?? '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillPlans.add(plan);
  return id;
}

/** A standalone plan expressed as a ShotDiagram (grid + per-hole plan) —
 *  lets the read-only pattern map and materializer work on both shapes. */
export function planToDiagram(plan: DrillPlanRecord): ShotDiagram {
  return {
    rows: plan.rows,
    cols: plan.cols,
    delays: {},
    wires: [],
    interHoleMs: 15,
    plan: {
      defaultDepth: plan.defaultDepth,
      overrides: Object.fromEntries(
        Object.entries(plan.overrides).map(([k, o]) => [
          k,
          o.noHole ? { depth: 0 } : { depth: o.depth, kick: o.kick, kickDir: o.kickDir },
        ]),
      ),
    },
  };
}

/** Materialized per-hole plan for a standalone drill plan (kick-aware) */
export function getPlanHoles(plan: DrillPlanRecord | undefined | null): PlanHole[] | null {
  if (!plan) return null;
  const holes = materializeDrillPlan(planToDiagram(plan), 0);
  return holes.length > 0 ? holes : null;
}

/** Hole numbers drilled in ANY of a plan's logs (cross-driller claim ledger) */
export async function planDrilledHoleNumbers(planId: string): Promise<Set<string>> {
  const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
  const drilled = new Set<string>();
  for (const log of logs) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    for (const h of holes) drilled.add(h.holeNumber.trim());
  }
  return drilled;
}

/** A driller's log against a plan for ONE day. `assignTo` = dispatched by
 *  the blaster; otherwise the current user starts their own. */
export async function createDrillPlanLog(
  plan: DrillPlanRecord,
  assignTo?: { userId: string; name: string },
  date?: string,
): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const log: DrillLog = {
    id,
    jobId: plan.jobId,
    drillPlanId: plan.id,
    date: date ?? todayISO(),
    status: 'open',
    holeDiameter: plan.holeDiameter,
    burden: plan.burden,
    spacing: plan.spacing,
    faceHeight: plan.defaultDepth ?? 0,
    gps: '',
    locationNote: '',
    drillerUserId: assignTo?.userId ?? session?.id ?? '',
    drillerName: assignTo?.name ?? session?.name ?? '',
    signatureImage: null,
    ...(assignTo ? { assignedBy: session?.name ?? '', assignedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillLogs.add(log);
  return id;
}

/** All of a plan's logs, newest day first */
export async function planLogs(planId: string): Promise<DrillLog[]> {
  return (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).sort(
    (a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt),
  );
}

/** Aggregate drilling across ALL of a plan's logs (live) — the cross-log
 *  hole-claim ledger and progress source for both blaster and drillers. */
export function usePlanDrilling(planId: string | undefined): ShotDrilling | undefined {
  return useLiveQuery(async () => {
    if (!planId) return undefined;
    const plan = await db.drillPlans.get(planId);
    const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
    return aggregateDrilling(logs, getPlanHoles(plan));
  }, [planId]);
}
