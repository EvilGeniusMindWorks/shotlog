// The paintable hole grid — shared by the standalone Drill Plan editor
// (kick-aware) and the shot designer's plan mode. PAINT model: load the
// brush (depth / kick / direction), tap holes or row handles to apply;
// an empty brush erases. Depth 0 / "no hole" marks unused grid positions.
//
// Resize is delegated to the PARENT (onResize): the shot designer must
// remap wires/delays alongside plan overrides, the plan page only its
// overrides — each owns its remap.
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { KICK_DIRECTIONS, deriveDrillAngle, deriveHoleLength, type KickDirection } from '@shotlog/shared';
import type { DrillPlanHoleOverride } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export const GRID_MAX_ROWS = 30;
export const GRID_MAX_COLS = 50;

interface Props {
  rows: number;
  cols: number;
  overrides: Record<number, DrillPlanHoleOverride>;
  defaultDepth?: number;
  /** Depth shown/used when no default is set (e.g. the shot's design depth) */
  fallbackDepth?: number;
  /** Enable the kick brush (standalone plans); off = depth/angle only */
  showKick?: boolean;
  disabled?: boolean;
  onPaint(overrides: Record<number, DrillPlanHoleOverride>): void;
  onDefaultDepth(depth: number | undefined): void;
  onResize(field: 'rows' | 'cols', delta: number): void;
}

const sameOverride = (a: DrillPlanHoleOverride | undefined, b: DrillPlanHoleOverride | null) =>
  !!a &&
  !!b &&
  a.depth === b.depth &&
  a.kick === b.kick &&
  a.kickDir === b.kickDir &&
  Boolean(a.noHole) === Boolean(b.noHole);

