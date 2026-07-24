import { describe, expect, it } from 'vitest';
import { dominantFrequency, parseInstantelPrintout } from './instantel.js';

// Transcribed from a real Micromate ISEE tape (Feb 25, 2026)
const REAL_TAPE = `
Instantel
Micromate ISEE
Serial Number: UM6686 V 11-0AK
Trigger Level: Geo 0.050 in/s
               Mic 120.0 dB
Range:         Geo 10.000 in/s
               Mic 148.0 dB
Record Time:   3.0 seconds at 1024 samples/seconds
Operator:      MARK SWIHART

Notes:
Location:  61 loomis rd
Client:    TEAKWOOD BUILDER
User Name: BSB
General:

Trigger Source: Tran at 09:20:11 on February 25, 2026

Parameter            Tran     Vert     Long     Unit
PPV:                 0.169    0.172    0.125    in/s
ZC Frequency:        21       32       26       Hz
Peak (Rel. to Trig): 0.212    0.103    0.056    sec
Max Acceleration:    0.209    0.184    0.145    g
Max Displacement:    0.00102  0.00080  0.00063  in
Peak Vector Sum:     0.190 in/s at 0.103 seconds

Microphone:        Linear Microphone
Peak Overpressure: 90.66 dB at 0.136 seconds on Feb 25/26
ZC Frequency:      23 Hz
`;

describe('parseInstantelPrintout', () => {
  const r = parseInstantelPrintout(REAL_TAPE);

  it('reads identity fields', () => {
    expect(r.serialNumber).toBe('UM6686');
    expect(r.operator).toBe('MARK SWIHART');
    expect(r.location).toBe('61 loomis rd');
    expect(r.client).toBe('TEAKWOOD BUILDER');
  });

  it('reads the trigger timestamp', () => {
    expect(r.triggerTimestamp).toBe('2026-02-25T09:20:11');
  });

  it('reads the three-axis parameter table', () => {
    expect([r.ppvTran, r.ppvVert, r.ppvLong]).toEqual([0.169, 0.172, 0.125]);
    expect([r.freqTran, r.freqVert, r.freqLong]).toEqual([21, 32, 26]);
    expect([r.maxAccelTran, r.maxAccelVert, r.maxAccelLong]).toEqual([0.209, 0.184, 0.145]);
    expect([r.maxDisplacementTran, r.maxDisplacementVert, r.maxDisplacementLong]).toEqual([
      0.00102, 0.0008, 0.00063,
    ]);
  });

  it('reads vector sum and overpressure (geo ZC line, not mic ZC)', () => {
    expect(r.peakVectorSum).toBe(0.19);
    expect(r.peakOverpressure).toBe(90.66);
    expect(r.freqTran).toBe(21); // first ZC line wins — 23 Hz mic line ignored
  });

  it('scores all populated fields', () => {
    expect(r.score).toBeGreaterThanOrEqual(16);
  });

  it('compliance frequency follows the highest-PPV axis (Vert 0.172 → 32 Hz)', () => {
    expect(dominantFrequency(r)).toBe(32);
  });
});

describe('OCR noise tolerance', () => {
  it('recovers overpressure when OCR mangles the label', () => {
    const r = parseInstantelPrintout(
      'Mic 120.0 dB\nMic 148.0 dB\nba HN apy 90.66 dB at 0.136 seconds on Feb 25/26',
    );
    expect(r.peakOverpressure).toBe(90.66); // not 120/148 — those lack "at … seconds"
  });

  it('handles ; for : and squeezed spacing', () => {
    const r = parseInstantelPrintout('PPV;0.169 0.172 0.125\nZC Frequency; 21 32 26');
    expect(r.ppvVert).toBe(0.172);
    expect(r.freqLong).toBe(26);
  });

  it('drops impossible values instead of populating them', () => {
    const r = parseInstantelPrintout('PPV: 916.9 0.172 0.125');
    expect(r.ppvTran).toBeUndefined(); // 916.9 in/s is an OCR artifact
    expect(r.ppvVert).toBe(0.172);
  });

  it('returns score 0 on unrelated text', () => {
    expect(parseInstantelPrintout('lorem ipsum dolor').score).toBe(0);
  });

  it('parses partial tapes', () => {
    const r = parseInstantelPrintout('PPV: 0.1 0.2 0.3');
    expect(r.score).toBe(3);
    expect(r.triggerTimestamp).toBeUndefined();
  });
});
