import { useCallback, useEffect, useRef, useState } from 'react';
import type { Table, UpdateSpec } from 'dexie';
import { nowISO } from '@/lib/utils';

/**
 * Debounced write-through to a Dexie record with an optimistic local draft.
 *
 * Forms bind inputs to `draft` (the live record merged with unsaved edits) and
 * call `setField` on change. Edits appear instantly via the draft overlay,
 * while actual IndexedDB writes are batched into one `table.update` per record
 * after `delayMs` of inactivity — instead of one write per keystroke.
 *
 * Data-safety guarantees:
 * - Pending edits flush on unmount, on pagehide, and when the tab is hidden
 *   (device sleep / app switch), so navigation or sleep never drops data.
 * - Pending keys are only cleared once the live record reflects them, so the
 *   UI never flickers back to a stale value between write and live-query refresh.
 */
export function useDraftRecord<T extends { id: string; updatedAt: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: Table<T, string, any>,
  record: T,
  delayMs = 400,
) {
  const [pending, setPending] = useState<Partial<T>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const timer = useRef<number | undefined>(undefined);
  const recordId = record.id;

  const flushRef = useRef(() => {});
  flushRef.current = () => {
    window.clearTimeout(timer.current);
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    void table.update(recordId, { ...patch, updatedAt: nowISO() } as UpdateSpec<T>);
  };
  const flush = useCallback(() => flushRef.current(), []);

  const setField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setPending((p) => ({ ...p, [field]: value }));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flushRef.current(), delayMs);
    },
    [delayMs],
  );

  // Drop pending keys once the live record has caught up with them
  useEffect(() => {
    setPending((p) => {
      const next = { ...p };
      let changed = false;
      for (const key of Object.keys(next) as (keyof T)[]) {
        if (record[key] === next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [record]);

  // If the bound record changes identity, flush edits to the old record and reset
  useEffect(() => {
    return () => {
      flushRef.current();
      pendingRef.current = {};
      setPending({});
    };
  }, [recordId]);

  // Flush when the page is hidden (device sleep, app switch, tab close)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const draft: T = { ...record, ...pending };
  return { draft, setField, flush };
}
