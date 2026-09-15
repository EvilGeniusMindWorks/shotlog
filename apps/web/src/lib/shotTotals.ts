// The shot's derived totals after its drill parameters change — shared by
// the shot form and the drill plan (S17: diameter, burden and spacing are
// edited on the plan too, and both doors must keep the totals honest).
import { avgDrillDepth, totalSqFt, totalYardsShot } from '@shotlog/shared';
import type { DrillParams, ShotTotals } from '@/db/schema';

export function recalcShotTotals(dp: DrillParams, t: ShotTotals): ShotTotals {
  const next = { ...t };
  next.totalSqFt = totalSqFt(dp.burden, dp.spacing, next.numHoles);
  if (next.numHoles > 0 && next.totalDrillFootage > 0) {
    next.avgDrillDepth = avgDrillDepth(next.totalDrillFootage, next.numHoles);
  }
  if (dp.burden > 0 && dp.spacing > 0 && next.totalDrillFootage > 0) {
    next.totalYardsShot = totalYardsShot(dp.burden, dp.spacing, next.totalDrillFootage);
  }
  return next;
}
