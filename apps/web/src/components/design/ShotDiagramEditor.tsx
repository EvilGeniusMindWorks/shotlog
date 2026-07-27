import { useRef, useState } from 'react';
import { Cable, Copy, Drill, Minus, Plus, Timer, Trash2, Undo2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DELAY_COLORS,
  DELAY_SERIES,
  areAdjacent,
  computeFiringTimes,
  delayWindowSizes,
  hasWire,
  type DrillPlan,
  type DrillPlanOverride,
  type ShotDiagram,
  type Wire,
} from '@/lib/shotDiagram';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type UndoAction =
  | { type: 'setStart'; prev: ShotDiagram['start']; prevDelays: Record<number, number> }
  | { type: 'wire'; wire: Wire }
  | { type: 'unwire'; wire: Wire }
  | { type: 'clearAll'; prev: ShotDiagram };

const HOLE_SPACING = 44; // px between hole centers — glove-sized tap targets
const HOLE_RADIUS = 15;
const PAD = 26;

const START_COLOR = '#dd6b20';
const LEAD_COLOR = '#38a169';

interface Props {
  diagram: ShotDiagram;
  onChange: (diagram: ShotDiagram) => void;
  cloneTargets?: { id: string; label: string }[];
  onClone?: (targetShotId: string) => void;
  /** Pattern design depth (ft) — the drill plan's inherited default */
  designDepth?: number;
}

/**
 * Sequential-timing shot designer: pick the first hole and its lead delay,
 * then wire hole-to-hole — each wire adds the inter-hole increment. A "Lead"
 * wire carries its own delay instead (branching to another row). Every hole
 * shows its cumulative firing time; edits re-time everything downstream.
 */
