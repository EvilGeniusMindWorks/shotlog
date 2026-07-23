import { useEffect, useMemo, useState } from 'react';

interface TourStep {
  selector: string | null; // null = centered welcome card
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    selector: null,
    title: 'Welcome to ShotLog',
    body: 'Your blasting log and daily report, digitized. This quick tour shows the essentials.',
  },
  {
    selector: '[data-tour="kpis"]',
    title: 'Your Numbers',
    body: 'Active jobs, shots this month, year-to-date pounds, and compliance rate — always current.',
  },
  {
    selector: '[data-tour="fab"]',
    title: 'Start a Blast Day',
    body: 'One tap starts a new day — and you can copy everything forward from a previous day: blast info, drill params, explosives, crew.',
  },
  {
    selector: '[data-tour="nav"]',
    title: 'Everything Else',
    body: 'Jobs hold your long-running sites and K factors. Reference has formulas and compliance limits. Settings holds your licenses, crew, and equipment.',
  },
  {
    selector: null,
    title: 'Inside a Blast Day',
    body: 'Each shot has a Designer (hole grid, delay timing, wiring, site map) and Seismo readings. The printer icon outputs the paper forms. Everything works offline.',
  },
];

export function Tour({ onEnd }: { onEnd: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step.selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const t = window.setTimeout(update, 350); // after smooth scroll
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', update);
    };
  }, [step.selector]);

  const tooltipStyle = useMemo(() => {
    if (!rect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as const;
    }
    const below = rect.bottom + 180 < window.innerHeight;
    return {
      top: below ? rect.bottom + 12 : undefined,
      bottom: below ? undefined : window.innerHeight - rect.top + 12,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 320)),
    } as const;
  }, [rect]);

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Dim backdrop with a spotlight cutout */}
      <div
        className="absolute inset-0 bg-black/60 transition-all"
        style={
          rect
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.top - 6}px, ${rect.left - 6}px ${rect.top - 6}px, ${rect.left - 6}px ${rect.bottom + 6}px, ${rect.right + 6}px ${rect.bottom + 6}px, ${rect.right + 6}px ${rect.top - 6}px, 0 ${rect.top - 6}px)`,
              }
            : undefined
        }
        onClick={onEnd}
      />
      {rect && (
        <div
          className="absolute border-2 border-safety-orange rounded-lg pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      {/* Tooltip */}
      <div
        className="absolute bg-white rounded-xl shadow-xl p-4 w-[300px]"
        style={tooltipStyle}
      >
        <p className="font-bold text-gray-900 mb-1">{step.title}</p>
        <p className="text-sm text-gray-600 mb-3">{step.body}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {index + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            <button className="text-sm text-gray-500 min-h-[36px] px-2" onClick={onEnd}>
              End
            </button>
            {index > 0 && (
              <button
                className="text-sm font-medium text-navy min-h-[36px] px-2"
                onClick={() => setIndex(index - 1)}
              >
                Prev
              </button>
            )}
            {index < STEPS.length - 1 ? (
              <button
                className="text-sm font-semibold text-white bg-navy rounded-md min-h-[36px] px-4"
                onClick={() => setIndex(index + 1)}
              >
                Next
              </button>
            ) : (
              <button
                className="text-sm font-semibold text-white bg-safety-orange rounded-md min-h-[36px] px-4"
                onClick={onEnd}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
