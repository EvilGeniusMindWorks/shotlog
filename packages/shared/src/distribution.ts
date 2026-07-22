// ══════════════════════════════════════════════════════
// TOP-DOWN EXPLOSIVE DISTRIBUTION
//
// The blaster enters one total quantity per product for the
// whole blast day; per-shot quantities are derived from each
// shot's share of the total hole count (Spec §4.6.3, §13):
//
//   per-shot qty = total qty × (shot holes / total holes)
//
// Individual shots may be manually overridden; the remainder
// redistributes proportionally across the non-overridden shots.
// ══════════════════════════════════════════════════════

export interface ShotHoleCount {
  shotId: string;
  holes: number;
}

export interface DistributionResult {
  /** Effective per-shot quantity: overrides as given, auto shots computed */
  allocations: Record<string, number>;
  /** Shot ids whose allocation was auto-computed (not overridden) */
  autoShotIds: string[];
  /** totalQty − sum(allocations). 0 in the normal case; negative when overrides over-allocate */
  remaining: number;
}

/**
 * Split an integer total across weights so parts are whole numbers and sum
 * exactly to the total (largest-remainder method). Weights must be ≥ 0 with
 * a positive sum.
 */
function largestRemainderSplit(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const parts = raw.map(Math.floor);
  let leftover = total - parts.reduce((s, p) => s + p, 0);
  // Hand out leftover units to the largest fractional remainders first
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    parts[i] += 1;
    leftover -= 1;
  }
  return parts;
}

/**
 * Distribute a product's total quantity across shots by hole-count ratio.
 *
 * - Shots present in `overrides` keep their overridden quantity; the rest of
 *   the total distributes proportionally among the remaining shots.
 * - Whole-unit totals produce whole-unit allocations that sum exactly to the
 *   total (you can't load 10.59 bags). Fractional totals stay exact, with the
 *   last auto shot absorbing rounding residue.
 * - If the auto shots have no holes entered yet, the remainder splits evenly.
 */
export function distributeByHoles(
  totalQty: number,
  shots: ShotHoleCount[],
  overrides: Record<string, number> = {},
): DistributionResult {
  const allocations: Record<string, number> = {};
  let overrideSum = 0;
  const autoShots: ShotHoleCount[] = [];

  for (const shot of shots) {
    const override = overrides[shot.shotId];
    if (override !== undefined) {
      allocations[shot.shotId] = override;
      overrideSum += override;
    } else {
      autoShots.push(shot);
    }
  }

  const available = Math.max(0, totalQty - overrideSum);
  const autoShotIds = autoShots.map((s) => s.shotId);

  if (autoShots.length > 0) {
    // No holes entered yet → split evenly rather than allocating nothing
    const totalAutoHoles = autoShots.reduce((s, sh) => s + sh.holes, 0);
    const weights = totalAutoHoles > 0 ? autoShots.map((s) => s.holes) : autoShots.map(() => 1);

    if (Number.isInteger(available)) {
      const parts = largestRemainderSplit(available, weights);
      autoShots.forEach((s, i) => {
        allocations[s.shotId] = parts[i];
      });
    } else {
      const weightSum = weights.reduce((s, w) => s + w, 0);
      let assigned = 0;
      autoShots.forEach((s, i) => {
        if (i === autoShots.length - 1) {
          // Last shot absorbs rounding residue so the sum stays exact
          allocations[s.shotId] = Math.round((available - assigned) * 100) / 100;
        } else {
          const share = Math.round(((available * weights[i]) / weightSum) * 100) / 100;
          allocations[s.shotId] = share;
          assigned += share;
        }
      });
    }
  }

  const allocated = Object.values(allocations).reduce((s, v) => s + v, 0);
  return { allocations, autoShotIds, remaining: Math.round((totalQty - allocated) * 100) / 100 };
}