export function DrillGridEditor({
  rows,
  cols,
  overrides,
  defaultDepth,
  fallbackDepth,
  showKick,
  disabled,
  onPaint,
  onDefaultDepth,
  onResize,
}: Props) {
  const [paintDepth, setPaintDepth] = useState('');
  const [paintKick, setPaintKick] = useState('');
  const [paintDir, setPaintDir] = useState<KickDirection>('N');
  const [noHole, setNoHole] = useState(false);

  const planDefault = defaultDepth ?? fallbackDepth ?? 0;
  const effDepth = (idx: number) =>
    overrides[idx]?.noHole ? 0 : (overrides[idx]?.depth ?? planDefault);
  const effKick = (idx: number) => (overrides[idx]?.noHole ? undefined : overrides[idx]?.kick);

  /** The exception loaded on the brush, or null (= eraser) */
  const brush = (): DrillPlanHoleOverride | null => {
    if (noHole) return { noHole: true, depth: 0 };
    const d = parseFloat(paintDepth);
    const k = parseFloat(paintKick);
    const o: DrillPlanHoleOverride = {};
    if (!Number.isNaN(d) && d > 0) o.depth = d;
    if (showKick && !Number.isNaN(k) && k > 0) {
      o.kick = k;
      o.kickDir = paintDir;
    }
    return o.depth === undefined && o.kick === undefined ? null : o;
  };
  const b = brush();
  const brushDepth = b?.depth ?? planDefault;
  const brushAngle = b?.kick ? deriveDrillAngle(brushDepth, b.kick) : 0;
  const brushLength = b?.kick ? deriveHoleLength(brushDepth, b.kick) : brushDepth;

  const paintHole = (idx: number) => {
    if (disabled) return;
    const next = { ...overrides };
    if (b === null || sameOverride(overrides[idx], b)) delete next[idx];
    else next[idx] = { ...b };
    onPaint(next);
  };

  const paintRow = (row: number) => {
    if (disabled) return;
    const next = { ...overrides };
    const allSame = Array.from({ length: cols }, (_, c) => row * cols + c).every((i) =>
      b === null ? next[i] === undefined : sameOverride(next[i], b),
    );
    for (let c = 0; c < cols; c++) {
      const i = row * cols + c;
      if (b === null || allSame) delete next[i];
      else next[i] = { ...b };
    }
    onPaint(next);
  };

  // Adaptive cell spacing: big grids shrink toward 30px so a 50-col pattern
  // still fits a couple of screens; small grids keep glove-size 44px taps
  const SPACING = Math.max(30, Math.min(44, Math.floor((window.innerWidth * 0.92) / cols)));
  const R = Math.max(10, Math.round(SPACING * 0.34));
  const PAD = 26;
  const cx = (idx: number) => PAD + (idx % cols) * SPACING + SPACING / 2;
  const cy = (idx: number) => PAD + Math.floor(idx / cols) * SPACING + SPACING / 2;
  const width = PAD * 2 + cols * SPACING;
  const height = PAD * 2 + rows * SPACING;
  const holeCount = Array.from({ length: rows * cols }, (_, i) => i).filter(
    (i) => effDepth(i) > 0,
  ).length;

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="rounded-lg p-2 border bg-orange-50 border-orange-200 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">All holes (ft)</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="h-10 w-20 font-mono"
                placeholder={fallbackDepth ? String(fallbackDepth) : '—'}
                value={defaultDepth ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onDefaultDepth(Number.isNaN(v) ? undefined : v);
                }}
              />
            </span>
            <span className="flex items-center gap-2 pl-3 border-l border-orange-200">
              <Label className="text-xs whitespace-nowrap font-semibold text-safety-orange">Brush</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="h-10 w-20 font-mono"
                placeholder="depth"
                value={paintDepth}
                disabled={noHole}
                onChange={(e) => setPaintDepth(e.target.value)}
              />
              {showKick && (
                <>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-10 w-16 font-mono"
                    placeholder="kick ft"
                    value={paintKick}
                    disabled={noHole}
                    onChange={(e) => setPaintKick(e.target.value)}
                  />
                  <Select
                    value={paintDir}
                    disabled={noHole || paintKick === ''}
                    onChange={(e) => setPaintDir(e.target.value as KickDirection)}
                    options={KICK_DIRECTIONS.map((d) => ({ value: d, label: d }))}
                  />
                </>
              )}
              <Button
                variant={noHole ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNoHole(!noHole)}
                title="Mark grid positions that aren't drilled (irregular patterns)"
              >
                ⌀ No hole
              </Button>
            </span>
            <span className="text-xs text-gray-600 ml-auto font-medium">
              <b>{holeCount}</b> holes to drill
            </span>
          </div>
          {showKick && b?.kick ? (
            <p className="text-xs font-semibold text-navy">
              → drills at {brushAngle.toFixed(1)}° from vertical · {brushLength.toFixed(1)} ft of
              steel to reach {brushDepth} ft down · toe kicks {b.kick} ft {paintDir}
            </p>
          ) : (
            <p className="text-xs text-gray-600">
              {noHole
                ? 'Tap holes (or a row handle) to mark them NOT drilled. Tap again to restore.'
                : b
                  ? 'Tap holes (or a row handle) to paint — tap a painted hole again to clear it.'
                  : 'Type a brush depth (and kick) above, then tap holes to paint exceptions. Empty brush erases.'}
            </p>
          )}
        </div>
      )}

      <div className="overflow-auto border border-gray-200 rounded-lg bg-white" style={{ willChange: 'transform' }}>
        <svg width={width} height={height} className="touch-manipulation">
          {!disabled &&
            Array.from({ length: rows }, (_, r) => (
              <g key={`row-${r}`} onClick={() => paintRow(r)} className="cursor-pointer">
                <rect x={2} y={PAD + r * SPACING + SPACING / 2 - 11} width={20} height={22} rx={5}
                  fill="#fff7ed" stroke="#fdba74" />
                <text x={12} y={PAD + r * SPACING + SPACING / 2 + 4} textAnchor="middle"
                  fontSize={10} fontWeight={700} fill="#c2410c" pointerEvents="none">
                  R{r + 1}
                </text>
              </g>
            ))}
          {Array.from({ length: rows * cols }, (_, idx) => {
            const depth = effDepth(idx);
            const unused = !(depth > 0);
            const kicked = Boolean(effKick(idx));
            const hasOverride = overrides[idx] !== undefined && !unused;
            const matchesBrush = sameOverride(overrides[idx], b);
            return (
              <g key={idx} onClick={() => paintHole(idx)} className={disabled ? undefined : 'cursor-pointer'}>
                <rect
                  x={cx(idx) - SPACING / 2}
                  y={cy(idx) - SPACING / 2}
                  width={SPACING}
                  height={SPACING}
                  fill="transparent"
                />
                <circle
                  cx={cx(idx)}
                  cy={cy(idx)}
                  r={unused ? R - 4 : R}
                  fill={unused ? 'transparent' : hasOverride ? '#dd6b20' : '#eef2f7'}
                  stroke={matchesBrush ? '#1a365d' : hasOverride ? '#dd6b20' : unused ? '#d8dde3' : '#c4ccd6'}
                  strokeWidth={matchesBrush ? 3 : 1.5}
                  strokeDasharray={unused ? '3,3' : undefined}
                />
                {!unused && (
                  <text x={cx(idx)} y={cy(idx) + 3.5} textAnchor="middle"
                    fontSize={depth >= 100 ? Math.max(7, R * 0.55) : Math.max(8, R * 0.7)}
                    fontWeight={700}
                    fill={hasOverride ? 'white' : '#334155'} pointerEvents="none">
                    {+depth.toFixed(1)}
                  </text>
                )}
                {kicked && (
                  <text x={cx(idx) + R - 2} y={cy(idx) - R + 4} textAnchor="middle" fontSize={10}
                    fontWeight={700} fill="#1a365d" pointerEvents="none">
                    ∠
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          Rows:
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={disabled}
            onClick={() => onResize('rows', -1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="font-mono font-semibold w-7 text-center">{rows}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={disabled || rows >= GRID_MAX_ROWS}
            onClick={() => onResize('rows', 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </span>
        <span className="flex items-center gap-1">
          Cols:
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={disabled}
            onClick={() => onResize('cols', -1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="font-mono font-semibold w-7 text-center">{cols}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={disabled || cols >= GRID_MAX_COLS}
            onClick={() => onResize('cols', 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </span>
        <span className="ml-auto text-xs text-gray-400">
          up to {GRID_MAX_ROWS}×{GRID_MAX_COLS}
        </span>
      </div>
    </div>
  );
}

/** Remap sparse override indices when the grid resizes (row-major). Shared
 *  by the plan page (overrides only) and the shot designer (which also
 *  remaps wires/delays with its own logic). */
export function remapOverrides(
  overrides: Record<number, DrillPlanHoleOverride>,
  cols: number,
  nextRows: number,
  nextCols: number,
): Record<number, DrillPlanHoleOverride> {
  const out: Record<number, DrillPlanHoleOverride> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const idx = Number(k);
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    if (r < nextRows && c < nextCols) out[r * nextCols + c] = v;
  }
  return out;
}
