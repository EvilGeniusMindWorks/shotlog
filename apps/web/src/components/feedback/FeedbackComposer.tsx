// "Send feedback" sheet (Round S3). Opened from the ? menu, Settings, the
// error toast, and the crash screen. Module-level opener + one host (the
// undo-toast pattern) so any code path can open it without prop drilling —
// including code that runs outside the router. The screenshot is captured
// BEFORE the sheet renders, so the sheet is never in its own picture.
import { useEffect, useState } from 'react';
import { Camera, Loader2, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/undo-toast';
import { getRealSessionUser } from '@/lib/session';
import {
  FEEDBACK_KINDS,
  captureScreenshot,
  submitFeedback,
  type FeedbackKind,
} from '@/lib/feedback';
import { cn } from '@/lib/utils';

export interface ComposerOptions {
  kind?: FeedbackKind;
  message?: string;
  /** Default true (Matthew's Q3 call); the crash screen passes false */
  screenshot?: boolean;
}

type OpenFn = (opts?: ComposerOptions) => void;
let openFn: OpenFn | null = null;

/** Open the composer from anywhere (no-op while no host is mounted) */
export function openFeedbackComposer(opts?: ComposerOptions): void {
  openFn?.(opts);
}

/** Mount once inside the signed-in app (App.tsx) */
export function FeedbackHost() {
  const [state, setState] = useState<
    | { phase: 'closed' }
    | { phase: 'capturing'; opts: ComposerOptions }
    | { phase: 'open'; opts: ComposerOptions; screenshot: string | null }
  >({ phase: 'closed' });

  useEffect(() => {
    openFn = (opts = {}) => {
      if (opts.screenshot === false) {
        setState({ phase: 'open', opts, screenshot: null });
        return;
      }
      setState({ phase: 'capturing', opts });
      void captureScreenshot().then((shot) => setState({ phase: 'open', opts, screenshot: shot }));
    };
    return () => {
      openFn = null;
    };
  }, []);

  if (state.phase === 'closed') return null;
  if (state.phase === 'capturing')
    return (
      <div className="fixed inset-0 z-[95] pointer-events-none flex items-end sm:items-center justify-center p-4">
        <div className="rounded-xl bg-gray-900/90 text-white text-sm px-4 py-2 flex items-center gap-2 shadow-lg">
          <Camera className="h-4 w-4" /> Grabbing a picture of this screen…
        </div>
      </div>
    );
  return (
    <FeedbackComposer
      initialKind={state.opts.kind}
      initialMessage={state.opts.message}
      screenshot={state.screenshot}
      onClose={() => setState({ phase: 'closed' })}
    />
  );
}

/** The sheet itself — also rendered directly by the crash screen */
export function FeedbackComposer({
  initialKind,
  initialMessage,
  screenshot,
  onClose,
  embedded,
}: {
  initialKind?: FeedbackKind;
  initialMessage?: string;
  screenshot: string | null;
  onClose: () => void;
  /** Render inline (crash screen) instead of as an overlay sheet */
  embedded?: boolean;
}) {
  const [kind, setKind] = useState<FeedbackKind>(initialKind ?? 'bug');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [includeShot, setIncludeShot] = useState(Boolean(screenshot));
  const [sending, setSending] = useState(false);
  const online = navigator.onLine;
  const user = getRealSessionUser();
  const isCrash = kind === 'crash';

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const outcome = await submitFeedback({
        kind,
        message,
        screenshot: includeShot ? screenshot : null,
      });
      showToast(
        outcome === 'sent'
          ? 'Sent — thanks. Matthew reads every one.'
          : "Saved — it sends itself when you're back online.",
      );
      onClose();
    } catch {
      showToast("Couldn't save that report on this device. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const body = (
    <div
      data-feedback-composer
      className={cn(
        'bg-white dark:bg-gray-900 w-full sm:max-w-md p-5 space-y-4',
        embedded ? 'rounded-2xl border border-gray-200' : 'rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">{isCrash ? 'Send a crash report' : 'Send feedback'}</h2>
          <p className="text-sm text-gray-500">
            {isCrash
              ? 'The error details are attached. Add what you were doing, if you can.'
              : 'Goes straight to Matthew, who builds ShotLog — not to your company.'}
          </p>
        </div>
        <button className="p-1 text-gray-400" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!isCrash && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">
          {FEEDBACK_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              data-feedback-kind={k.value}
              title={k.hint}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium min-h-[36px]',
                kind === k.value
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
              )}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      <Textarea
        autoFocus
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          kind === 'idea'
            ? 'What would make this easier?'
            : kind === 'question'
              ? 'What are you trying to do?'
              : 'What happened, and what did you expect?'
        }
        className="min-h-[110px]"
        data-feedback-message
      />

      {screenshot && (
        <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5 accent-navy"
            checked={includeShot}
            onChange={(e) => setIncludeShot(e.target.checked)}
            data-feedback-screenshot
          />
          <img
            src={screenshot}
            alt="Screenshot of this screen"
            className="h-12 w-16 object-cover object-top rounded border border-gray-200 bg-gray-50"
          />
          <span className="text-sm text-gray-700">
            Include a picture of this screen
            <span className="block text-xs text-gray-400">Helps show exactly what you saw.</span>
          </span>
        </label>
      )}

      <div className="flex items-center gap-2">
        <Button
          className="flex-1"
          disabled={!message.trim() || sending}
          onClick={() => void send()}
          data-feedback-send
        >
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {online ? 'Send' : 'Save — send when online'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        {!online && <WifiOff className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
        <span>
          Sent with your name{user ? ` (${user.name})` : ''}, this screen, the app build, and the
          last few connection events. {!online && 'No signal right now — it waits on this device and sends itself.'}
        </span>
      </p>
    </div>
  );

  if (embedded) return body;
  return (
    <div
      className="fixed inset-0 z-[95] bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {body}
    </div>
  );
}
