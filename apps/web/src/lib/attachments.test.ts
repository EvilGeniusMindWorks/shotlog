import { describe, expect, it } from 'vitest';
import { BUILTIN_KINDS, R2_MAX_BYTES, eligibleForR2, kindLabel, mergeKinds } from './attachments';

describe('mergeKinds', () => {
  it('offers built-ins + Other with no customs', () => {
    const kinds = mergeKinds(undefined);
    expect(kinds.map((k) => k.value)).toEqual([
      ...BUILTIN_KINDS.map((k) => k.value),
      'other',
    ]);
  });

  it('company customs slot between built-ins and Other', () => {
    const kinds = mergeKinds(['Permit', '  Pre-blast survey  ', '']);
    expect(kinds.map((k) => k.label)).toEqual([
      'Bill of lading',
      'Shot video',
      'Photo',
      'Permit',
      'Pre-blast survey',
      'Other',
    ]);
  });
});

describe('kindLabel', () => {
  it('maps built-in slugs to labels', () => {
    expect(kindLabel('bill_of_lading')).toBe('Bill of lading');
  });
  it('custom types are their own label', () => {
    expect(kindLabel('Permit')).toBe('Permit');
  });
  it('undefined and other render as Other', () => {
    expect(kindLabel(undefined)).toBe('Other');
    expect(kindLabel('other')).toBe('Other');
  });
});

describe('eligibleForR2', () => {
  it('accepts anything at or under the cap', () => {
    expect(eligibleForR2('image/jpeg', 2 * 1024 * 1024)).toBe(true);
    expect(eligibleForR2('video/mp4', R2_MAX_BYTES)).toBe(true);
  });
  it('rejects full-length videos over the cap (device-only until clipped)', () => {
    expect(eligibleForR2('video/mp4', R2_MAX_BYTES + 1)).toBe(false);
  });
});
