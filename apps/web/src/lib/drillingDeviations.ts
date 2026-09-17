// S20 (Matthew, Sep 16 2026): "By keeping the shot plan aligned to the drill
// plan that comes back completed from the drillers, they will always match.
// Perhaps a warning if the shot deviates from the plan or doesn't use all the
// drilled holes." Once the drilling is accepted the timing sits on the drilled
// pattern by itself; these are the places where the timing and the drilling
// still disagree — amber to look at, red when a timed hole was never drilled.
import type { PlanHole, ShotDiagram } from './shotDiagram';
import type { ShotDrilling } from '@/hooks/useDrillLogs';

export interface DrillingDeviation {
  key: string;
  level: 'amber' | 'red';
  text: string;
}

const ft = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}′`;

/** 12, 13, 14, 17 → "12–14, 17" */
export function holeRanges(nums: number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j - i >= 2 ? `${s[i]}–${s[j]}` : j === i ? String(s[i]) : `${s[i]}, ${s[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

export function drillingDeviations(
  diagram: ShotDiagram,
  planHoles: PlanHole[] | null,
  drilling: ShotDrilling | undefined,
): DrillingDeviation[] {
  const out: DrillingDeviation[] = [];
  if (!drilling || !planHoles || planHoles.length === 0) return out;
  const missing = new Set([...drilling.undrilled, ...drilling.skipped]);
  const wired = new Set<number>();
  for (const w of diagram.wires) {
    wired.add(w.from);
    wired.add(w.to);
  }
  if (diagram.start) wired.add(diagram.start.hole);

  // RED — timed, but the drill log says the hole was never drilled
  const timedNotDrilled = planHoles.filter((p) => missing.has(String(p.n)) && wired.has(p.idx)).map((p) => p.n);
  if (timedNotDrilled.length) {
    const one = timedNotDrilled.length === 1;
    out.push({
      key: 'timed-undrilled',
      level: 'red',
      text: `${one ? `Hole ${timedNotDrilled[0]} is` : `Holes ${holeRanges(timedNotDrilled)} are`} timed but the drill log marks ${one ? 'it' : 'them'} not drilled`,
    });
  }

  // AMBER — holes the drillers added: the plan's grid has no place for them
  if (drilling.extras.length) {
    const one = drilling.extras.length === 1;
    out.push({
      key: 'added',
      level: 'amber',
      text: `${one ? `Hole ${drilling.extras[0]} was` : `Holes ${drilling.extras.join(', ')} were`} added by the drillers and ${one ? 'has' : 'have'} no delay — not on the plan's grid`,
    });
  }

  // AMBER — drilled to a different depth (grouped: "Holes 12–14 drilled 30′, the plan says 32′")
  const byDepth = new Map<string, number[]>();
  const angleOnly: number[] = [];
  for (const f of drilling.flagged) {
    const n = parseInt(f.holeNumber, 10);
    if (!Number.isFinite(n)) continue;
    if (Math.abs(f.depthDelta) >= 1) {
      const k = `${f.actualDepth}|${f.plannedDepth}`;
      byDepth.set(k, [...(byDepth.get(k) ?? []), n]);
    } else if (f.angleChanged) angleOnly.push(n);
  }
  for (const [k, holes] of byDepth) {
    const [actual, planned] = k.split('|').map(Number);
    const one = holes.length === 1;
    out.push({
      key: `depth-${k}`,
      level: 'amber',
      text: `${one ? `Hole ${holes[0]} is` : `Holes ${holeRanges(holes)} are`} drilled ${ft(actual)}, the plan says ${ft(planned)}`,
    });
  }
  if (angleOnly.length) {
    out.push({
      key: 'angle',
      level: 'amber',
      text: `${angleOnly.length === 1 ? `Hole ${angleOnly[0]} was` : `Holes ${holeRanges(angleOnly)} were`} drilled at a different angle from the plan`,
    });
  }

  // AMBER — drilled holes the timing has not reached (only once the timing has begun)
  if (diagram.wires.length > 0 || diagram.start) {
    const noDelay = planHoles.filter((p) => !missing.has(String(p.n)) && !wired.has(p.idx)).map((p) => p.n);
    if (noDelay.length) {
      const one = noDelay.length === 1;
      out.push({
        key: 'no-delay',
        level: 'amber',
        text: `${noDelay.length} drilled hole${one ? '' : 's'} ${one ? 'has' : 'have'} no delay yet (${holeRanges(noDelay)})`,
      });
    }
  }
  return out;
}
