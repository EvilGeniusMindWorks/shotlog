import { describe, expect, it } from 'vitest';
import { matchesAsset, normalizeAsset } from './equipmentHistory';

const equip = { id: 'eq-1', assetNumber: 'R1017' };

describe('matchesAsset (daily-report rows → registry assets)', () => {
  it('id link wins when present — even over a mismatched asset number', () => {
    expect(matchesAsset({ equipmentId: 'eq-1', assetNumber: 'whatever' }, equip)).toBe(true);
    expect(matchesAsset({ equipmentId: 'eq-2', assetNumber: 'R1017' }, equip)).toBe(false);
  });

  it('legacy free-text rows match case/whitespace-insensitively', () => {
    expect(matchesAsset({ assetNumber: 'R1017' }, equip)).toBe(true);
    expect(matchesAsset({ assetNumber: ' r1017 ' }, equip)).toBe(true);
    expect(matchesAsset({ assetNumber: 'R1004' }, equip)).toBe(false);
  });

  it('empty asset numbers never match anything', () => {
    expect(matchesAsset({ assetNumber: '' }, equip)).toBe(false);
    expect(matchesAsset({ assetNumber: '   ' }, equip)).toBe(false);
  });

  it('normalizeAsset trims and lowercases', () => {
    expect(normalizeAsset('  R1017 ')).toBe('r1017');
  });
});
