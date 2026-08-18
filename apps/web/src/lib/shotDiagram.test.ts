import { describe, expect, it } from 'vitest';
import {
  DEPTH_FLAG_FT,
  classifyDeviation,
  emptyDiagram,
  hasDrillPlan,
  materializeDrillPlan,
  parseDiagram,
  serializeDiagram,
  type ShotDiagram,
} from './shotDiagram';

const withPlan = (plan: ShotDiagram['plan'], rows = 2, cols = 3): ShotDiagram => ({
  ...emptyDiagram(rows, cols),
  plan,
});

describe('materializeDrillPlan', () => {
  it('returns [] when no plan was authored (unplanned shots stay unplanned)', () => {
    expect(materializeDrillPlan(emptyDiagram(), 18)).toEqual([]);
    expect(materializeDrillPlan(withPlan({ overrides: {} }), 18)).toEqual([]);
  });

  it('numbers holes row-major starting at 1', () => {
    const holes = materializeDrillPlan(withPlan({ defaultDepth: 16, overrides: {} }), 0);
    expect(holes.map((h) => h.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('every hole inherits the default; only exceptions differ', () => {
    const holes = materializeDrillPlan(
      withPlan({ defaultDepth: 16, overrides: { 0: { depth: 18.5, angle: 15 } } }),
      0,
    );
    // toMatchObject: kick-aware fields (holeLength, kick, kickDir) ride along
    expect(holes[0]).toMatchObject({ n: 1, idx: 0, depth: 18.5, angle: 15 });
    expect(holes[1]).toMatchObject({ n: 2, idx: 1, depth: 16, angle: 0 });
    expect(holes[5]).toMatchObject({ n: 6, idx: 5, depth: 16, angle: 0 });
  });

  it('falls back to the design depth when no default is set', () => {
    const holes = materializeDrillPlan(withPlan({ overrides: { 2: { angle: 10 } } }), 14);
    expect(holes[0].depth).toBe(14);
    expect(holes[2]).toMatchObject({ n: 3, idx: 2, depth: 14, angle: 10 });
  });

  it('an angle-only override keeps the inherited depth', () => {
    const holes = materializeDrillPlan(
      withPlan({ defaultDepth: 20, overrides: { 1: { angle: 15 } } }),
      0,
    );
    expect(holes[1]).toMatchObject({ n: 2, idx: 1, depth: 20, angle: 15 });
  });

  it('holes without any depth are UNUSED — excluded, not zero-depth plan holes', () => {
    // Mark's case: 21 painted holes on a 50-hole grid, no default set —
    // only the painted holes are the plan
    const holes = materializeDrillPlan(
      withPlan({ overrides: { 0: { depth: 18 }, 3: { depth: 16 } } }),
      0, // no design depth either
    );
    expect(holes).toHaveLength(2);
    expect(holes.map((h) => h.idx)).toEqual([0, 3]);
  });

  it('numbering is sequential across holes-to-drill (unused positions skip)', () => {
    const holes = materializeDrillPlan(
      withPlan({ defaultDepth: 16, overrides: { 1: { depth: 0 }, 2: { depth: 0 } } }),
      0,
    );
    // grid cells 0,3,4,5 are drilled and numbered 1..4 — like a paper pattern
    expect(holes.map((h) => [h.n, h.idx])).toEqual([[1, 0], [2, 3], [3, 4], [4, 5]]);
  });

  it('the "no hole" marker (depth 0 override) beats a set default', () => {
    const holes = materializeDrillPlan(
      withPlan({ defaultDepth: 16, overrides: { 5: { depth: 0 } } }),
      0,
    );
    expect(holes).toHaveLength(5);
    expect(holes.some((h) => h.idx === 5)).toBe(false);
  });
});

describe('plan serialization', () => {
  it('round-trips through serialize/parse', () => {
    const d = withPlan({ defaultDepth: 18, overrides: { 4: { depth: 12 } } });
    const back = parseDiagram(serializeDiagram(d));
    expect(back.plan).toEqual(d.plan);
    expect(hasDrillPlan(back)).toBe(true);
  });

  it('diagrams saved before plans existed still parse (plan optional)', () => {
    const legacy = JSON.stringify({ rows: 3, cols: 4, delays: { 0: 17 }, wires: [] });
    const d = parseDiagram(legacy);
    expect(d.plan).toBeUndefined();
    expect(hasDrillPlan(d)).toBe(false);
    expect(materializeDrillPlan(d, 18)).toEqual([]);
  });
});

describe('classifyDeviation', () => {
  it('null when the hole had no plan', () => {
    expect(classifyDeviation(undefined, { depth: 18, angle: 0 })).toBeNull();
  });

  it('to-plan holes are not flagged', () => {
    const dev = classifyDeviation({ depth: 18, angle: 0 }, { depth: 18, angle: 0 });
    expect(dev).toEqual({ depthDelta: 0, angleChanged: false, flagged: false });
  });

  it('under a foot of depth difference is tolerated', () => {
    expect(classifyDeviation({ depth: 18, angle: 0 }, { depth: 18.9, angle: 0 })!.flagged).toBe(false);
    expect(classifyDeviation({ depth: 18, angle: 0 }, { depth: 17.1, angle: 0 })!.flagged).toBe(false);
  });

  it(`flags at ±${DEPTH_FLAG_FT} ft — short holes leave toe`, () => {
    const short = classifyDeviation({ depth: 18, angle: 0 }, { depth: 15.5, angle: 0 })!;
    expect(short.flagged).toBe(true);
    expect(short.depthDelta).toBeCloseTo(-2.5);
    expect(classifyDeviation({ depth: 18, angle: 0 }, { depth: 19, angle: 0 })!.flagged).toBe(true);
  });

  it('any angle change flags regardless of depth', () => {
    const dev = classifyDeviation({ depth: 18, angle: 15 }, { depth: 18, angle: 0 })!;
    expect(dev.angleChanged).toBe(true);
    expect(dev.flagged).toBe(true);
    // 0 and unset are the same vertical hole
    expect(classifyDeviation({ depth: 18, angle: 0 }, { depth: 18, angle: 0 })!.angleChanged).toBe(false);
  });
});

describe('claim-as-you-drill next-hole selection', () => {
  // The page-side rule: next = lowest-numbered plan hole not drilled in ANY log
  const nextUnclaimed = (plan: { n: number }[], drilled: Set<string>) =>
    plan.find((p) => !drilled.has(String(p.n)))?.n;

  it('log B skips holes drilled in log A', () => {
    const plan = materializeDrillPlan(
      withPlan({ defaultDepth: 16, overrides: {} }, 1, 5),
      0,
    );
    const drilledByA = new Set(['1', '2', '3']);
    expect(nextUnclaimed(plan, drilledByA)).toBe(4);
  });

  it('jumped holes stay claimable (skip 2, drill 1 and 3 → next is 2)', () => {
    const plan = materializeDrillPlan(withPlan({ defaultDepth: 16, overrides: {} }, 1, 5), 0);
    expect(nextUnclaimed(plan, new Set(['1', '3']))).toBe(2);
  });

  it('a fully drilled plan has no next hole', () => {
    const plan = materializeDrillPlan(withPlan({ defaultDepth: 16, overrides: {} }, 1, 2), 0);
    expect(nextUnclaimed(plan, new Set(['1', '2']))).toBeUndefined();
  });
});
