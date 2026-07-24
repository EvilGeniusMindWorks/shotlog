// Parser for Instantel seismograph event printouts (Micromate / Minimate).
//
// The summary block is fixed-layout monospace, e.g.:
//
//   Serial Number:  UM6686 V 11-0AK
//   Trigger Level:  Geo 0.050 in/s
//   ...
//   Trigger Source: Tran at 09:20:11 on February 25, 2026
//   Parameter            Tran    Vert    Long    Unit
//   PPV:                 0.169   0.172   0.125   in/s
//   ZC Frequency:        21      32      26      Hz
//   Peak (Rel. to Trig): 0.212   0.103   0.056   sec
//   Max Acceleration:    0.209   0.184   0.145   g
//   Max Displacement:    0.00102 0.00080 0.00063 in
//   Peak Vector Sum:     0.190 in/s at 0.103 seconds
//   Peak Overpressure:   90.66 dB at 0.136 seconds
//
// Input is raw OCR text, so matching is label-anchored and tolerant of
// spacing noise. Every field is optional — the caller shows what was found
// and the blaster verifies against the paper.

export interface InstantelReading {
  serialNumber?: string;
  operator?: string;
  location?: string;
  client?: string;
  /** ISO datetime of the trigger, e.g. 2026-02-25T09:20:11 (device-local) */
  triggerTimestamp?: string;
  ppvTran?: number;
  ppvVert?: number;
  ppvLong?: number;
  /** ZC frequency per axis (Hz) */
  freqTran?: number;
  freqVert?: number;
  freqLong?: number;
  maxAccelTran?: number;
  maxAccelVert?: number;
  maxAccelLong?: number;
  maxDisplacementTran?: number;
  maxDisplacementVert?: number;
  maxDisplacementLong?: number;
  peakVectorSum?: number;
  /** Air overpressure in dB */
  peakOverpressure?: number;
  /** Number of populated fields — used to score OCR rotation attempts */
  score: number;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Grab up to three numbers following a label on one line */
function tripleAfter(text: string, label: RegExp): [number?, number?, number?] {
  const m = text.match(label);
  if (!m) return [undefined, undefined, undefined];
  const rest = text.slice(m.index! + m[0].length).split('\n')[0];
  const nums = rest.match(/-?\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  return [nums[0], nums[1], nums[2]];
}

function textAfter(text: string, label: RegExp): string | undefined {
  const m = text.match(label);
  if (!m) return undefined;
  const rest = text.slice(m.index! + m[0].length).split('\n')[0].trim();
  return rest.length > 0 ? rest : undefined;
}

export function parseInstantelPrintout(raw: string): InstantelReading {
  // OCR loves to read ':' as ';' or '.' — normalize label punctuation
  const text = raw.replace(/[;：]/g, ':');
  const r: InstantelReading = { score: 0 };

  const serialLine = textAfter(text, /Serial\s*Number\s*:/i);
  if (serialLine) r.serialNumber = serialLine.split(/\s+/)[0];
  r.operator = textAfter(text, /Operator\s*:/i);
  r.location = textAfter(text, /Location\s*:/i);
  r.client = textAfter(text, /Client\s*:/i);

  // "Tran at 09:20:11 on February 25, 2026"
  const trig = text.match(
    /at\s+(\d{1,2}):(\d{2}):(\d{2})\s+on\s+([A-Za-z]+)\s+(\d{1,2})\s*,?\s*(\d{4})/,
  );
  if (trig) {
    const month = MONTHS[trig[4].toLowerCase()];
    if (month) {
      const pad = (n: string | number) => String(n).padStart(2, '0');
      r.triggerTimestamp = `${trig[6]}-${pad(month)}-${pad(trig[5])}T${pad(trig[1])}:${trig[2]}:${trig[3]}`;
    }
  }

  [r.ppvTran, r.ppvVert, r.ppvLong] = tripleAfter(text, /PPV\s*:/i);
  // First ZC line is the geo axes; the microphone ZC appears later
  [r.freqTran, r.freqVert, r.freqLong] = tripleAfter(text, /ZC\s*Frequency\s*:/i);
  [r.maxAccelTran, r.maxAccelVert, r.maxAccelLong] = tripleAfter(
    text,
    /Max\s*Acceleration\s*:/i,
  );
  [r.maxDisplacementTran, r.maxDisplacementVert, r.maxDisplacementLong] = tripleAfter(
    text,
    /Max\s*Displacement\s*:/i,
  );
  [r.peakVectorSum] = tripleAfter(text, /Peak\s*Vector\s*Sum\s*:/i);
  [r.peakOverpressure] = tripleAfter(text, /Peak\s*Overpressure\s*:/i);
  if (r.peakOverpressure === undefined) {
    // OCR often mangles the label; the value's shape is unique on the tape —
    // "90.66 dB at 0.136 seconds" (trigger/range dB lines have no "at … seconds")
    const m = text.match(/(\d+(?:\.\d+)?)\s*dB\s+at\s+\d+(?:\.\d+)?\s*seconds/i);
    if (m) r.peakOverpressure = Number(m[1]);
  }

  // Sanity limits: OCR misreads that survive the regexes get dropped rather
  // than silently populating an impossible value
  const inRange = (v: number | undefined, max: number) =>
    v !== undefined && v >= 0 && v <= max ? v : undefined;
  r.ppvTran = inRange(r.ppvTran, 20);
  r.ppvVert = inRange(r.ppvVert, 20);
  r.ppvLong = inRange(r.ppvLong, 20);
  r.freqTran = inRange(r.freqTran, 500);
  r.freqVert = inRange(r.freqVert, 500);
  r.freqLong = inRange(r.freqLong, 500);
  r.maxAccelTran = inRange(r.maxAccelTran, 50);
  r.maxAccelVert = inRange(r.maxAccelVert, 50);
  r.maxAccelLong = inRange(r.maxAccelLong, 50);
  r.maxDisplacementTran = inRange(r.maxDisplacementTran, 10);
  r.maxDisplacementVert = inRange(r.maxDisplacementVert, 10);
  r.maxDisplacementLong = inRange(r.maxDisplacementLong, 10);
  r.peakVectorSum = inRange(r.peakVectorSum, 30);
  r.peakOverpressure = inRange(r.peakOverpressure, 200);

  r.score = (Object.keys(r) as (keyof InstantelReading)[]).filter(
    (k) => k !== 'score' && r[k] !== undefined,
  ).length;
  return r;
}

/**
 * The frequency to check compliance against: the ZC frequency of the axis
 * with the highest PPV (the peak that governs).
 */
export function dominantFrequency(r: InstantelReading): number | undefined {
  const axes: [number | undefined, number | undefined][] = [
    [r.ppvTran, r.freqTran],
    [r.ppvVert, r.freqVert],
    [r.ppvLong, r.freqLong],
  ];
  let best: [number, number] | null = null;
  for (const [ppv, freq] of axes) {
    if (ppv === undefined || freq === undefined) continue;
    if (!best || ppv > best[0]) best = [ppv, freq];
  }
  return best?.[1];
}
