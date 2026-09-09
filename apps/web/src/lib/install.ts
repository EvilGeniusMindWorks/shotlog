// Install-to-home-screen support. Chrome/Android fire `beforeinstallprompt`
// ONCE, early — so main.tsx captures it at boot and the InstallCard replays
// it on tap. iOS never fires it; there we show the Share → Add to Home
// Screen instructions instead. Field tablets running ShotLog in a browser
// tab lose it and get surprise PIN relocks; installed, it behaves like an app.
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'shotlog-install-dismissed';
const DISMISS_DAYS = 30;
export const INSTALL_EVENT = 'shotlog-install-changed';

let deferred: BeforeInstallPromptEvent | null = null;

/** Call once at boot, before React mounts */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac — the touch-point check tells them apart
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Android (any browser) — the manual route when Chrome never offered its prompt */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Samsung Internet words its menu differently from Chrome */
export function isSamsungInternet(): boolean {
  return /SamsungBrowser/i.test(navigator.userAgent);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  await ev.prompt();
  const choice = await ev.userChoice;
  if (choice.outcome === 'accepted') deferred = null;
  window.dispatchEvent(new Event(INSTALL_EVENT));
  return choice.outcome;
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(INSTALL_EVENT));
}

export function installDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export interface InstallState {
  standalone: boolean;
  ios: boolean;
  android: boolean;
  samsung: boolean;
  canPrompt: boolean;
  dismissed: boolean;
}

function read(): InstallState {
  return { standalone: isStandalone(), ios: isIOS(), android: isAndroid(), samsung: isSamsungInternet(), canPrompt: canPromptInstall(), dismissed: installDismissed() };
}

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener(INSTALL_EVENT, on);
    return () => window.removeEventListener(INSTALL_EVENT, on);
  }, []);
  return state;
}
