// The feedback bubble in the corner of every screen (Round S18, Matthew:
// "on modals I can't access the menu where the feedback lives"). On by
// itself in Alpha and Beta companies; off in Production unless a person
// switches it on in Settings. The preference lives on the device.
const KEY = 'shotlog-feedback-button';
export const FEEDBACK_FAB_EVENT = 'shotlog-feedback-button-changed';

export function feedbackFabDefault(environment: string | undefined): boolean {
  return environment !== 'production';
}

export function feedbackFabPref(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

export function setFeedbackFabPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode — the default stands */
  }
  window.dispatchEvent(new Event(FEEDBACK_FAB_EVENT));
}

export function feedbackFabOn(environment: string | undefined): boolean {
  const pref = feedbackFabPref();
  return pref ? pref === 'on' : feedbackFabDefault(environment);
}

/** Screens that open outside the app frame (no header, no ? menu, no bottom nav) */
export function isBareRoute(pathname: string): boolean {
  return /^\/help(\/|$)|\/print(-daily)?$|\/submit$|\/report$|^\/drill-checklist-(print|file)\//.test(pathname);
}
