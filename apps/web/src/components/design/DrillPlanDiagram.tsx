// Read-only pattern map of the blaster's drill plan — the driller's visual
// reference while logging holes. Shows hole number + planned depth per hole,
// greys out holes already drilled (in ANY of the shot's logs), and lets the
// driller tap an undrilled hole to target it in the quick-entry form.
import { materializeDrillPlan, type ShotDiagram } from '@/lib/shotDiagram';

const SPACING = 52; // wider than the editor: two lines of text per hole
const RADIUS = 17;
const PAD = 14;

interface Props {
  diagram: ShotDiagram;
  fallbackDepth: number;
  /** Hole numbers already drilled across the shot's logs */
  drilled?: Set<string>;
  /** Hole number currently targeted in the entry form */
  selected?: string;
  /** Tap an undrilled hole to target it (omit for a pure reference view) */
  onTapHole?: (n: number) => void;
}

export function DrillPlanDiagram({ diagram, fallbackDepth, drilled, selected, onTapHole }: Props) {
  const plan = materializeDrillPlan(diagram, fallbackDepth);
  if (plan.length === 0) return null;
  const { rows, cols } = diagram;
  const cx = (idx: number) => PAD + (idx % cols) * SPACING + SPACING / 2;
  const cy = (idx: number) => PAD + Math.floor(idx / cols) * SPACING + SPACING / 2;
  const width = PAD * 2 + cols * SPACING;
  const height = PAD * 2 + rows * SPACING;

  return (
    <div>
      <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
        <svg width={width} height={height} className="touch-manipulation">
          {plan.map((hole, idx) => {
            const n = String(hole.n);
            const isDrilled = drilled?.has(n) ?? false;
            const isSelected = selected === n;
            const isException = diagram.plan?.overrides[idx] !== undefined;
            const tappable = !isDrilled && onTapHole !== undefined;
            return (
              <g
                key={idx}
                onClick={tappable ? () => onTapHole(hole.n) : undefined}
                className={tappable ? 'cursor-pointer' : undefined}
              >
                <circle cx={cx(idx)} cy={cy(idx)} r={SPACING / 2} fill="transparent" />
                <circle
                  cx={cx(idx)}
                  cy={cy(idx)}
                  r={RADIUS}
                  fill={isDrilled ? '#e5e7eb' : isException ? '#fff1e4' : 'white'}
                  stroke={isSelected ? '#1a365d' : isDrilled ? '#d1d5db' : isException ? '#dd6b20' : '#9ca3af'}
                  strokeWidth={isSelected ? 3.5 : 1.5}
                />
                <text
                  x={cx(idx)}
                  y={cy(idx) - 1}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={isDrilled ? '#9ca3af' : '#1a365d'}
                  pointerEvents="none"
                >
                  {hole.n}
                </text>
                <text
                  x={cx(idx)}
                  y={cy(idx) + 11}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isDrilled ? '#b6bcc4' : isException ? '#c2410c' : '#6b7280'}
                  pointerEvents="none"
                >
                  {+hole.depth.toFixed(1)}
                  {hole.angle ? `∠${hole.angle}` : ''}
                </text>
                {isDrilled && (
                  <text
                    x={cx(idx) + RADIUS - 3}
                    y={cy(idx) - RADIUS + 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#16a34a"
                    pointerEvents="none"
                  >
                    ✓
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-gray-400 mt-1 px-1">
        number · planned ft{onTapHole ? ' — tap an undrilled hole to log it' : ''} · ✓ drilled ·
        orange = exception to the pattern depth
      </p>
    </div>
  );
}
