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
    };
  } catch {
    return emptyDiagram();
  }
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

/** LEGACY: count holes painted with each delay (pre-timing diagrams) */
export function delayCounts(d: ShotDiagram): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ms of Object.values(d.delays)) {
    counts.set(ms, (counts.get(ms) ?? 0) + 1);
  }
  return counts;
}
