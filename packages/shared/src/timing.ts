// Initiation timing — the sequential-wiring model (Spec §5.3 revision).
//
// A shot's initiation is a tree: one start hole with a lead delay, then
// wires hole-to-hole. Each plain wire adds the inter-hole increment; a lead
// wire carries its own delay (how a branch line jumps to another row).
// Firing time of a hole = time of the hole it's wired from + that wire's
// delay.

export interface TimingWire {
  from: number; // hole index
  to: number;
  /** Lead wire: carries its own delay instead of the inter-hole increment */
  leadMs?: number;
}

export interface TimingPlan {
  wires: TimingWire[];
  /** Initiation hole + lead delay; absent = no timing designed yet */
  start?: { hole: number; leadMs: number };
  /** Delay added by each plain hole-to-hole wire (ms) */
  interHoleMs: number;
}

/**
 * Charges initiated within this window count as one delay for
 * pounds-per-delay purposes (USBM/OSM 8ms rule).
 */
export const DELAY_WINDOW_MS = 8;

/**
 * Walk the initiation tree from the start hole. Holes not reachable from the
 * start have no firing time. First assignment wins; cycles are ignored.
 */
export function computeFiringTimes(plan: TimingPlan): Map<number, number> {
  const times = new Map<number, number>();
  if (!plan.start) return times;
  times.set(plan.start.hole, plan.start.leadMs);
  const queue = [plan.start.hole];
  while (queue.length) {
    const from = queue.shift()!;
    const t = times.get(from)!;
    for (const w of plan.wires) {
      if (w.from !== from || times.has(w.to)) continue;
      times.set(w.to, t + (w.leadMs ?? plan.interHoleMs));
      queue.push(w.to);
    }
  }
  return times;
}

/**
 * Group firing times into 8ms windows: sorted times start a new group when
 * they fall DELAY_WINDOW_MS or more after the group's first charge.
 * Returns group sizes; the max is the effective holes-per-delay.
 */
export function delayWindowSizes(times: Map<number, number>): number[] {
  const sorted = [...times.values()].sort((a, b) => a - b);
  const groups: number[] = [];
  let groupStart = Number.NEGATIVE_INFINITY;
  for (const t of sorted) {
    if (t - groupStart >= DELAY_WINDOW_MS) {
      groups.push(1);
      groupStart = t;
    } else {
      groups[groups.length - 1]++;
    }
  }
  return groups;
}

/** Max simultaneous holes under the 8ms rule (0 when no timing yet) */
export function maxHolesPerWindow(plan: TimingPlan): number {
  return Math.max(0, ...delayWindowSizes(computeFiringTimes(plan)));
}
