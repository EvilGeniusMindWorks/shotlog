import { useEffect, useState } from 'react';

const STORAGE_KEY = 'shotlog-theme';
const THEME_EVENT = 'shotlog-theme';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Light/dark theme toggle — persisted, applied as a `dark` class on <html>.
 *  Every mounted instance (rail toggle, Settings › Preferences) follows the
 *  same value: a change anywhere is broadcast in-page. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  const set = (next: Theme) => {
    setTheme(next);
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
  };

  return {
    theme,
    set,
    toggle: () => set(theme === 'dark' ? 'light' : 'dark'),
  };
}
