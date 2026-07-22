import { describe, it, expect } from 'vitest';
import { distributeByHoles } from './distribution.js';

describe('distributeByHoles', () => {
  it('distributes proportionally by hole count (spec example: 18/34 ≈ 53%)', () => {
    const result = distributeByHoles(100, [
      { shotId: 'a', holes: 18 },
      { shotId: 'b', holes: 16 },
    ]);
    expect(result.allocations.a).toBe(53); // 18/34 × 100 = 52.94 → 53
    expect(result.allocations.b).toBe(47);
    expect(result.remaining).toBe(0);
  });

  it('produces whole units that sum exactly to the total', () => {
    const result = distributeByHoles(20, [
      { shotId: 'a', holes: 18 },
      { shotId: 'b', holes: 16 },
    ]);
    // 18/34 × 20 = 10.59 — a blaster can't load 0.59 of a bag
    expect(result.allocations.a).toBe(11);
    expect(result.allocations.b).toBe(9);
    expect(result.remaining).toBe(0);
  });

  it('sums exactly for awkward three-way splits', () => {
    const result = distributeByHoles(10, [
      { shotId: 'a', holes: 1 },
      { shotId: 'b', holes: 1 },
      { shotId: 'c', holes: 1 },
    ]);
    const values = Object.values(result.allocations);
    expect(values.reduce((s, v) => s + v, 0)).toBe(10);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('gives a single shot the full quantity', () => {
    const result = distributeByHoles(42, [{ shotId: 'a', holes: 25 }]);
    expect(result.allocations.a).toBe(42);
    expect(result.remaining).toBe(0);
  });

  it('splits evenly when no holes are entered yet', () => {
    const result = distributeByHoles(10, [
      { shotId: 'a', holes: 0 },
      { shotId: 'b', holes: 0 },
    ]);
    expect(result.allocations.a).toBe(5);
    expect(result.allocations.b).toBe(5);
  });

  it('respects an override and redistributes the remainder', () => {
    const result = distributeByHoles(
      20,
      [
        { shotId: 'a', holes: 10 },
        { shotId: 'b', holes: 10 },
        { shotId: 'c', holes: 20 },
      ],
      { a: 2 },
    );
    expect(result.allocations.a).toBe(2); // pinned
    // remaining 18 split 10:20 between b and c
    expect(result.allocations.b).toBe(6);
    expect(result.allocations.c).toBe(12);
    expect(result.autoShotIds).toEqual(['b', 'c']);
    expect(result.remaining).toBe(0);
  });

  it('reports negative remaining when overrides over-allocate', () => {
    const result = distributeByHoles(
      10,
      [
        { shotId: 'a', holes: 5 },
        { shotId: 'b', holes: 5 },
      ],
      { a: 8, b: 6 },
    );
    expect(result.allocations.a).toBe(8);
    expect(result.allocations.b).toBe(6);
    expect(result.autoShotIds).toEqual([]);
    expect(result.remaining).toBe(-4);
  });

  it('auto shots get zero when overrides consume the total', () => {
    const result = distributeByHoles(
      10,
      [
        { shotId: 'a', holes: 5 },
        { shotId: 'b', holes: 5 },
      ],
      { a: 10 },
    );
    expect(result.allocations.b).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it('keeps fractional totals exact', () => {
    const result = distributeByHoles(10.5, [
      { shotId: 'a', holes: 1 },
      { shotId: 'b', holes: 2 },
    ]);
    const sum = result.allocations.a + result.allocations.b;
    expect(sum).toBeCloseTo(10.5, 10);
    expect(result.remaining).toBe(0);
  });

  it('handles an empty shot list', () => {
    const result = distributeByHoles(10, []);
    expect(result.allocations).toEqual({});
    expect(result.remaining).toBe(10);
  });

  it('ignores overrides for shots not in the list', () => {
    const result = distributeByHoles(10, [{ shotId: 'a', holes: 5 }], { ghost: 99 });
    expect(result.allocations.a).toBe(10);
    expect(result.allocations.ghost).toBeUndefined();
  });

  it('handles zero total quantity', () => {
    const result = distributeByHoles(0, [
      { shotId: 'a', holes: 5 },
      { shotId: 'b', holes: 5 },
    ]);
    expect(result.allocations.a).toBe(0);
    expect(result.allocations.b).toBe(0);
    expect(result.remaining).toBe(0);
  });
});
