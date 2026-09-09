// One kind of dialog (Round S9a, 2026-09-09). The app had eleven native
// confirm() boxes and one prompt(): unstyled, cramped on a phone, invisible
// to tests, and — the evaluation found — answered by nothing when a browser
// auto-dismisses them. `ask()` and `askText()` are promise-based drop-ins
// rendered as a bottom sheet (phone) / centred card (wide) by AskHost, which
// App.tsx mounts once beside the toast host.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AskOptions {
  title: string;
  /** one line of context under the title */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** red confirm button for destructive actions */
  danger?: boolean;
}

export interface AskTextOptions extends AskOptions {
  /** label above the field */
  label: string;
  placeholder?: string;
  /** confirm stays disabled until something is typed */
  required?: boolean;
  initial?: string;
}

type Pending =
  | { kind: 'confirm'; opts: AskOptions; resolve: (ok: boolean) => void }
  | { kind: 'text'; opts: AskTextOptions; resolve: (text: string | null) => void };

let setPendingFn: ((p: Pending | null) => void) | null = null;
let queue: Pending[] = [];

function push(p: Pending) {
  if (!setPendingFn) {
    // No host mounted (a test page, or before App renders): fall back to the browser
    if (p.kind === 'confirm') p.resolve(window.confirm(`${p.opts.title}${p.opts.body ? `\n\n${p.opts.body}` : ''}`));
    else p.resolve(window.prompt(p.opts.title, p.opts.initial ?? ''));
    return;
  }
  queue.push(p);
  if (queue.length === 1) setPendingFn(p);
}

function done() {
  queue.shift();
  setPendingFn?.(queue[0] ?? null);
}

/** "Are you sure?" — resolves true on confirm, false on cancel / Escape / backdrop */
export function ask(opts: AskOptions): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', opts, resolve }));
}

/** One line of text — resolves the trimmed text, or null when cancelled */
export function askText(opts: AskTextOptions): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'text', opts, resolve }));
}

export function AskHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    setPendingFn = setPending;
    return () => {
      setPendingFn = null;
    };
  }, []);
  useEffect(() => {
    setText(pending?.kind === 'text' ? pending.opts.initial ?? '' : '');
  }, [pending]);

  if (!pending) return null;
  const { opts } = pending;
  const cancel = () => {
    if (pending.kind === 'confirm') pending.resolve(false);
    else pending.resolve(null);
    done();
  };
  const confirm = () => {
    if (pending.kind === 'confirm') pending.resolve(true);
    else pending.resolve(text.trim());
    done();
  };
  const textOk = pending.kind !== 'text' || !pending.opts.required || text.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={cancel}
      data-ask-sheet
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.5rem,var(--sab))] space-y-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && textOk && (pending.kind === 'confirm' || (e.target as HTMLElement).tagName === 'INPUT')) confirm();
        }}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
        <p id="ask-title" className="font-bold text-base" data-ask-title>
          {opts.title}
        </p>
        {opts.body && <p className="text-sm text-gray-600">{opts.body}</p>}
        {pending.kind === 'text' && (
          <div>
            <Label className="text-xs" htmlFor="ask-text">
              {pending.opts.label}
              {pending.opts.required ? '' : <span className="text-gray-400 font-normal"> — optional</span>}
            </Label>
            <Input
              id="ask-text"
              data-ask-text
              autoFocus
              value={text}
              placeholder={pending.opts.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={cancel} data-ask-cancel>
            {opts.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            onClick={confirm}
            disabled={!textOk}
            autoFocus={pending.kind === 'confirm'}
            className={opts.danger ? 'bg-violation hover:bg-violation/90 text-white' : undefined}
            data-ask-confirm
          >
            {opts.confirmLabel ?? 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
}
