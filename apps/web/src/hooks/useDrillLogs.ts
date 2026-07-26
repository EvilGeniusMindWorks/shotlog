// Drill-log flows: the Driller↔Blaster handoff. Minimum-entry design —
// a new log prefills from the shot's design plan, and each hole defaults
// to the pattern's design depth.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';
import type { DrillLog, DrillLogHole, HoleConditionCode, Shot } from '@/db/schema';

/** Create an open drill log for a shot, prefilled from its design plan. */
export async function createDrillLog(shot: Shot, blastDayId: string, jobId: string): Promise<string> {
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
    drillerUserId: session?.id ?? '',
    drillerName: session?.name ?? '',
    signatureImage: null,
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
  values: { holeNumber: string; actualDepth: number; angle: number; subdrill: number; conditions: HoleConditionCode[]; comment: string },
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
    // Quick-entry: a condition toggle marks the whole hole depth; precise
    // from/to bands can be edited later if it ever matters
    conditions: values.conditions.map((code) => ({ fromFt: 0, toFt: values.actualDepth, code })),
    comment: values.comment,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillLogHoles.add(hole);
  return id;
}

export interface ShotDrilling {
  logs: (DrillLog & { holeCount: number; footage: number; wetHoles: number })[];
  totalHoles: number;
  totalFootage: number;
  wetHoles: number;
  voidHoles: number;
  duplicateNumbers: string[];
}

/** Aggregate drilling across all of a shot's logs (live). */
export function useShotDrilling(shotId: string | undefined): ShotDrilling | undefined {
  return useLiveQuery(async () => {
    if (!shotId) return undefined;
    const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
    const seen = new Map<string, number>();
    let totalHoles = 0;
    let totalFootage = 0;
    let wetHoles = 0;
    let voidHoles = 0;
    const enriched = [];
    for (const log of logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
      let footage = 0;
      let wet = 0;
      for (const h of holes) {
        footage += h.actualDepth;
        seen.set(h.holeNumber, (seen.get(h.holeNumber) ?? 0) + 1);
        if (h.conditions.some((c) => c.code === 'W')) {
          wet++;
          wetHoles++;
        }
        if (h.conditions.some((c) => c.code === 'V')) voidHoles++;
      }
      totalHoles += holes.length;
      totalFootage += footage;
      enriched.push({ ...log, holeCount: holes.length, footage, wetHoles: wet });
    }
    return {
      logs: enriched,
      totalHoles,
      totalFootage,
      wetHoles,
      voidHoles,
      duplicateNumbers: [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    };
  }, [shotId]);
}
