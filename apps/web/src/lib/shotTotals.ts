// The shot's derived totals after its drill parameters change — shared by
// the shot form and the drill plan (S17: diameter, burden and spacing are
// edited on the plan too, and both doors must keep the totals honest).
import { avgDrillDepth, totalPayYards, totalSqFt, totalYardsShot } from '@shotlog/shared';
import type { DrillParams, ShotTotals } from '@/db/schema';

export function recalcShotTotals(dp: DrillParams, t: ShotTotals): ShotTotals {
  const next = { ...t };
  next.totalSqFt = totalSqFt(dp.burden, dp.spacing, next.numHoles);
  if (next.numHoles > 0 && next.totalDrillFootage > 0) {
    next.avgDrillDepth = avgDrillDepth(next.totalDrillFootage, next.numHoles);
  }
  // S19 (Matthew): pay yards = the rock down to grade — square feet × (depth −
  // sub drill) ÷ 27 — unless a person typed the number (then it holds)
  if (!next.payYardsTyped && next.totalSqFt > 0 && next.avgDrillDepth > 0) {
    next.totalPayYards = totalPayYards(next.totalSqFt, next.avgDrillDepth, dp.subDrill);
  }
  if (dp.burden > 0 && dp.spacing > 0 && next.totalDrillFootage > 0) {
    next.totalYardsShot = totalYardsShot(dp.burden, dp.spacing, next.totalDrillFootage);
  }
  return next;
}

// ── S18: the totals fill themselves (Matthew: "shouldn't the totals be auto
// calculating from the drill plan?") ──────────────────────────────────────
import type { ShotDrilling } from '@/hooks/useDrillLogs';
import type { PlanHole } from '@/lib/shotDiagram';

export interface DrillingFigures {
  holes: number;
  footage: number;
  /** the drillers whose logs were accepted */
  who: string;
  acceptedAt?: string;
}

/** Holes and footage from the shot's ACCEPTED logs only — null until one is accepted */
export function acceptedFigures(drilling: ShotDrilling | undefined): DrillingFigures | null {
  if (!drilling) return null;
  const logs = drilling.logs.filter((l) => l.status === 'accepted' && l.holeCount > 0);
  if (logs.length === 0) return null;
  const holes = logs.reduce((n, l) => n + l.holeCount, 0);
  const footage = +logs.reduce((n, l) => n + l.footage, 0).toFixed(1);
  const who = [...new Set(logs.map((l) => l.drillerName).filter(Boolean))].join(', ');
  const acceptedAt = logs.map((l) => l.acceptedAt ?? '').sort().pop() || undefined;
  return { holes, footage, who, acceptedAt };
}

/** Planned holes × their lengths — what the shot reads before any drilling is accepted */
export function planFigures(plan: PlanHole[] | null): { holes: number; footage: number } | null {
  if (!plan || plan.length === 0) return null;
  const footage = +plan.reduce((n, h) => n + ((h.holeLength || h.depth) || 0), 0).toFixed(1);
  return { holes: plan.length, footage };
}

/** The totals with holes, footage and average depth set from figures, the rest derived */
export function totalsFrom(dp: DrillParams, t: ShotTotals, f: { holes: number; footage: number }): ShotTotals {
  return recalcShotTotals(dp, {
    ...t,
    numHoles: f.holes,
    totalDrillFootage: f.footage,
    avgDrillDepth: f.holes > 0 ? +(f.footage / f.holes).toFixed(1) : 0,
  });
}
