// The guided tour engine (Round S2; S7c adds SCREEN tours). Two kinds run
// through one component:
//  · the role WALKTHROUGH — a trip through the 3–5 screens a role lives in,
//    auto-run once per account on the home, re-runnable from Help;
//  · a SCREEN tour — a few stops on the screen where the work happens,
//    auto-run once per account the first time that screen opens (Matthew:
//    "everyone, once"), re-runnable from Help › "Show me …".
// Never two tours at once, and never one right after another: a tour that
// just ended puts the auto-run on a short cooldown, so the day-hub tour is
// not chased by the shot tour in the same breath.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRealSessionUser, markScreenTourDone, markTourDone } from '@/lib/session';
import { myHomeDashboard } from '@/lib/perms';
import {
  SCREEN_TOURS,
  tourScriptFor,
  type ScreenTourKey,
  type TourBucket,
  type TourStep,
} from '@/components/guidance/tourScripts';

export const START_TOUR_EVENT = 'shotlog-start-tour';
export const SCREEN_TOUR_EVENT = 'shotlog-start-screen-tour';
/** Dev/harness suppression of every auto-run (legacy key, still honoured) */
const LEGACY_DONE_KEY = 'shotlog-tour-done';
/** A tour ended this recently → no auto-run of another (one sitting) */
const LAST_ENDED_KEY = 'shotlog-tour-last-ended';
const COOLDOWN_MS = 60_000;

/** Ask the shell to start the walkthrough (no-op when no shell is mounted) */
export function startTour(): void {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

/** Ask the shell to start a screen tour */
export function startScreenTour(key: ScreenTourKey): void {
  window.dispatchEvent(new CustomEvent<ScreenTourKey>(SCREEN_TOUR_EVENT, { detail: key }));
}

export function tourBucket(): TourBucket {
  return getRealSessionUser()?.role === 'admin' ? 'admin' : myHomeDashboard();
}

function legacySuppressed(): boolean {
  try {
    return localStorage.getItem(LEGACY_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function endedRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(LAST_ENDED_KEY) ?? 0) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function noteEnded(): void {
  try {
    sessionStorage.setItem(LAST_ENDED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Should the walkthrough auto-run for this account on this device? */
export function shouldAutoRunTour(): boolean {
  const user = getRealSessionUser();
  if (!user || user.tourDoneAt) return false;
  return !legacySuppressed();
}

/** Should this screen's tour auto-run now? Once per account, not while
 *  another tour just ended, never under the harness suppression key. */
export function shouldAutoRunScreenTour(key: ScreenTourKey): boolean {
  const user = getRealSessionUser();
  if (!user) return false;
  if ((user.toursDone ?? []).includes(key)) return false;
  if (legacySuppressed() || endedRecently()) return false;
  return true;
}

function firstVisible(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** A step's route: absolute, or "?view=…" relative to the current screen */
function stepTarget(route: string): string {
  return route.startsWith('?') ? `${window.location.pathname}${route}` : route;
}

export function Tour({ screenKey, onEnd }: { screenKey?: ScreenTourKey; onEnd: () => void }) {
  const navigate = useNavigate();
  const steps = useMemo(
    () => (screenKey ? SCREEN_TOURS[screenKey] : tourScriptFor(tourBucket())),
    [screenKey],
  );
  const [index, setIndex] = useState(0);
  const step: TourStep = steps[index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Navigate for the step, then wait for its anchor to exist and be laid out
  useEffect(() => {
    if (step.route) {
      const target = stepTarget(step.route);
      if (`${window.location.pathname}${window.location.search}` !== target) navigate(target);
    }
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
    if (screenKey) void markScreenTourDone(screenKey);
    else void markTourDone();
    noteEnded();
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
    <div
      className="fixed inset-0 z-[100]"
      data-tour-overlay
      data-tour-step={index}
      data-tour-kind={screenKey ?? 'walkthrough'}
    >
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
