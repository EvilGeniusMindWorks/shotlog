// Crash reports without a Report tap (Round S11, Sep 13 2026 — Matthew chose
// "build on what exists" over Sentry). Every captured error (render boundary,
// window.onerror, unhandled rejection) becomes a feedback-outbox item of
// kind 'crash' marked `auto`, so it survives offline and reaches Admin ›
// Feedback › Crashes the moment the phone reconnects. The person sees a
// six-character report code; their words, if any, attach to the same crash.
//
// What goes: the error and trace, the screen, build and commit, the device,
// online or not, the sync-log tail and earlier errors (already collected),
// the breadcrumbs, and who the person is. Never form contents, photos,
// signatures or quantities.
import { setCrashReporter, type ErrorLogEntry } from '@/lib/diagnostics';
import { submitFeedback } from '@/lib/feedback';
import { getBreadcrumbs, installBreadcrumbs } from '@/lib/breadcrumbs';
import { getSession, getSessionUser } from '@/lib/session';
import { generateId } from '@/lib/utils';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Six characters a person can read out on the phone (FNV-1a over the id) */
export function reportCodeFor(id: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i++) {
    h1 = Math.imul(h1 ^ id.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ id.charCodeAt(id.length - 1 - i), 0x811c9dc5) >>> 0;
  }
  let out = '';
  let x = h1;
  for (let i = 0; i < 3; i++) {
    out += ALPHABET[x % 32];
    x = Math.floor(x / 32);
  }
  x = h2;
  for (let i = 0; i < 3; i++) {
    out += ALPHABET[x % 32];
    x = Math.floor(x / 32);
  }
  return out;
}

const codeToId = new Map<string, string>();
export function crashIdForCode(code: string): string | undefined {
  return codeToId.get(code);
}

// One report per problem per five minutes on a device, thirty an hour at most:
// a rejection in a loop must not flood the inbox (or the outbox)
const recent = new Map<string, number>();
const hourWindow: number[] = [];
const PER_KEY_MS = 5 * 60_000;
const PER_HOUR = 30;

function normalize(msg: string): string {
  return msg.replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function context(): Record<string, unknown> {
  const me = getSessionUser();
  const nav = navigator as Navigator & { connection?: { effectiveType?: string }; deviceMemory?: number };
  return {
    role: me?.role ?? '',
    company: me?.companyId ?? '',
    sessionLoggedIn: getSession().loggedIn,
    language: navigator.language,
    connection: nav.connection?.effectiveType ?? '',
    deviceMemoryGb: nav.deviceMemory ?? '',
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    secondsSinceLoad: Math.round(performance.now() / 1000),
    referrer: document.referrer ? 'yes' : '',
  };
}

/** Called by diagnostics.logError for every captured error. Returns the code
 *  shown to the person, or null when this one was throttled. */
export function reportCrash(entry: ErrorLogEntry): { code: string; id: string } | null {
  const key = `${entry.kind}|${normalize(entry.msg)}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < PER_KEY_MS) return null;
  while (hourWindow.length && now - hourWindow[0] > 3_600_000) hourWindow.shift();
  if (hourWindow.length >= PER_HOUR) return null;
  recent.set(key, now);
  hourWindow.push(now);

  const id = generateId();
  const code = reportCodeFor(id);
  codeToId.set(code, id);
  const [stack, componentStack] = (entry.stack ?? '').split('\n--- component stack ---');
  void submitFeedback({
    id,
    kind: 'crash',
    auto: true,
    reportCode: code,
    message: entry.msg,
    crash: {
      kind: entry.kind,
      message: entry.msg,
      stack: stack?.slice(0, 20_000) || undefined,
      componentStack: componentStack?.slice(0, 20_000) || undefined,
      breadcrumbs: getBreadcrumbs(),
      context: context(),
    },
  }).catch(() => undefined);
  return { code, id };
}

export function installCrashReporter() {
  installBreadcrumbs();
  setCrashReporter(reportCrash);
}
