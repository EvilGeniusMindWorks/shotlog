// The "?" menu: About this screen · Walkthrough · Send feedback. Sidebar row
// on desktop, icon button in the phone header. "About this screen" appears
// whenever the coach map knows the current route (Round S2).
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, CircleHelp, Footprints, Info, MessageSquarePlus, Route } from 'lucide-react';
import { helpForRoute, helpPath } from '@/help';
import { cn } from '@/lib/utils';
import { openFeedbackComposer } from './FeedbackComposer';
import { coachFor } from '@/components/guidance/coach';
import { CoachSheet } from '@/components/guidance/CoachSheet';
import { SCREEN_TOUR_TITLE, screenTourFor } from '@/components/guidance/tourScripts';
import { startScreenTour, tourBucket } from '@/components/layout/Tour';

export function HelpMenu({
  variant,
  onWalkthrough,
}: {
  variant: 'sidebar' | 'header';
  onWalkthrough: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coaching, setCoaching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const coach = coachFor(location.pathname, location.search, tourBucket());
  const screenTour = screenTourFor(location.pathname, location.search, tourBucket());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 text-left';
  const items = (
    <div
      role="menu"
      data-help-menu
      className={cn(
        'absolute z-[60] min-w-[220px] rounded-xl border border-gray-200 bg-white text-gray-800 shadow-lg py-1',
        variant === 'sidebar' ? 'left-2 right-2 bottom-full mb-1' : 'right-0 top-full mt-1',
      )}
    >
      {coach && (
        <button
          role="menuitem"
          className={item}
          data-help-coach
          onClick={() => {
            setOpen(false);
            setCoaching(true);
          }}
        >
          <Info className="h-4 w-4 text-gray-500" /> About this screen
        </button>
      )}
      {screenTour && (
        <button
          role="menuitem"
          className={item}
          data-help-screen-tour={screenTour}
          onClick={() => {
            setOpen(false);
            startScreenTour(screenTour);
          }}
        >
          <Footprints className="h-4 w-4 text-gray-500" /> Show me {SCREEN_TOUR_TITLE[screenTour]}
        </button>
      )}
      <button
        role="menuitem"
        className={item}
        data-help-guide
        onClick={() => {
          setOpen(false);
          const p = helpForRoute(location.pathname, location.search);
          navigate(p ? helpPath(p) : '/help');
        }}
      >
        <BookOpen className="h-4 w-4 text-gray-500" /> Help guide
      </button>
      <button
        role="menuitem"
        className={item}
        data-help-walkthrough
        onClick={() => {
          setOpen(false);
          onWalkthrough();
        }}
      >
        <Route className="h-4 w-4 text-gray-500" /> Walkthrough
      </button>
      <button
        role="menuitem"
        className={item}
        data-help-feedback
        onClick={() => {
          setOpen(false);
          openFeedbackComposer();
        }}
      >
        <MessageSquarePlus className="h-4 w-4 text-gray-500" /> Send feedback
      </button>
    </div>
  );

  const guidePage = helpForRoute(location.pathname, location.search);
  const sheet = coaching && coach ? <CoachSheet entry={coach} guide={guidePage ? { title: guidePage.title, to: helpPath(guidePage) } : null} onClose={() => setCoaching(false)} /> : null;

  // Wide screens (Matthew, 2026-09-08: "can it open like the other items?"):
  // the sidebar row navigates to the guide, opened at this screen's page with
  // the About-this-screen notes, Walkthrough and Send feedback on that page.
  // The phone header keeps the compact ? popover.
  if (variant === 'sidebar') {
    const onGuide = location.pathname.startsWith('/help');
    return (
      <button
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          onGuide ? 'bg-white/10 text-white' : 'text-navy-200 hover:text-white hover:bg-white/5',
        )}
        data-help-button
        aria-current={onGuide ? 'page' : undefined}
        onClick={() => {
          const p = helpForRoute(location.pathname, location.search);
          const from = encodeURIComponent(location.pathname + location.search);
          navigate(`${p ? helpPath(p) : '/help'}?from=${from}`);
        }}
      >
        <CircleHelp className="h-5 w-5" />
        Help &amp; feedback
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-100"
        title="Help & feedback"
        aria-haspopup="menu"
        aria-expanded={open}
        data-help-button
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp className="h-6 w-6" />
      </button>
      {open && items}
      {sheet}
    </div>
  );
}
