// The "?" menu (Round S3): Walkthrough · Send feedback. Sidebar row on
// desktop, icon button in the phone header. S2 adds the per-screen coach
// sheet to this same menu.
import { useEffect, useRef, useState } from 'react';
import { CircleHelp, MessageSquarePlus, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import { openFeedbackComposer } from './FeedbackComposer';

export function HelpMenu({
  variant,
  onWalkthrough,
}: {
  variant: 'sidebar' | 'header';
  onWalkthrough: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const items = (
    <div
      role="menu"
      data-help-menu
      className={cn(
        'absolute z-[60] min-w-[200px] rounded-xl border border-gray-200 bg-white text-gray-800 shadow-lg py-1',
        variant === 'sidebar' ? 'left-2 right-2 bottom-full mb-1' : 'right-0 top-full mt-1',
      )}
    >
      <button
        role="menuitem"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 text-left"
        onClick={() => {
          setOpen(false);
          onWalkthrough();
        }}
      >
        <Route className="h-4 w-4 text-gray-500" /> Walkthrough
      </button>
      <button
        role="menuitem"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 text-left"
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

  if (variant === 'sidebar')
    return (
      <div ref={ref} className="relative">
        <button
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            open ? 'bg-white/10 text-white' : 'text-navy-200 hover:text-white hover:bg-white/5',
          )}
          aria-haspopup="menu"
          aria-expanded={open}
          data-help-button
          onClick={() => setOpen((o) => !o)}
        >
          <CircleHelp className="h-5 w-5" />
          Help &amp; feedback
        </button>
        {open && items}
      </div>
    );

  return (
    <div ref={ref} className="relative">
      <button
        className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200"
        title="Help & feedback"
        aria-haspopup="menu"
        aria-expanded={open}
        data-help-button
        onClick={() => setOpen((o) => !o)}
      >
        <CircleHelp className="h-5 w-5" />
      </button>
      {open && items}
    </div>
  );
}
