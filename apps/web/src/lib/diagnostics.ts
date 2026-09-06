// Device diagnostics for feedback + crash reports (Round S3): a rolling
// error log (render errors, window.onerror, unhandled rejections — last 20,
// persisted so a report filed after a reload still carries the cause) and
// the one-shot snapshot every report is stamped with.
import { getSyncLog, type SyncLogEntry } from '@/lib/syncLog';

const KEY = 'shotlog-error-log';
const MAX = 20;
export const ERROR_LOG_EVENT = 'shotlog-error-log-changed';

export interface ErrorLogEntry {
  at: string; // ISO
  kind: 'render' | 'error' | 'rejection';
  msg: string;
  stack?: string;
  route?: string;
}

export function getErrorLog(): ErrorLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorLogEntry[];
  } catch {
    return [];
  }
}

export function logError(entry: Omit<ErrorLogEntry, 'at' | 'route'>): ErrorLogEntry {
  const full: ErrorLogEntry = {
    at: new Date().toISOString(),
    route: currentRoute(),
    ...entry,
    msg: entry.msg.slice(0, 500),
    stack: entry.stack?.slice(0, 2000),
  };
  try {
    const entries = getErrorLog();
    entries.push(full);
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
    window.dispatchEvent(new Event(ERROR_LOG_EVENT));
  } catch {
    // storage full/unavailable — diagnostics must never break the app
  }
  return full;
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(ERROR_LOG_EVENT));
  } catch {
    /* ignore */
  }
}

/** Browser noise that is never actionable for the user or for triage */
const IGNORED = [/ResizeObserver loop/i, /Script error\.?$/i];

function describe(reason: unknown): { msg: string; stack?: string } {
  if (reason instanceof Error) return { msg: `${reason.name}: ${reason.message}`, stack: reason.stack };
  if (typeof reason === 'string') return { msg: reason };
  try {
    return { msg: JSON.stringify(reason).slice(0, 300) };
  } catch {
    return { msg: String(reason) };
  }
}

let installed = false;

/**
 * Capture uncaught errors + unhandled promise rejections into the log and
 * SURFACE at most one per minute through `onSurface` (a toast with a Report
 * action — never a modal, never a white screen). Idempotent.
 */
export function installGlobalErrorCapture(onSurface: (entry: ErrorLogEntry) => void): void {
  if (installed) return;
  installed = true;
  let lastSurfaced = 0;
  const surface = (entry: ErrorLogEntry) => {
    const now = Date.now();
    if (now - lastSurfaced < 60_000) return;
    lastSurfaced = now;
    try {
      onSurface(entry);
    } catch {
      /* never recurse */
    }
  };
  window.addEventListener('error', (ev) => {
    const d = ev.error ? describe(ev.error) : { msg: ev.message || 'Unknown error' };
    if (IGNORED.some((re) => re.test(d.msg))) return;
    surface(logError({ kind: 'error', ...d }));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const d = describe(ev.reason);
    if (IGNORED.some((re) => re.test(d.msg))) return;
    surface(logError({ kind: 'rejection', ...d }));
  });
}

export function currentRoute(): string {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return '';
  }
}

export function buildId(): string {
  return typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
}

export interface DiagnosticsSnapshot {
  route: string;
  buildId: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  /** Installed to the home screen (PWA) vs running in a browser tab */
  standalone: boolean;
  syncLogTail: SyncLogEntry[];
  errorLog: ErrorLogEntry[];
}

export function collectDiagnostics(): DiagnosticsSnapshot {
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = false;
  try {
    standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  } catch {
    /* ignore */
  }
  return {
    route: currentRoute(),
    buildId: buildId(),
    userAgent: navigator.userAgent.slice(0, 400),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    online: navigator.onLine,
    standalone,
    syncLogTail: getSyncLog().slice(-20),
    errorLog: getErrorLog(),
  };
}
