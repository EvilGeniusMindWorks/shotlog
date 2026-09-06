// "About this screen" bottom sheet (Round S2): 3–5 bullets for the current
// route from the coach map. Opened from the ? menu on every screen.
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openFeedbackComposer } from '@/components/feedback/FeedbackComposer';
import type { CoachEntry } from './coach';

export function CoachSheet({ entry, onClose }: { entry: CoachEntry; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[95] bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        data-coach-sheet
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">About this screen</p>
            <h2 className="font-bold text-lg">{entry.title}</h2>
          </div>
          <button className="p-1 text-gray-400" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-gray-700">{entry.what}</p>
        <ol className="space-y-2">
          {entry.steps.map((s, i) => (
            <li key={s} className="flex gap-2 text-sm text-gray-700">
              <span className="text-safety-orange font-bold shrink-0">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {entry.ask && <p className="text-sm text-gray-500 border-l-2 border-gray-200 pl-3">{entry.ask}</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            Got it
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              openFeedbackComposer({ kind: 'question' });
            }}
          >
            Still stuck — ask
          </Button>
        </div>
      </div>
    </div>
  );
}
