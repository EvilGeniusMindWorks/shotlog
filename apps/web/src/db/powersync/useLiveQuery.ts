// Drop-in replacement for dexie-react-hooks' useLiveQuery, driven by
// PowerSync change events. Dexie tracks exactly which tables a querier
// touched; every facade query reads the single `records` table, so
// re-running on any `records` change is precise enough — and queries are
// local SQLite reads, so re-running is cheap.
import { useEffect, useState } from 'react';
import { getPowerSync } from './client';

export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: unknown[] = [],
  defaultResult?: T,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(defaultResult);

  useEffect(() => {
    let alive = true;
    let seq = 0;
    let dirtyWhileHidden = false;
    const run = () => {
      // Background tabs go quiet (Safari's energy heuristic reloads tabs
      // that keep computing while hidden) — mark dirty, catch up on return
      if (document.hidden) {
        dirtyWhileHidden = true;
        return;
      }
      const mine = ++seq;
      Promise.resolve()
        .then(querier)
        .then((result) => {
          // Drop stale resolutions so a slow early query can't clobber a
          // fresh one that raced past it.
          if (alive && mine === seq) setValue(result);
        })
        .catch((err) => {
          if (alive) console.error('[useLiveQuery]', err);
        });
    };
    run();
    // 300ms coalescing: a sync checkpoint applying dozens of rows triggers
    // ONE recomputation per mounted query, not dozens (was 50ms)
    const dispose = getPowerSync().onChangeWithCallback(
      { onChange: run },
      { tables: ['records'], throttleMs: 300 },
    );
    const onVisible = () => {
      if (!document.hidden && dirtyWhileHidden) {
        dirtyWhileHidden = false;
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      dispose();
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied deps, Dexie-style
  }, deps);

  return value;
}
