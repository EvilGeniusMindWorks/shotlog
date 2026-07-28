import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from './csv';

describe('csv', () => {
  it('passes plain values through', () => {
    expect(csvEscape('Route 3')).toBe('Route 3');
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape(null)).toBe('');
  });
  it('quotes commas, quotes, and newlines', () => {
    expect(csvEscape('Dyno, AP')).toBe('"Dyno, AP"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
  it('joins rows CRLF', () => {
    expect(toCsv([['a', 'b'], [1, 'x,y']])).toBe('a,b\r\n1,"x,y"');
  });
});
