import { describe, expect, it } from 'vitest';
import { diffPayloads } from './auditDiff';

describe('diffPayloads', () => {
  it('null/empty old payload = creation', () => {
    expect(diffPayloads(null, { a: 1 })).toEqual([{ field: '*', note: 'created' }]);
    expect(diffPayloads({}, { a: 1 })).toEqual([{ field: '*', note: 'created' }]);
  });

  it('reports changed scalar fields with old and new', () => {
    const changes = diffPayloads(
      { burden: 4, spacing: 5, name: 'x' },
      { burden: 5, spacing: 5, name: 'x' },
    );
    expect(changes).toEqual([{ field: 'burden', old: '4', new: '5' }]);
  });

  it('added and removed fields show one undefined side', () => {
    const changes = diffPayloads({ a: 1 }, { a: 1, b: 'hi' });
    expect(changes).toEqual([{ field: 'b', old: undefined, new: '"hi"' }]);
  });

  it('nested objects compare by JSON equality', () => {
    const changes = diffPayloads(
      { drillParams: { burden: 4, spacing: 5 } },
      { drillParams: { burden: 5, spacing: 5 } },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('drillParams');
    expect(changes[0].new).toContain('"burden":5');
  });

  it('heavy blob fields record a note without values', () => {
    const changes = diffPayloads(
      { signatureImage: { __blob: 'AAAA', __type: 'image/png' } },
      { signatureImage: { __blob: 'BBBB', __type: 'image/png' } },
    );
    expect(changes).toEqual([{ field: 'signatureImage', note: 'updated' }]);
  });

  it('long values truncate at 300 chars with an ellipsis', () => {
    const changes = diffPayloads({ notes: 'a' }, { notes: 'b'.repeat(500) });
    expect(changes[0].new!.length).toBe(301);
    expect(changes[0].new!.endsWith('…')).toBe(true);
  });

  it('identical payloads produce no changes', () => {
    expect(diffPayloads({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });
});
