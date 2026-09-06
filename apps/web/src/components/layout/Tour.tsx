// Role-aware walkthrough (Round S2 rebuild). Navigates between the real
// screens of the role's script, spotlights the first VISIBLE match of each
// step's selector (one anchor name serves both layouts), and records
// completion on the ACCOUNT so no other device auto-runs it again.
//
// Start it from anywhere with startTour(); AppShell hosts it (needs the
// router) and auto-runs it once for accounts with no tourDoneAt.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRealSessionUser, markTourDone } from '@/lib/session';
import { myHomeDashboard } from '@/lib/perms';
import { tourScriptFor, type TourBucket, type TourStep } from '@/components/guidance/tourScripts';

export const START_TOUR_EVENT = 'shotlog-start-tour';
/** Dev/harness suppression of the auto-run (legacy key, still honoured) */
const LEGACY_DONE_KEY = 'shotlog-tour-done';

/** Ask the shell to start the walkthrough (no-op when no shell is mounted) */
export function startTour(): void {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

export function tourBucket(): TourBucket {
  return getRealSessionUser()?.role === 'admin' ? 'admin' : myHomeDashboard();
}

/** Should the walkthrough auto-run for this account on this device? */
export function shouldAutoRunTour(): boolean {
  const user = getRealSessionUser();
  if (!user || user.tourDoneAt) return false;
  try {
    if (localStorage.getItem(LEGACY_DONE_KEY) === '1') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function firstVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function Tour({ onEnd }: { onEnd: () => void }) {
  const navigate = useNavigate();
  const steps = useMemo(() => tourScriptFor(tourBucket()), []);
  const [index, setIndex] = useState(0);
  const step: TourStep = steps[index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Navigate for the step, then wait for its anchor to exist and be laid out
  useEffect(() => {
    if (step.route && window.location.pathname !== step.route) navigate(step.route);
    if (!step.selector) {
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const measure = () => {
      if (cancelled) return;
      const el = firstVisible(step.selector!);
      if (!el) {
        if (tries++ < 20) timer = window.setTimeout(measure, 150);
        else setRect(null); // anchor missing on this layout → centered card
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setRect(el.getBoundingClientRect());
      timer = window.setTimeout(() => !cancelled && setRect(el.getBoundingClientRect()), 400);
    };
    measure();
    const onResize = () => {
      const el = firstVisible(step.selector!);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [step, navigate]);

  const finish = () => {
    void markTourDone();
    onEnd();
  };

  const tooltipStyle = useMemo(() => {
    if (!rect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as const;
    }
    // Below the target if it fits, else above; a target taller than the
    // viewport (a whole home) fits neither — pin the card to the bottom
    // edge so it is always on screen and tappable
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 320));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow >= 220) return { top: rect.bottom + 12, left } as const;
    if (spaceAbove >= 220) return { bottom: window.innerHeight - rect.top + 12, left } as const;
    return { bottom: 16, left } as const;
  }, [rect]);

  return (
    <div className="fixed inset-0 z-[100]" data-tour-overlay data-tour-step={index}>
      <div
        className="absolute inset-0 bg-black/60 transition-all"
        style={
          rect
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.top - 6}px, ${rect.left - 6}px ${rect.top - 6}px, ${rect.left - 6}px ${rect.bottom + 6}px, ${rect.right + 6}px ${rect.bottom + 6}px, ${rect.right + 6}px ${rect.top - 6}px, 0 ${rect.top - 6}px)`,
              }
            : undefined
        }
        onClick={finish}
      />
      {rect && (
        <div
          className="absolute border-2 border-safety-orange rounded-lg pointer-events-none"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="absolute bg-white rounded-xl shadow-xl p-4 w-[300px]" style={tooltipStyle}>
        <p className="font-bold text-gray-900 mb-1">{step.title}</p>
        <p className="text-sm text-gray-600 mb-3">{step.body}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {index + 1} / {steps.length}
          </span>
          <div className="flex gap-2">
            {index < steps.length - 1 && (
              <button className="text-sm text-gray-500 min-h-[36px] px-2" onClick={finish} data-tour-skip>
                Skip
              </button>
            )}
            {index > 0 && (
              <button className="text-sm font-medium text-navy min-h-[36px] px-2" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            {index < steps.length - 1 ? (
              <button
                className="text-sm font-semibold text-white bg-navy rounded-md min-h-[36px] px-4"
                onClick={() => setIndex(index + 1)}
                data-tour-next
              >
                Next
              </button>
            ) : (
              <button
                className="text-sm font-semibold text-white bg-safety-orange rounded-md min-h-[36px] px-4"
                onClick={finish}
                data-tour-done
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
