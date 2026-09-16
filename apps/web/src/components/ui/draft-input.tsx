// Inputs that keep what you type and save when you pause (Round S18, from
// five of Matthew's feedback reports: "I type 30 and only 3 appears", "after
// every character it says Syncing"). Most form fields wrote the record on
// each keystroke and showed the value read back from the database; on a slow
// phone the next key landed before the read-back and the box snapped to the
// older value. A draft input owns its text while you type, writes once after
// `delayMs` of quiet (or on blur, unmount, or the page hiding), and adopts the
// record's value only when it is not mid-word — the same rule useDraftRecord
// gives whole forms, here per field so a list row or a nested value can use it.
import * as React from 'react';
import { Input, type InputProps } from './input';
import { Textarea, type TextareaProps } from './textarea';

/** After a write, a read-back that still shows an older value is ignored this long */
const READBACK_GRACE_MS = 4000;

export function useDraftValue(value: string | number | null | undefined, onCommit: (text: string) => void, delayMs = 400) {
  const asText = value === null || value === undefined ? '' : String(value);
  const [text, setText] = React.useState(asText);
  const textRef = React.useRef(asText);
  const dirty = React.useRef(false);
  const committed = React.useRef<{ text: string; at: number } | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    committed.current = { text: textRef.current, at: Date.now() };
    commitRef.current(textRef.current);
  }, []);

  // The record catching up — or someone else's change — is adopted unless we are mid-word
  React.useEffect(() => {
    if (dirty.current) return;
    const c = committed.current;
    if (c) {
      if (asText === c.text) {
        committed.current = null;
        return;
      }
      if (Date.now() - c.at < READBACK_GRACE_MS) return; // an older read-back still in flight
      committed.current = null;
    }
    if (asText !== textRef.current) {
      textRef.current = asText;
      setText(asText);
    }
  }, [asText]);

  const onChange = React.useCallback(
    (next: string) => {
      textRef.current = next;
      setText(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  // Never lose a word: flush when the page hides (sleep, app switch) and on unmount
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return { text, onChange, flush };
}

export interface DraftInputProps extends Omit<InputProps, 'value' | 'defaultValue' | 'onChange'> {
  value: string | number | null | undefined;
  /** called once per pause with the text as typed — parse it here */
  onCommit: (text: string) => void;
  delayMs?: number;
}

export const DraftInput = React.forwardRef<HTMLInputElement, DraftInputProps>(function DraftInput(
  { value, onCommit, delayMs, onBlur, ...rest },
  ref,
) {
  const d = useDraftValue(value, onCommit, delayMs);
  return (
    <Input
      ref={ref}
      {...rest}
      value={d.text}
      onChange={(e) => d.onChange(e.target.value)}
      onBlur={(e) => {
        d.flush();
        onBlur?.(e);
      }}
      data-draft-input=""
    />
  );
});

export interface DraftTextareaProps extends Omit<TextareaProps, 'value' | 'defaultValue' | 'onChange'> {
  value: string | null | undefined;
  onCommit: (text: string) => void;
  delayMs?: number;
}

export const DraftTextarea = React.forwardRef<HTMLTextAreaElement, DraftTextareaProps>(function DraftTextarea(
  { value, onCommit, delayMs, onBlur, ...rest },
  ref,
) {
  const d = useDraftValue(value, onCommit, delayMs);
  return (
    <Textarea
      ref={ref}
      {...rest}
      value={d.text}
      onChange={(e) => d.onChange(e.target.value)}
      onBlur={(e) => {
        d.flush();
        onBlur?.(e);
      }}
      data-draft-input=""
    />
  );
});
