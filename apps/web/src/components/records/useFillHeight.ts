// S21 (Matthew, Sep 16 2026: "I'm not in love with a long scrolling page which
// moves the preview screen"): the Records page is exactly as tall as what is
// left of the window under the shell's header, so nothing on it scrolls but
// the list. The shell scrolls the window, not a pane, so the page measures
// its own top and the shell's bottom padding (the phone's nav bar).
import { useEffect, type RefObject } from 'react';

export function useFillHeight(ref: RefObject<HTMLElement | null>, minPx = 360): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const main = el.closest('main');
      const pb = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      el.style.height = `${Math.max(minPx, window.innerHeight - top - pb)}px`;
    };
    apply();
    const t = window.setTimeout(apply, 250);
    window.addEventListener('resize', apply);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', apply);
      el.style.height = '';
    };
  }, [ref, minPx]);
}
