import { describe, expect, it } from 'vitest';
import {
  DELAY_WINDOW_MS,
  computeFiringTimes,
  delayWindowSizes,
  maxHolesPerWindow,
  type TimingPlan,
} from './timing.js';

const chain = (holes: number[], leadMs: number, interHoleMs = 15): TimingPlan => ({
  start: { hole: holes[0], leadMs },
  interHoleMs,
  wires: holes.slice(1).map((to, i) => ({ from: holes[i], to })),
});

describe('computeFiringTimes', () => {
  it('returns empty with no start', () => {
    expect(computeFiringTimes({ wires: [], interHoleMs: 15 }).size).toBe(0);
  });

  it("increments along a row: Mark's example 17 → 32 → 47", () => {
    const times = computeFiringTimes(chain([0, 1, 2], 17));
    expect(times.get(0)).toBe(17);
    expect(times.get(1)).toBe(32);
    expect(times.get(2)).toBe(47);
  });

  it('respects a custom increment', () => {
    const times = computeFiringTimes(chain([0, 1], 9, 25));
    expect(times.get(1)).toBe(34);
  });

  it('lead wire branches to another row with its own delay', () => {
    // Row 1: holes 0,1,2 at 17/32/47. Lead (42ms) from hole 1 → hole 10,
    // then that row continues at +15.
    const plan: TimingPlan = {
      start: { hole: 0, leadMs: 17 },
      interHoleMs: 15,
      wires: [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 1, to: 10, leadMs: 42 },
        { from: 10, to: 11 },
      ],
    };
    const times = computeFiringTimes(plan);
    expect(times.get(10)).toBe(32 + 42); // 74
    expect(times.get(11)).toBe(74 + 15); // 89
    expect(times.get(2)).toBe(47); // first row unaffected
  });

  it('ignores unreachable holes and survives cycles', () => {
    const plan: TimingPlan = {
      start: { hole: 0, leadMs: 10 },
      interHoleMs: 15,
      wires: [
        { from: 0, to: 1 },
        { from: 1, to: 0 }, // cycle back
        { from: 5, to: 6 }, // disconnected
      ],
    };
    const times = computeFiringTimes(plan);
    expect(times.size).toBe(2);
    expect(times.get(0)).toBe(10); // first assignment wins
    expect(times.has(6)).toBe(false);
  });
});

describe('delayWindowSizes (8ms rule)', () => {
  it('15ms spacing puts every hole in its own window', () => {
    const times = computeFiringTimes(chain([0, 1, 2, 3], 17));
    expect(delayWindowSizes(times)).toEqual([1, 1, 1, 1]);
    expect(maxHolesPerWindow(chain([0, 1, 2, 3], 17))).toBe(1);
  });

  it('groups holes firing within 8ms', () => {
    // Two branches fire holes at identical times: 17, 32 | 32, 47
    const plan: TimingPlan = {
      start: { hole: 0, leadMs: 17 },
      interHoleMs: 15,
      wires: [
        { from: 0, to: 1 },
        { from: 0, to: 2, leadMs: 15 }, // hole 2 also at 32
        { from: 1, to: 3 },
        { from: 2, to: 4 }, // hole 4 also at 47
      ],
    };
    expect(delayWindowSizes(computeFiringTimes(plan))).toEqual([1, 2, 2]);
    expect(maxHolesPerWindow(plan)).toBe(2);
  });

  it('a gap of exactly 8ms starts a new window', () => {
    const plan: TimingPlan = {
      start: { hole: 0, leadMs: 0 },
      interHoleMs: DELAY_WINDOW_MS,
      wires: [{ from: 0, to: 1 }],
    };
    expect(delayWindowSizes(computeFiringTimes(plan))).toEqual([1, 1]);
  });

  it('a gap under 8ms stays in the same window', () => {
    const plan: TimingPlan = {
      start: { hole: 0, leadMs: 0 },
      interHoleMs: DELAY_WINDOW_MS - 1,
      wires: [{ from: 0, to: 1 }],
    };
    expect(delayWindowSizes(computeFiringTimes(plan))).toEqual([2]);
  });
});
