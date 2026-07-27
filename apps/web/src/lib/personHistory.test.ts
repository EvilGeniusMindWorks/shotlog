import { describe, expect, it } from 'vitest';
import { matchesPersonName, matchesWorkRow, normalizeName, workedRow } from './personHistory';

const dinis = { id: 'cm-1', name: 'Dinis Baltazar' };

describe('person matching', () => {
  it('crewMemberId wins over a mismatched name', () => {
    expect(matchesWorkRow({ crewMemberId: 'cm-1', workerName: 'whoever' }, dinis)).toBe(true);
    expect(matchesWorkRow({ crewMemberId: 'cm-2', workerName: 'Dinis Baltazar' }, dinis)).toBe(false);
  });

  it('legacy free-text names match case/whitespace-insensitively', () => {
    expect(matchesWorkRow({ workerName: 'dinis  baltazar' }, dinis)).toBe(true);
    expect(matchesWorkRow({ workerName: ' DINIS BALTAZAR ' }, dinis)).toBe(true);
    expect(matchesWorkRow({ workerName: 'Paulo Santos' }, dinis)).toBe(false);
  });

  it('empty names never match', () => {
    expect(matchesPersonName('', dinis)).toBe(false);
    expect(matchesPersonName(undefined, dinis)).toBe(false);
    expect(matchesPersonName('   ', dinis)).toBe(false);
  });

  it('normalizeName collapses inner whitespace', () => {
    expect(normalizeName('  Dinis   Baltazar ')).toBe('dinis baltazar');
  });
});

describe('workedRow — the auto-populate trap', () => {
  it('auto-populated rows with empty times are NOT worked days', () => {
    // createBlastDay seeds a row for EVERY roster member — presence ≠ worked
    expect(workedRow({ timeIn: '', timeOut: '', straightTime: 0 })).toBe(false);
  });

  it('any real time entry counts as worked', () => {
    expect(workedRow({ timeIn: '07:00', timeOut: '', straightTime: 0 })).toBe(true);
    expect(workedRow({ timeIn: '', timeOut: '15:30', straightTime: 0 })).toBe(true);
    expect(workedRow({ timeIn: '', timeOut: '', straightTime: 8 })).toBe(true);
  });
});
