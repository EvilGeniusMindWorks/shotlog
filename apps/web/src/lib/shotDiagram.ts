// Shot diagram model — the tap-grid state persisted as JSON in
// Shot.designPlan.shotDiagramData (Spec §5.3).
//
// Timing model: initiation is a TREE. The blaster picks a start hole and its
// lead delay, then wires hole-to-hole; each wire adds the inter-hole
// increment (default 15ms) unless it's a lead wire carrying its own delay
// (how a branch line jumps to the next row). Firing times are computed by
// walking the tree, so editing a lead or the increment re-times everything
// downstream. Diagrams saved before this model ("painted" per-hole delays)
// still render via the legacy `delays` map.

import type { TimingWire } from '@shotlog/shared';

// Timing math (computeFiringTimes, delayWindowSizes, 8ms rule) lives in
// @shotlog/shared — ShotDiagram satisfies its TimingPlan shape structurally.
export { computeFiringTimes, delayWindowSizes, maxHolesPerWindow, DELAY_WINDOW_MS } from '@shotlog/shared';

export type Wire = TimingWire;

export interface DrillPlanOverride {
  depth?: number;
  angle?: number;
}

/** Per-hole drilling plan authored by the blaster in the shot designer.
 *  Holes inherit `defaultDepth`; only exceptions live in `overrides`
 *  (keyed by hole index — hole NUMBER is index + 1, row-major). */
export interface DrillPlan {
  defaultDepth?: number;
  overrides: Record<number, DrillPlanOverride>;
}

export interface ShotDiagram {
  rows: number;
  cols: number;
  /** LEGACY painted delays (holeIndex → ms) — rendered only when no `start` */
  delays: Record<number, number>;
  wires: Wire[];
  /** Initiation hole + lead delay; presence enables sequential timing */
  start?: { hole: number; leadMs: number };
  /** Delay added by each plain hole-to-hole wire (ms) */
  interHoleMs: number;
  /** Per-hole drilling plan (depths/angles) — the Blaster→Driller handoff */
  plan?: DrillPlan;
}

/** Standard MS delay series offered for leads (wireframe's set) */
export const DELAY_SERIES = [9, 17, 24, 42, 65] as const;

/** Default hole-to-hole increment (ms) */
export const DEFAULT_INTER_HOLE_MS = 15;

/** Delay ms → display color, matching the paper form legend (legacy render) */
export const DELAY_COLORS: Record<number, string> = {
  9: '#e53e3e',
  17: '#dd6b20',
  24: '#d69e2e',
  42: '#38a169',
  65: '#3182ce',
};

export function emptyDiagram(rows = 5, cols = 10): ShotDiagram {
  return { rows, cols, delays: {}, wires: [], interHoleMs: DEFAULT_INTER_HOLE_MS };
}

export function parseDiagram(json: string | null): ShotDiagram {
  if (!json) return emptyDiagram();
  try {
    const parsed = JSON.parse(json) as Partial<ShotDiagram>;
    return {
      rows: parsed.rows ?? 5,
      cols: parsed.cols ?? 10,
      delays: parsed.delays ?? {},
      wires: parsed.wires ?? [],
      start: parsed.start,
      interHoleMs: parsed.interHoleMs ?? DEFAULT_INTER_HOLE_MS,
      plan: parsed.plan,
    };
  } catch {
    return emptyDiagram();
  }
}

/** A hole of the materialized drill plan. `n` is the hole NUMBER —
 *  sequential row-major across holes-to-drill only (unused grid positions
 *  don't consume numbers, like a paper pattern). `idx` is the grid cell. */
export interface PlanHole {
  n: number;
  idx: number;
  depth: number;
  angle: number;
}

/** Does the diagram carry any drill-plan intent at all? */
export function hasDrillPlan(d: ShotDiagram): boolean {
  return (
    d.plan !== undefined &&
    (d.plan.defaultDepth !== undefined || Object.keys(d.plan.overrides).length > 0)
  );
}

/**
 * Expand the sparse plan to the holes actually being drilled. Depth
 * resolution: override → plan default → fallback (the shot's design depth).
 * A hole whose resolved depth is zero/unset is an UNUSED grid position —
 * excluded entirely (irregular patterns on a rectangular grid). Returns []
 * when the diagram has no plan — callers fall back to unplanned behavior.
 */
export function materializeDrillPlan(d: ShotDiagram, fallbackDepth: number): PlanHole[] {
  if (!hasDrillPlan(d)) return [];
  const plan = d.plan!;
  const count = d.rows * d.cols;
  const holes: PlanHole[] = [];
  let n = 0;
  for (let idx = 0; idx < count; idx++) {
    const o = plan.overrides[idx];
    const depth = o?.depth ?? plan.defaultDepth ?? fallbackDepth;
    if (!(depth > 0)) continue; // no depth anywhere → not a hole to drill
    holes.push({ n: ++n, idx, depth, angle: o?.angle ?? 0 });
  }
  return holes;
}

export function serializeDiagram(d: ShotDiagram): string {
  return JSON.stringify(d);
}

/** Plain hole-to-hole wires connect adjacent holes (incl. diagonals) */
export function areAdjacent(a: number, b: number, cols: number): boolean {
  if (a === b) return false;
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
}

export function hasWire(wires: Wire[], from: number, to: number): boolean {
  return wires.some(
    (w) => (w.from === from && w.to === to) || (w.from === to && w.to === from),
  );
}

/** Depth difference (ft) at/beyond which a drilled hole is flagged */
export const DEPTH_FLAG_FT = 1;

export interface HoleDeviation {
  depthDelta: number; // actual − planned (ft)
  angleChanged: boolean;
  flagged: boolean;
}

/** Plan-vs-actual for one drilled hole; null when the hole had no plan.
 *  Flagged = short/deep by ≥ DEPTH_FLAG_FT or drilled at a different angle
 *  (short holes leave toe; both matter to the blaster at loading). */
export function classifyDeviation(
  planned: { depth: number; angle: number } | undefined,
  actual: { depth: number; angle: number },
): HoleDeviation | null {
  if (!planned) return null;
  const depthDelta = actual.depth - planned.depth;
  const angleChanged = (actual.angle || 0) !== (planned.angle || 0);
  return {
    depthDelta,
    angleChanged,
    flagged: Math.abs(depthDelta) >= DEPTH_FLAG_FT || angleChanged,
  };
}

/** LEGACY: count holes painted with each delay (pre-timing diagrams) */
export function delayCounts(d: ShotDiagram): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ms of Object.values(d.delays)) {
    counts.set(ms, (counts.get(ms) ?? 0) + 1);
  }
  return counts;
}
