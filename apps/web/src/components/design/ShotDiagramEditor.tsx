import { useRef, useState } from 'react';
import { Cable, Copy, Eraser, Minus, PaintBucket, Plus, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DELAY_COLORS,
  DELAY_SERIES,
  areAdjacent,
  hasWire,
  type ShotDiagram,
  type Wire,
} from '@/lib/shotDiagram';
import { Button } from '@/components/ui/button';

// Undo stack entries mirror the wireframe's behavior (Spec §5.3)
type UndoAction =
  | { type: 'paint'; idx: number; prev: number | undefined }
  | { type: 'wire'; wire: Wire }
  | { type: 'unwire'; wire: Wire }
  | { type: 'clearWires'; prevWires: Wire[] }
  | { type: 'fillAll'; prevDelays: Record<number, number> };

const HOLE_SPACING = 44; // px between hole centers — glove-sized tap targets
const HOLE_RADIUS = 15;
const PAD = 26;

interface Props {
  diagram: ShotDiagram;
  onChange: (diagram: ShotDiagram) => void;
  cloneTargets?: { id: string; label: string }[];
  onClone?: (targetShotId: string) => void;
}

export function ShotDiagramEditor({ diagram, onChange, cloneTargets, onClone }: Props) {
  const [activeDelay, setActiveDelay] = useState<number | 'eraser'>(DELAY_SERIES[0]);
  const [wireMode, setWireMode] = useState(false);
  const [wireSource, setWireSource] = useState<number | null>(null);
  const undoStack = useRef<UndoAction[]>([]);

  const { rows, cols, delays, wires } = diagram;
  const holeCount = rows * cols;

  const commit = (next: ShotDiagram, action: UndoAction) => {
    undoStack.current.push(action);
    onChange(next);
  };

  const tapHole = (idx: number) => {
    if (wireMode) {
      if (wireSource === null) {
        setWireSource(idx);
        return;
      }
      if (wireSource === idx) {
        setWireSource(null);
        return;
      }
      if (!areAdjacent(wireSource, idx, cols)) {
        setWireSource(idx); // treat as picking a new source
        return;
      }
      const wire = { from: wireSource, to: idx };
      if (hasWire(wires, wire.from, wire.to)) {
        // toggle off
        const next = {
          ...diagram,
          wires: wires.filter(
            (w) =>
              !(
                (w.from === wire.from && w.to === wire.to) ||
                (w.from === wire.to && w.to === wire.from)
              ),
          ),
        };
        commit(next, { type: 'unwire', wire });
      } else {
        commit({ ...diagram, wires: [...wires, wire] }, { type: 'wire', wire });
      }
      setWireSource(null);
      return;
    }

    // Paint mode
    const prev = delays[idx];
    const nextDelays = { ...delays };
    if (activeDelay === 'eraser') {
      if (prev === undefined) return;
      delete nextDelays[idx];
    } else {
      if (prev === activeDelay) return;
      nextDelays[idx] = activeDelay;
    }
    commit({ ...diagram, delays: nextDelays }, { type: 'paint', idx, prev });
  };

  const undo = () => {
    const action = undoStack.current.pop();
    if (!action) return;
    switch (action.type) {
      case 'paint': {
        const nextDelays = { ...delays };
        if (action.prev === undefined) delete nextDelays[action.idx];
        else nextDelays[action.idx] = action.prev;
        onChange({ ...diagram, delays: nextDelays });
        break;
      }
      case 'wire':
        onChange({
          ...diagram,
          wires: wires.filter(
            (w) => !(w.from === action.wire.from && w.to === action.wire.to),
          ),
        });
        break;
      case 'unwire':
        onChange({ ...diagram, wires: [...wires, action.wire] });
        break;
      case 'clearWires':
        onChange({ ...diagram, wires: action.prevWires });
        break;
      case 'fillAll':
        onChange({ ...diagram, delays: action.prevDelays });
        break;
    }
  };

  const clearWires = () => {
    if (wires.length === 0) return;
    commit({ ...diagram, wires: [] }, { type: 'clearWires', prevWires: wires });
  };

  /** Paint every unpainted hole with the active delay */
  const fillAll = () => {
    if (activeDelay === 'eraser') return;
    const nextDelays = { ...delays };
    let changed = false;
    for (let i = 0; i < holeCount; i++) {
      if (nextDelays[i] === undefined) {
        nextDelays[i] = activeDelay;
        changed = true;
      }
    }
    if (!changed) return;
    commit({ ...diagram, delays: nextDelays }, { type: 'fillAll', prevDelays: delays });
  };

  const resize = (field: 'rows' | 'cols', delta: number) => {
    const value = Math.max(1, Math.min(20, diagram[field] + delta));
    if (value === diagram[field]) return;
    // Drop delays/wires that fall outside the new grid
    const nextCols = field === 'cols' ? value : cols;
    const nextRows = field === 'rows' ? value : rows;
    const inBounds = (idx: number) =>
      Math.floor(idx / cols) < nextRows && idx % cols < nextCols;
    // Re-index holes when column count changes
    const remap = (idx: number) =>
      Math.floor(idx / cols) * nextCols + (idx % cols);
    const nextDelays: Record<number, number> = {};
    for (const [k, ms] of Object.entries(delays)) {
      const idx = Number(k);
      if (inBounds(idx)) nextDelays[remap(idx)] = ms;
    }
    const nextWires = wires
      .filter((w) => inBounds(w.from) && inBounds(w.to))
      .map((w) => ({ from: remap(w.from), to: remap(w.to) }));
    undoStack.current = []; // resize invalidates the undo history
    onChange({ ...diagram, rows: nextRows, cols: nextCols, delays: nextDelays, wires: nextWires });
  };

  const cx = (idx: number) => PAD + (idx % cols) * HOLE_SPACING + HOLE_SPACING / 2;
  const cy = (idx: number) => PAD + Math.floor(idx / cols) * HOLE_SPACING + HOLE_SPACING / 2;
  const width = PAD * 2 + cols * HOLE_SPACING;
  const height = PAD * 2 + rows * HOLE_SPACING;

  return (
    <div className="space-y-2">
      {/* TIMING toolbar (wireframe style) */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg p-2 border transition-colors',
          wireMode ? 'bg-navy-50 border-navy' : 'bg-white border-gray-200',
        )}
      >
        {!wireMode ? (
          <>
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase pl-1">
              Timing:
            </span>
            {DELAY_SERIES.map((ms) => (
              <button
                key={ms}
                className={cn(
                  'min-h-[44px] min-w-[44px] rounded-full border-2 text-sm font-bold transition-transform',
                  activeDelay === ms ? 'scale-110 ring-2 ring-offset-1 ring-navy text-white' : 'text-white opacity-70',
                )}
                style={{ backgroundColor: DELAY_COLORS[ms], borderColor: DELAY_COLORS[ms] }}
                onClick={() => setActiveDelay(ms)}
                title={`${ms}ms delay`}
              >
                {ms}
              </button>
            ))}
            <button
              className={cn(
                'min-h-[44px] min-w-[44px] rounded-full border-2 border-gray-400 flex items-center justify-center transition-transform',
                activeDelay === 'eraser' ? 'scale-110 ring-2 ring-offset-1 ring-navy bg-gray-200' : 'bg-white',
              )}
              onClick={() => setActiveDelay('eraser')}
              title="Eraser"
            >
              <Eraser className="h-5 w-5 text-gray-600" />
            </button>
          </>
        ) : (
          <span className="text-sm font-medium text-navy px-2">
            {wireSource === null ? 'Tap source hole, then destination' : 'Now tap an adjacent destination hole'}
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant={wireMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setWireMode(!wireMode);
            setWireSource(null);
          }}
          title="Wire / tie-in mode"
        >
          <Cable className="h-4 w-4 mr-1" /> Wire
        </Button>
      </div>

      {/* Grid */}
      <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
        <svg width={width} height={height} className="touch-manipulation">
          <defs>
            <marker id="wire-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a365d" />
            </marker>
          </defs>
          {/* Wires under holes */}
          {wires.map((w, i) => {
            const x1 = cx(w.from);
            const y1 = cy(w.from);
            const x2 = cx(w.to);
            const y2 = cy(w.to);
            // Trim the line so the arrowhead lands at the hole edge
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const trim = HOLE_RADIUS + 3;
            return (
              <line
                key={i}
                x1={x1 + (dx / len) * trim}
                y1={y1 + (dy / len) * trim}
                x2={x2 - (dx / len) * trim}
                y2={y2 - (dy / len) * trim}
                stroke="#1a365d"
                strokeWidth={2.5}
                markerEnd="url(#wire-arrow)"
              />
            );
          })}
          {/* Holes */}
          {Array.from({ length: holeCount }, (_, idx) => {
            const ms = delays[idx];
            const isSource = wireSource === idx;
            const isValidTarget =
              wireMode && wireSource !== null && wireSource !== idx && areAdjacent(wireSource, idx, cols);
            return (
              <g key={idx} onClick={() => tapHole(idx)} className="cursor-pointer">
                {/* Invisible enlarged tap target */}
                <circle cx={cx(idx)} cy={cy(idx)} r={HOLE_SPACING / 2} fill="transparent" />
                <circle
                  cx={cx(idx)}
                  cy={cy(idx)}
                  r={HOLE_RADIUS}
                  fill={ms !== undefined ? DELAY_COLORS[ms] ?? '#1a365d' : 'white'}
                  stroke={isSource ? '#1a365d' : isValidTarget ? '#dd6b20' : ms !== undefined ? DELAY_COLORS[ms] ?? '#1a365d' : '#9ca3af'}
                  strokeWidth={isSource ? 4 : isValidTarget ? 3 : 1.5}
                  strokeDasharray={isValidTarget ? '4,3' : undefined}
                />
                {ms !== undefined && (
                  <text
                    x={cx(idx)}
                    y={cy(idx) + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="white"
                    pointerEvents="none"
                  >
                    {ms}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Action row (wireframe: Fill All / Undo / Clear Wires / Clone) */}
      <div className="grid grid-cols-4 gap-2">
        <Button variant="outline" size="sm" onClick={fillAll} disabled={activeDelay === 'eraser'}>
          <PaintBucket className="h-4 w-4 mr-1" /> Fill All
        </Button>
        <Button variant="outline" size="sm" onClick={undo}>
          <Undo2 className="h-4 w-4 mr-1" /> Undo
        </Button>
        <Button variant="outline" size="sm" onClick={clearWires} disabled={wires.length === 0}>
          Clear Wires
        </Button>
        {onClone && cloneTargets && cloneTargets.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => onClone(cloneTargets[0].id)} title={`Clone to ${cloneTargets[0].label}`}>
            <Copy className="h-4 w-4 mr-1" /> Clone
          </Button>
        ) : (
          <span />
        )}
      </div>

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
        <span className="ml-auto text-xs text-gray-400">
          {Object.keys(delays).length} painted · {wires.length} wires
        </span>
      </div>
    </div>
  );
}
