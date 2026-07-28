import { useEffect, useState } from 'react';
import { SESSION_CHANGED_EVENT, isSessionExpired } from '@/lib/session';

/** True when the server rejected our session — syncing paused until re-login */
export function useSessionExpired(): boolean {
  const [expired, setExpired] = useState(isSessionExpired());
  useEffect(() => {
    const update = () => setExpired(isSessionExpired());
    window.addEventListener(SESSION_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return expired;
}
