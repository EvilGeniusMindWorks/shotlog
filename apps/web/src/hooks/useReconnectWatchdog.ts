import { useEffect } from 'react';
import { getPowerSync, reconnectPowerSync } from '@/db/powersync/client';

/**
 * Nudges the sync stream the moment connectivity plausibly returned —
 * window 'online' and app-foregrounded — instead of waiting out the SDK's
 * internal backoff. reconnectPowerSync is debounced and connection-guarded.
 */
export function useReconnectWatchdog(): void {
  useEffect(() => {
    const nudge = () => {
      if (!getPowerSync().currentStatus?.connected) {
        void reconnectPowerSync().catch(() => undefined);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') nudge();
    };
    window.addEventListener('online', nudge);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', nudge);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