export function ShotDiagramEditor({ diagram, onChange, cloneTargets, onClone, designDepth }: Props) {
  const [activeLead, setActiveLead] = useState<number>(DELAY_SERIES[1]); // 17ms
  const [customLead, setCustomLead] = useState('');
  const [leadMode, setLeadMode] = useState(false);
  const [wireSource, setWireSource] = useState<number | null>(null);
  // Drill-plan mode: tap holes to set planned depth/angle exceptions
  const [mode, setMode] = useState<'timing' | 'plan'>('timing');
  const [planHole, setPlanHole] = useState<number | null>(null);
  const undoStack = useRef<UndoAction[]>([]);

  const { rows, cols, delays, wires, start, interHoleMs } = diagram;
  const holeCount = rows * cols;
  const times = computeFiringTimes(diagram);
  const windows = delayWindowSizes(times);
  const maxWindow = Math.max(0, ...windows);
  const lastFire = Math.max(0, ...times.values());
  const legacyPainted = !start && Object.keys(delays).length > 0;

  /** The lead delay currently selected (custom entry wins when present) */
  const leadValue = customLead !== '' ? Math.max(0, parseInt(customLead, 10) || 0) : activeLead;

  // ── Drill plan (per-hole depth/angle) ────────────────────────────────
  const plan: DrillPlan = diagram.plan ?? { overrides: {} };
  const planDefault = plan.defaultDepth ?? designDepth ?? 0;
  const planMode = mode === 'plan';
  const effDepth = (idx: number) => plan.overrides[idx]?.depth ?? planDefault;
  const effAngle = (idx: number) => plan.overrides[idx]?.angle ?? 0;
  const setPlan = (next: DrillPlan) => onChange({ ...diagram, plan: next });

  const setOverride = (idx: number, patch: DrillPlanOverride) => {
    const merged: DrillPlanOverride = { ...plan.overrides[idx], ...patch };
    if (merged.depth === undefined) delete merged.depth;
    if (merged.angle === undefined || merged.angle === 0) delete merged.angle;
    const overrides = { ...plan.overrides };
    if (merged.depth === undefined && merged.angle === undefined) delete overrides[idx];
    else overrides[idx] = merged;
    setPlan({ ...plan, overrides });
  };

  /** Copy the selected hole's exception (or lack of one) across its row */
  const applyToRow = (idx: number) => {
    const row = Math.floor(idx / cols);
    const src = plan.overrides[idx];
    const overrides = { ...plan.overrides };
    for (let c = 0; c < cols; c++) {
      const i = row * cols + c;
      if (src) overrides[i] = { ...src };
      else delete overrides[i];
    }
    setPlan({ ...plan, overrides });
  };

  const commit = (next: ShotDiagram, action: UndoAction) => {
    undoStack.current.push(action);
    onChange(next);
  };

  const tapHole = (idx: number) => {
    if (planMode) {
      setPlanHole(planHole === idx ? null : idx);
      return;
    }
    // No start yet: first tap sets the initiation hole with the chosen lead.
    // Legacy painted delays are cleared — the timing tree replaces them.
    if (!start) {
      commit(
        { ...diagram, start: { hole: idx, leadMs: leadValue }, delays: {} },
        { type: 'setStart', prev: undefined, prevDelays: delays },
      );
      setWireSource(idx);
      return;
    }

    if (wireSource === null) {
      setWireSource(idx);
      return;
    }
    if (wireSource === idx) {
      setWireSource(null);
      return;
    }
    // Plain wires need adjacency; lead wires can jump anywhere on the grid
    if (!leadMode && !areAdjacent(wireSource, idx, cols)) {
      setWireSource(idx); // treat as picking a new source
      return;
    }
    if (hasWire(wires, wireSource, idx)) {
      const next = {
        ...diagram,
        wires: wires.filter(
          (w) =>
            !(
              (w.from === wireSource && w.to === idx) ||
              (w.from === idx && w.to === wireSource)
            ),
        ),
      };
      const removed = wires.find(
        (w) =>
          (w.from === wireSource && w.to === idx) || (w.from === idx && w.to === wireSource),
      )!;
      commit(next, { type: 'unwire', wire: removed });
      setWireSource(null);
      return;
    }
    const wire: Wire = leadMode
      ? { from: wireSource, to: idx, leadMs: leadValue }
      : { from: wireSource, to: idx };
    commit({ ...diagram, wires: [...wires, wire] }, { type: 'wire', wire });
    // Chain: the destination becomes the next source so a row wires tap-tap-tap
    setWireSource(idx);
    if (leadMode) setLeadMode(false);
  };

  const undo = () => {
    const action = undoStack.current.pop();
    if (!action) return;
    switch (action.type) {
      case 'setStart':
        onChange({ ...diagram, start: action.prev, delays: action.prevDelays });
        setWireSource(null);
        break;
      case 'wire':
        onChange({
          ...diagram,
          wires: wires.filter((w) => !(w.from === action.wire.from && w.to === action.wire.to)),
        });
        setWireSource(action.wire.from);
        break;
      case 'unwire':
        onChange({ ...diagram, wires: [...wires, action.wire] });
        break;
      case 'clearAll':
        onChange(action.prev);
        break;
    }
  };

  const clearAll = () => {
    if (!start && wires.length === 0 && Object.keys(delays).length === 0) return;
    commit(
      { ...diagram, start: undefined, wires: [], delays: {} },
      { type: 'clearAll', prev: diagram },
    );
    setWireSource(null);
  };

  const setIncrement = (value: number) => {
    const ms = Math.max(1, Math.min(500, value));
    if (ms === interHoleMs) return;
    undoStack.current = []; // re-times everything; a stale undo stack would confuse
    onChange({ ...diagram, interHoleMs: ms });
  };

  const resize = (field: 'rows' | 'cols', delta: number) => {
    const value = Math.max(1, Math.min(20, diagram[field] + delta));
    if (value === diagram[field]) return;
    const nextCols = field === 'cols' ? value : cols;
    const nextRows = field === 'rows' ? value : rows;
    const inBounds = (idx: number) =>
      Math.floor(idx / cols) < nextRows && idx % cols < nextCols;
    const remap = (idx: number) => Math.floor(idx / cols) * nextCols + (idx % cols);
    const nextDelays: Record<number, number> = {};
    for (const [k, ms] of Object.entries(delays)) {
      const idx = Number(k);
      if (inBounds(idx)) nextDelays[remap(idx)] = ms;
    }
    const nextWires = wires
      .filter((w) => inBounds(w.from) && inBounds(w.to))
      .map((w) => ({ ...w, from: remap(w.from), to: remap(w.to) }));
    const nextStart = start && inBounds(start.hole) ? { ...start, hole: remap(start.hole) } : undefined;
    let nextPlan = diagram.plan;
    if (nextPlan) {
      const overrides: Record<number, DrillPlanOverride> = {};
      for (const [k, v] of Object.entries(nextPlan.overrides)) {
        const idx = Number(k);
        if (inBounds(idx)) overrides[remap(idx)] = v;
      }
      nextPlan = { ...nextPlan, overrides };
    }
    undoStack.current = []; // resize invalidates the undo history
    setWireSource(null);
    setPlanHole(null);
    onChange({
      ...diagram,
      rows: nextRows,
      cols: nextCols,
      delays: nextDelays,
      wires: nextWires,
      start: nextStart,
      plan: nextPlan,
    });
  };

  const cx = (idx: number) => PAD + (idx % cols) * HOLE_SPACING + HOLE_SPACING / 2;
  const cy = (idx: number) => PAD + Math.floor(idx / cols) * HOLE_SPACING + HOLE_SPACING / 2;
  const width = PAD * 2 + cols * HOLE_SPACING;
  const height = PAD * 2 + rows * HOLE_SPACING;

  const pickingLead = !start || leadMode;

  return (
    <div className="space-y-2">
      {/* Mode toggle: timing (delays/wires) vs drill plan (depths/angles) */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'timing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('timing');
            setPlanHole(null);
          }}
        >
          <Timer className="h-4 w-4 mr-1" /> Timing
        </Button>
        <Button
          variant={planMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('plan');
            setWireSource(null);
            setLeadMode(false);
          }}
        >
          <Drill className="h-4 w-4 mr-1" /> Drill plan
        </Button>
      </div>

      {/* Drill-plan toolbar */}
      {planMode && (
        <div className="rounded-lg p-2 border bg-orange-50 border-orange-200 space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Depth for every hole (ft)</Label>
            <Input
              type="number"
              inputMode="decimal"
              className="h-9 w-24 font-mono"
              placeholder={designDepth ? String(designDepth) : '—'}
              value={plan.defaultDepth ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setPlan({ ...plan, defaultDepth: Number.isNaN(v) ? undefined : v });
              }}
            />
            <span className="text-xs text-gray-500">
              {Object.keys(plan.overrides).length} exception
              {Object.keys(plan.overrides).length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-gray-600">
            Tap a hole to set its depth or angle — everything else inherits the default.
            Drillers see this plan and log actuals against it.
          </p>
        </div>
      )}

      {/* Lead / increment toolbar */}
      {!planMode && (
      <div
        className={cn(
          'rounded-lg p-2 border space-y-2 transition-colors',
          pickingLead ? 'bg-navy-50 border-navy' : 'bg-white border-gray-200',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase pl-1">
            {pickingLead ? 'Lead:' : 'Timing:'}
          </span>
          {DELAY_SERIES.map((ms) => (
            <button
              key={ms}
              className={cn(
                'min-h-[44px] min-w-[44px] rounded-full border-2 text-sm font-bold transition-transform text-white',
                activeLead === ms && customLead === ''
                  ? 'scale-110 ring-2 ring-offset-1 ring-navy'
                  : 'opacity-70',
              )}
              style={{ backgroundColor: DELAY_COLORS[ms], borderColor: DELAY_COLORS[ms] }}
              onClick={() => {
                setActiveLead(ms);
                setCustomLead('');
              }}
              title={`${ms}ms lead`}
            >
              {ms}
            </button>
          ))}
          <Input
            type="number"
            inputMode="numeric"
            className="h-11 w-20 font-mono"
            placeholder="custom"
            value={customLead}
            onChange={(e) => setCustomLead(e.target.value)}
            title="Custom lead ms"
          />
          <div className="flex-1" />
          {start && (
            <Button
              variant={leadMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLeadMode(!leadMode)}
              title="Next wire is a lead with the selected delay (branch to another row)"
            >
              <Zap className="h-4 w-4 mr-1" /> Lead Wire
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-navy px-1">
          {!start ? (
            <span className="font-medium">
              Pick the lead timing, then tap the first hole to fire
            </span>
          ) : leadMode ? (
            <span className="font-medium">
              Lead wire ({leadValue}ms): tap the hole it runs from, then any hole it fires
            </span>
          ) : (
            <span className="font-medium">
              {wireSource === null
                ? `Tap a timed hole, then its neighbors — each wire adds ${interHoleMs}ms`
                : 'Tap the next hole in the sequence'}
            </span>
          )}
          <span className="flex items-center gap-1 ml-auto text-gray-600">
            +
            <Input
              type="number"
              inputMode="numeric"
              className="h-8 w-16 font-mono text-center"
              value={interHoleMs}
              onChange={(e) => setIncrement(parseInt(e.target.value, 10) || 1)}
              title="Inter-hole increment (ms)"
            />
            ms/hole
          </span>
        </div>
      </div>
      )}

      {legacyPainted && !planMode && (
        <p className="text-xs text-safety-orange bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          This diagram uses the old painted delays. Tap a hole to start sequential
          timing — the painted colors will be replaced.
        </p>
      )}

      {/* Grid */}
      <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
        <svg width={width} height={height} className="touch-manipulation">
          <defs>
            <marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a365d" />
            </marker>
            <marker id="lead-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={LEAD_COLOR} />
            </marker>
          </defs>
          {/* Wires under holes (timing mode only) */}
          {!planMode && wires.map((w, i) => {
            const x1 = cx(w.from);
            const y1 = cy(w.from);
            const x2 = cx(w.to);
            const y2 = cy(w.to);
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const trim = HOLE_RADIUS + 3;
            const isLead = w.leadMs !== undefined;
            return (
              <g key={i}>
                <line
                  x1={x1 + (dx / len) * trim}
                  y1={y1 + (dy / len) * trim}
                  x2={x2 - (dx / len) * trim}
                  y2={y2 - (dy / len) * trim}
                  stroke={isLead ? LEAD_COLOR : '#1a365d'}
                  strokeWidth={2.5}
                  strokeDasharray={isLead ? '6,4' : undefined}
                  markerEnd={isLead ? 'url(#lead-arrow)' : 'url(#wire-arrow)'}
                />
                {isLead && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill={LEAD_COLOR}
                    pointerEvents="none"
                  >
                    {w.leadMs}ms
                  </text>
                )}
              </g>
            );
          })}
          {/* Holes */}
          {Array.from({ length: holeCount }, (_, idx) => {
            if (planMode) {
              // Drill-plan view: label = planned depth; exceptions orange
              const hasOverride = plan.overrides[idx] !== undefined;
              const selected = planHole === idx;
              const depth = effDepth(idx);
              const angled = effAngle(idx) !== 0;
              return (
                <g key={idx} onClick={() => tapHole(idx)} className="cursor-pointer">
                  <circle cx={cx(idx)} cy={cy(idx)} r={HOLE_SPACING / 2} fill="transparent" />
                  <circle
                    cx={cx(idx)}
                    cy={cy(idx)}
                    r={HOLE_RADIUS}
                    fill={hasOverride ? '#dd6b20' : '#eef2f7'}
                    stroke={selected ? '#1a365d' : hasOverride ? '#dd6b20' : '#c4ccd6'}
                    strokeWidth={selected ? 4 : 1.5}
                  />
                  <text
                    x={cx(idx)}
                    y={cy(idx) + 4}
                    textAnchor="middle"
                    fontSize={depth >= 100 ? 9 : 11}
                    fontWeight={700}
                    fill={hasOverride ? 'white' : '#334155'}
                    pointerEvents="none"
                  >
                    {depth ? +depth.toFixed(1) : '—'}
                  </text>
                  {angled && (
                    <text
                      x={cx(idx) + HOLE_RADIUS - 2}
                      y={cy(idx) - HOLE_RADIUS + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="#1a365d"
                      pointerEvents="none"
                    >
                      ∠
                    </text>
                  )}
                </g>
              );
            }
            const t = times.get(idx);
            const legacyMs = legacyPainted ? delays[idx] : undefined;
            const isStart = start?.hole === idx;
            const isSource = wireSource === idx;
            const isValidTarget =
              start !== undefined &&
              wireSource !== null &&
              wireSource !== idx &&
              (leadMode || areAdjacent(wireSource, idx, cols));
            const fill = isStart
              ? START_COLOR
              : t !== undefined
                ? '#1a365d'
                : legacyMs !== undefined
                  ? DELAY_COLORS[legacyMs] ?? '#1a365d'
                  : 'white';
            const label = t ?? legacyMs;
            return (
              <g key={idx} onClick={() => tapHole(idx)} className="cursor-pointer">
                <circle cx={cx(idx)} cy={cy(idx)} r={HOLE_SPACING / 2} fill="transparent" />
                <circle
                  cx={cx(idx)}
                  cy={cy(idx)}
                  r={HOLE_RADIUS}
                  fill={fill}
                  stroke={
                    isSource
                      ? START_COLOR
                      : isValidTarget
                        ? '#dd6b20'
                        : label !== undefined
                          ? fill
                          : '#9ca3af'
                  }
                  strokeWidth={isSource ? 4 : isValidTarget ? 3 : 1.5}
                  strokeDasharray={isValidTarget && !isSource ? '4,3' : undefined}
                />
                {label !== undefined && (
                  <text
                    x={cx(idx)}
                    y={cy(idx) + 4}
                    textAnchor="middle"
                    fontSize={label >= 1000 ? 9 : 11}
                    fontWeight={700}
                    fill="white"
                    pointerEvents="none"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected-hole plan editor */}
      {planMode && planHole !== null && (
        <div className="rounded-lg border-2 border-navy bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">
              Hole {planHole + 1}
              <span className="font-normal text-gray-400">
                {' '}
                — row {Math.floor(planHole / cols) + 1}
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setPlanHole(null)}>
              Done
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="w-28">
              <Label className="text-xs">Depth (ft)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder={planDefault ? String(planDefault) : '—'}
                value={plan.overrides[planHole]?.depth ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setOverride(planHole, { depth: Number.isNaN(v) ? undefined : v });
                }}
              />
            </div>
            <div className="w-28">
              <Label className="text-xs">Angle (°)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={plan.overrides[planHole]?.angle ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setOverride(planHole, { angle: Number.isNaN(v) ? undefined : v });
                }}
              />
            </div>
            <div className="flex-1 flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={() => applyToRow(planHole)}>
                Apply to row
              </Button>
              {plan.overrides[planHole] && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOverride(planHole, { depth: undefined, angle: undefined })}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timing summary */}
      {!planMode && times.size > 0 && (
        <p className="text-xs text-gray-500 px-1">
          {times.size} hole{times.size === 1 ? '' : 's'} timed · first {start!.leadMs}ms · last{' '}
          {lastFire}ms · max <b>{maxWindow}</b> hole{maxWindow === 1 ? '' : 's'} in any 8ms window
        </p>
      )}

      {/* Action row (timing tools) */}
      {!planMode && (
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={undo}>
          <Undo2 className="h-4 w-4 mr-1" /> Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={!start && wires.length === 0 && Object.keys(delays).length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Clear
        </Button>
        {onClone && cloneTargets && cloneTargets.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => onClone(cloneTargets[0].id)} title={`Clone to ${cloneTargets[0].label}`}>
            <Copy className="h-4 w-4 mr-1" /> Clone
          </Button>
        ) : (
          <span />
        )}
      </div>
      )}

      {/* Grid size controls */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          Rows:
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => resize('rows', -1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="font-mono font-semibold w-6 text-center">{rows}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => resize('rows', 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </span>
        <span className="flex items-center gap-1">
          Cols:
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => resize('cols', -1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="font-mono font-semibold w-6 text-center">{cols}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => resize('cols', 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </span>
        <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
          <Cable className="h-3.5 w-3.5" />
          {wires.length} wires
        </span>
      </div>
    </div>
  );
}
