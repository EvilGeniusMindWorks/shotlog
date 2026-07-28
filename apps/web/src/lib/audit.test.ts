import { describe, expect, it } from 'vitest';
import { describeChange, describeEntry, fieldLabel, tableLabel } from './audit';

describe('audit rendering', () => {
  it('field labels prettify camelCase', () => {
    expect(fieldLabel('workerName')).toBe('Worker name');
    expect(fieldLabel('totalPoundsShot')).toBe('Total pounds shot');
  });
  it('table labels map to friendly names', () => {
    expect(tableLabel('blastDays')).toBe('Work Day');
    expect(tableLabel('unknownTable')).toBe('unknownTable');
  });
  it('describes value changes with quotes stripped', () => {
    expect(describeChange({ field: 'burden', old: '4', new: '5' })).toBe('Burden: 4 → 5');
    expect(describeChange({ field: 'workerName', old: '"Al"', new: '"Bob"' })).toBe(
      'Worker name: Al → Bob',
    );
  });
  it('describes creation, deletion, heavy updates', () => {
    expect(describeChange({ field: '*', note: 'created' })).toBe('created');
    expect(describeChange({ field: '*', note: 'deleted' })).toBe('deleted');
    expect(describeChange({ field: 'signatureImage', note: 'updated' })).toBe(
      'Signature image updated',
    );
  });
  it('discards render the reason', () => {
    expect(
      describeEntry({
        id: '1', tableName: 'blastDays', recordId: 'x', op: 'DISCARD',
        actorId: 'u', actorName: 'Barry', actorRole: 'blaster', at: '', changes: [],
        reason: 'day submitted (locked)',
      }),
    ).toBe('write rejected — day submitted (locked)');
  });
});
