// Drill-log flows: the Driller↔Blaster handoff. Minimum-entry design —
// a new log prefills from the shot's design plan, and each hole defaults
// to the pattern's design depth.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';
import { classifyDeviation, materializeDrillPlan, parseDiagram, type PlanHole } from '@/lib/shotDiagram';
import type { DrillLog, DrillLogHole, HoleCondition, KickDirection, Shot } from '@/db/schema';

/** The blaster's materialized per-hole plan for a shot, or null when none */
export function getShotPlan(shot: Shot | undefined | null): PlanHole[] | null {
  if (!shot) return null;
  const diagram = parseDiagram(shot.designPlan.shotDiagramData);
  const holes = materializeDrillPlan(diagram, shot.totals.avgDrillDepth || 0);
  return holes.length > 0 ? holes : null;
}

/** Hole numbers drilled in ANY of the shot's logs — the claim-as-you-drill
 *  ledger: once a number appears anywhere it's off every driller's list */
export async function drilledHoleNumbers(shotId: string): Promise<Set<string>> {
  const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
  const drilled = new Set<string>();
  for (const log of logs) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    for (const h of holes) drilled.add(h.holeNumber.trim());
  }
  return drilled;
}

/** Create an open drill log for a shot, prefilled from its design plan.
 *  With `assignTo`, the log is DISPATCHED: it belongs to that driller
 *  (shows on their home as "Assigned to you") instead of the creator. */
export async function createDrillLog(
  shot: Shot,
  blastDayId: string,
  jobId: string,
  assignTo?: { userId: string; name: string },
): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const log: DrillLog = {
    id,
    jobId,
    blastDayId,
    shotId: shot.id,
    status: 'open',
    holeDiameter: shot.drillParams.holeDiameter,
    burden: shot.drillParams.burden,
    spacing: shot.drillParams.spacing,
    faceHeight: shot.totals.avgDrillDepth || 0,
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

/** Next hole number across ALL of a shot's logs (patterns share numbering) */
export async function nextHoleNumber(shotId: string): Promise<number> {
  const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
  let max = 0;
  for (const log of logs) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    for (const h of holes) {
      const n = parseInt(h.holeNumber, 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export async function addHole(
  log: DrillLog,
  values: {
    holeNumber: string;
    actualDepth: number;
    angle: number;
    subdrill: number;
    /** Full condition objects — quick-entry toggles pass whole-hole bands
     *  (fromFt 0..actualDepth); at-depth details + notes ride along */
    conditions: HoleCondition[];
    comment: string;
    plannedDepth?: number;
    plannedAngle?: number;
    plannedKick?: number;
    plannedKickDir?: KickDirection;
    /** Round 3: deliberately NOT drilled — a first-class deviation */
    skipped?: boolean;
  },
): Promise<string> {
  const now = nowISO();
  const id = generateId();
  const hole: DrillLogHole = {
    id,
    drillLogId: log.id,
    date: todayISO(),
    holeNumber: values.holeNumber,
    angle: values.angle,
    actualDepth: values.actualDepth,
    subdrill: values.subdrill,
    conditions: values.conditions,
    comment: values.comment,
    plannedDepth: values.plannedDepth,
    plannedAngle: values.plannedAngle,
    plannedKick: values.plannedKick,
    plannedKickDir: values.plannedKickDir,
    skipped: values.skipped,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillLogHoles.add(hole);
  return id;
}

export interface FlaggedHole {
  holeNumber: string;
  plannedDepth: number;
  actualDepth: number;
  depthDelta: number;
  angleChanged: boolean;
}

export interface ShotDrilling {
  logs: (DrillLog & { holeCount: number; footage: number; wetHoles: number; deviations: number })[];
  totalHoles: number;
  totalFootage: number;
  wetHoles: number;
  voidHoles: number;
  duplicateNumbers: string[];
  /** Plan hole count, or null when the shot has no per-hole plan */
  planned: number | null;
  /** Plan hole numbers nobody has drilled yet (skipped ones excluded) */
  undrilled: string[];
  /** Plan positions a driller deliberately marked skipped (Round 3) */
  skipped: string[];
  /** Drilled hole numbers that aren't in the plan */
  extras: string[];
  /** Holes drilled off-plan (≥1 ft depth or angle change) */
  flagged: FlaggedHole[];
}

/** Aggregate a set of drill logs against an optional per-hole plan — the
 *  shared core behind useShotDrilling (shot logs) and usePlanDrilling
 *  (standalone-plan logs). */
export async function aggregateDrilling(
  logs: DrillLog[],
  plan: PlanHole[] | null,
): Promise<ShotDrilling> {
  const seen = new Map<string, number>();
  const flagged: FlaggedHole[] = [];
  const extras: string[] = [];
  const skippedSet = new Set<string>();
  let totalHoles = 0;
  let totalFootage = 0;
  let wetHoles = 0;
  let voidHoles = 0;
  const enriched = [];
  for (const log of [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const allRows = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    // Skipped markers are INTENT, not drilling — they never count as holes,
    // footage, or deviations, and a skipped plan position isn't "undrilled"
    const holes = allRows.filter((h) => {
      if (h.skipped) skippedSet.add(h.holeNumber.trim());
      return !h.skipped;
    });
    let footage = 0;
    let wet = 0;
    let deviations = 0;
    for (const h of holes) {
      footage += h.actualDepth;
      seen.set(h.holeNumber.trim(), (seen.get(h.holeNumber.trim()) ?? 0) + 1);
      if (h.conditions.some((c) => c.code === 'W')) {
        wet++;
        wetHoles++;
      }
      if (h.conditions.some((c) => c.code === 'V')) voidHoles++;
      if (h.plannedDepth !== undefined) {
        const dev = classifyDeviation(
          { depth: h.plannedDepth, angle: h.plannedAngle ?? 0 },
          { depth: h.actualDepth, angle: h.angle },
        );
        if (dev?.flagged) {
          deviations++;
          flagged.push({
            holeNumber: h.holeNumber,
            plannedDepth: h.plannedDepth,
            actualDepth: h.actualDepth,
            depthDelta: dev.depthDelta,
            angleChanged: dev.angleChanged,
          });
        }
      }
      if (plan && !plan.some((p) => String(p.n) === h.holeNumber.trim()))
        extras.push(h.holeNumber);
    }
    totalHoles += holes.length;
    totalFootage += footage;
    enriched.push({ ...log, holeCount: holes.length, footage, wetHoles: wet, deviations });
  }
  return {
    logs: enriched,
    totalHoles,
    totalFootage,
    wetHoles,
    voidHoles,
    duplicateNumbers: [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    planned: plan ? plan.length : null,
    undrilled: plan
      ? plan
          .filter((p) => !seen.has(String(p.n)) && !skippedSet.has(String(p.n)))
          .map((p) => String(p.n))
      : [],
    skipped: [...skippedSet],
    extras,
    flagged,
  };
}

/** Aggregate drilling across all of a shot's logs (live). */
export function useShotDrilling(shotId: string | undefined): ShotDrilling | undefined {
  return useLiveQuery(async () => {
    if (!shotId) return undefined;
    const shot = await db.shots.get(shotId);
    const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
    return aggregateDrilling(logs, getShotPlan(shot));
  }, [shotId]);
}
