// Shot diagram model — the tap-grid state persisted as JSON in
// Shot.designPlan.shotDiagramData (Spec §5.3).

export interface Wire {
  from: number; // hole index
  to: number;
}

export interface ShotDiagram {
  rows: number;
  cols: number;
  /** holeIndex → delay in milliseconds */
  delays: Record<number, number>;
  wires: Wire[];
}

/** Standard MS delay series offered in the palette (wireframe's set) */
export const DELAY_SERIES = [9, 17, 24, 42, 65] as const;

/** Delay ms → display color, matching the paper form legend */
export const DELAY_COLORS: Record<number, string> = {
  9: '#e53e3e',
  17: '#dd6b20',
  24: '#d69e2e',
  42: '#38a169',
  65: '#3182ce',
};

export function emptyDiagram(rows = 5, cols = 10): ShotDiagram {
  return { rows, cols, delays: {}, wires: [] };
}

export function parseDiagram(json: string | null): ShotDiagram {
  if (!json) return emptyDiagram();
  try {
    const parsed = JSON.parse(json) as Partial<ShotDiagram>;
    return {
      rows: parsed.rows ?? 5,
      cols: parsed.cols ?? 10,
      delays: parsed.delays ?? {},
      wires: parsed.wires ?? [],
    };
  } catch {
    return emptyDiagram();
  }
}

export function serializeDiagram(d: ShotDiagram): string {
  return JSON.stringify(d);
}

/** Two holes are wireable when adjacent (incl. diagonals) on the grid */
export function areAdjacent(a: number, b: number, cols: number): boolean {
  if (a === b) return false;
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
}

export function hasWire(wires: Wire[], from: number, to: number): boolean {
  return wires.some(
    (w) => (w.from === from && w.to === to) || (w.from === to && w.to === from),
  );
}

/** Count holes painted with each delay — feeds max-holes-per-delay */
export function delayCounts(d: ShotDiagram): Map<number, number> {
  const counts = new Map<number, number>();
  for (const ms of Object.values(d.delays)) {
    counts.set(ms, (counts.get(ms) ?? 0) + 1);
  }
  return counts;
}
