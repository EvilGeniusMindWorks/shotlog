import { describe, expect, it } from 'vitest';
import { deriveDrillAngle, deriveHoleLength } from './drillGeometry';

describe('deriveDrillAngle', () => {
  it('is 0 with no kick', () => {
    expect(deriveDrillAngle(40, undefined)).toBe(0);
    expect(deriveDrillAngle(40, 0)).toBe(0);
  });

  it('is 45° when kick equals depth', () => {
    expect(deriveDrillAngle(30, 30)).toBeCloseTo(45, 5);
  });

  it('matches atan for a typical kick', () => {
    // 5 ft kick on a 40 ft hole ≈ 7.13° from vertical
    expect(deriveDrillAngle(40, 5)).toBeCloseTo(7.125, 2);
  });

  it('guards zero/negative depth', () => {
    expect(deriveDrillAngle(0, 5)).toBe(0);
    expect(deriveDrillAngle(-3, 5)).toBe(0);
  });
});

describe('deriveHoleLength', () => {
  it('equals depth with no kick', () => {
    expect(deriveHoleLength(40, undefined)).toBe(40);
    expect(deriveHoleLength(40, 0)).toBe(40);
  });

  it('is depth·√2 when kick equals depth', () => {
    expect(deriveHoleLength(30, 30)).toBeCloseTo(30 * Math.SQRT2, 5);
  });

  it('matches Pythagoras for a typical kick', () => {
    // 40 ft vertical + 5 ft kick → 40.31 ft of drilling
    expect(deriveHoleLength(40, 5)).toBeCloseTo(40.311, 2);
  });

  it('guards zero/negative depth', () => {
    expect(deriveHoleLength(0, 5)).toBe(0);
    expect(deriveHoleLength(-3, 5)).toBe(0);
  });
});
