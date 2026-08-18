// Minimal app-wide toast with an optional Undo action — the deletion
// pattern's "undo toast (10s)" (docs/deletion-pattern.md). No library:
// a module-level queue + one host mounted in App.tsx.
import { useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
  onUndo?: () => void | Promise<void>;
  ms: number;
}

let nextId = 1;
let pushFn: ((t: ToastItem) => void) | null = null;

/** Show a toast. With `onUndo` it lingers 10s and offers an Undo button. */
export function showToast(message: string, opts?: { onUndo?: () => void | Promise<void>; ms?: number }) {
  pushFn?.({
    id: nextId++,
    message,
    onUndo: opts?.onUndo,
    ms: opts?.ms ?? (opts?.onUndo ? 10_000 : 4_000),
  });
}

export function UndoToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushFn = (t) => {
      setToasts((prev) => [...prev.slice(-2), t]);
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.ms);
    };
    return () => {
      pushFn = null;
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[90] space-y-2 w-[calc(100%-2rem)] max-w-md pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 bg-gray-900 text-white rounded-xl shadow-lg px-4 py-3 text-sm"
        >
          <span className="flex-1">{t.message}</span>
          {t.onUndo && (
            <button
              className="font-semibold text-orange-300 hover:text-orange-200 min-h-[32px] px-2"
              onClick={() => {
                void t.onUndo?.();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
