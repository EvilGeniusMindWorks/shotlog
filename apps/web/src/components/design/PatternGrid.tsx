// The pattern, in the pattern's own shape (Matthew, S8a follow-up: "a 7 × 11
// plan… the driller sees a 10-column grid — it seems odd that the driller
// doesn't fill out the drill log using the same pattern"). One component
// for every place holes are shown by position — the driller's log, the
// blaster's review — so they all match the plan the blaster laid. Cells are
// styled by the caller; unused grid positions keep the shape as faint
// dashes; off-plan holes (numbers the plan never had) hang below.
import type { CSSProperties, ReactNode } from 'react';
import { materializeDrillPlan, type PlanHole, type ShotDiagram } from '@/lib/shotDiagram';

export interface PatternCell {
  className?: string;
  style?: CSSProperties;
  /** Text under the number (planned depth, driller initials…) */
  sub?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export interface PatternExtra {
  label: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  onTap?: () => void;
}

interface Props {
  diagram: ShotDiagram;
  fallbackDepth: number;
  cell: (hole: PlanHole) => PatternCell;
  onTap?: (hole: PlanHole) => void;
  /** Row handles on the left: one tap acts on the whole row */
  onTapRow?: (row: number, holes: PlanHole[]) => void;
  rowLabel?: (row: number, holes: PlanHole[]) => ReactNode;
  /** Holes the plan never had (typed numbers) — shown below the pattern */
  extras?: PatternExtra[];
  /** data-* hook for tours and harnesses */
  testId?: string;
}

export function PatternGrid({ diagram, fallbackDepth, cell, onTap, onTapRow, rowLabel, extras, testId }: Props) {
  const plan = materializeDrillPlan(diagram, fallbackDepth);
  if (plan.length === 0) return null;
  const byIdx = new Map(plan.map((h) => [h.idx, h]));
  const { rows, cols } = diagram;
  const rowHoles = (r: number) => plan.filter((h) => Math.floor(h.idx / cols) === r);
  return (
    <div className="overflow-x-auto" data-pattern-grid={testId ?? ''} data-rows={rows} data-cols={cols}>
      <div
        className="grid gap-1.5 items-center"
        style={{ gridTemplateColumns: `${onTapRow ? '2rem ' : ''}repeat(${cols}, minmax(28px, 1fr))`, minWidth: cols * 32 + (onTapRow ? 40 : 0) }}
      >
        {Array.from({ length: rows }, (_, r) => {
          const holes = rowHoles(r);
          return [
            onTapRow ? (
              <button
                key={`r${r}`}
                type="button"
                data-pattern-row={r}
                title={`Row ${r + 1} — tap to select the whole row`}
                className="h-7 rounded-md border border-orange-200 bg-orange-50 text-[10px] font-bold text-orange-700"
                onClick={() => onTapRow(r, holes)}
                disabled={holes.length === 0}
              >
                {rowLabel ? rowLabel(r, holes) : `R${r + 1}`}
              </button>
            ) : null,
            ...Array.from({ length: cols }, (_, c) => {
              const idx = r * cols + c;
              const hole = byIdx.get(idx);
              if (!hole) {
                return <span key={idx} className="aspect-square rounded-full border border-dashed border-gray-200" aria-hidden />;
              }
              const s = cell(hole);
              return (
                <button
                  key={idx}
                  type="button"
                  data-pattern-hole={hole.n}
                  title={s.title ?? `H-${hole.n} · plan ${+(hole.holeLength || hole.depth).toFixed(1)} ft`}
                  disabled={s.disabled || !onTap}
                  className={`aspect-square rounded-full min-h-[28px] text-[10px] font-mono font-bold leading-none flex flex-col items-center justify-center ${s.className ?? ''}`}
                  style={s.style}
                  onClick={onTap ? () => onTap(hole) : undefined}
                >
                  <span>{hole.n}</span>
                  {s.sub !== undefined && <span className="text-[8px] font-normal opacity-80">{s.sub}</span>}
                </button>
              );
            }),
          ];
        })}
      </div>
      {extras && extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2" data-pattern-extras>
          <span className="text-[11px] text-gray-400 mr-1">off-plan:</span>
          {extras.map((x) => (
            <button
              key={x.label}
              type="button"
              title={x.title}
              className={`h-7 min-w-[28px] px-2 rounded-full text-[10px] font-mono font-bold ${x.className ?? ''}`}
              style={x.style}
              onClick={x.onTap}
              disabled={!x.onTap}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
