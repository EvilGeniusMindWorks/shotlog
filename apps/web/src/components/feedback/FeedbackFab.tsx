// One small speech bubble in the bottom corner, on every screen, above every
// sheet (Round S18). The ? menu lives in the header, which a sheet covers, and
// the print and filing screens have no header at all; the composer could
// always open from anywhere — this is the door. Kept out of the screenshot
// (html2canvas honours data-html2canvas-ignore) and out of the print.
import { useEffect, useReducer } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { FEEDBACK_FAB_EVENT, feedbackFabOn, isBareRoute } from '@/lib/feedbackFab';
import { cn } from '@/lib/utils';
import { openFeedbackComposer } from './FeedbackComposer';

export function FeedbackFab() {
  const { pathname } = useLocation();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(FEEDBACK_FAB_EVENT, bump);
    return () => window.removeEventListener(FEEDBACK_FAB_EVENT, bump);
  }, []);
  if (!feedbackFabOn(getSessionUser()?.environment)) return null;
  const bare = isBareRoute(pathname);
  // The home carries the orange + button in the same corner (harness53 found
  // the bubble sitting on it): there the bubble stacks above it
  const overFab = pathname === '/';
  return (
    <button
      type="button"
      aria-label="Send feedback"
      title="Send feedback"
      data-feedback-fab
      data-html2canvas-ignore
      className={cn(
        'fixed z-[90] h-11 w-11 rounded-full bg-navy text-white shadow-lg border-2 border-white flex items-center justify-center print:hidden right-[calc(0.875rem+var(--sar))]',
        bare ? 'bottom-[calc(1.25rem+var(--sab))]' : overFab ? 'bottom-[calc(10.25rem+var(--sab))] sm:bottom-[6.25rem]' : 'bottom-[calc(5.5rem+var(--sab))] lg:bottom-6',
      )}
      onClick={() => openFeedbackComposer()}
    >
      <MessageSquarePlus className="h-5 w-5" />
    </button>
  );
}
