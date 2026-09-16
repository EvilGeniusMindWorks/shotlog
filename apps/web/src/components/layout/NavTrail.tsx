// Records where this tab has been — one line per location change — so every
// screen's arrow can say where it goes (lib/nav.ts). Mounted once inside the
// signed-in router.
import { useEffect } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { recordLocation } from '@/lib/nav';

export function NavTrail() {
  const location = useLocation();
  const type = useNavigationType();
  const navigate = useNavigate();
  useEffect(() => {
    recordLocation(location.key, location.pathname + location.search, type);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one record per location key
  }, [location.key]);
  useEffect(() => {
    // the browser harnesses tap through the app the way a person does (an
    // in-app navigation, never a page load); dev builds only
    if (import.meta.env.DEV) (window as unknown as { __shotlogNavigate?: (to: string) => void }).__shotlogNavigate = (to) => navigate(to);
  }, [navigate]);
  return null;
}
