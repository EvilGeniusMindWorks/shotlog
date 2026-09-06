// Feedback outbox (Round S3). A report is written to this DEVICE first —
// metadata in localStorage, the optional screenshot in the local media
// store — then drained to POST /feedback on online / foreground / a timer,
// the same shape as the file uploader. Reports never touch the synced
// `records` table: they are platform data for Matthew, not company data
// (docs/soft-launch-plan.md S3, decisions 2026-09-06).
import { authedFetch, getSession } from '@/lib/session';
import { deleteLocalMedia, getLocalMedia, putLocalMedia } from '@/lib/localMedia';
import { blobToDataUrl, dataUrlToBlob, generateId, nowISO } from '@/lib/utils';
import { collectDiagnostics, type DiagnosticsSnapshot } from '@/lib/diagnostics';
import { logSyncEvent } from '@/lib/syncLog';

const OUTBOX_KEY = 'shotlog-feedback-outbox';
export const FEEDBACK_OUTBOX_EVENT = 'shotlog-feedback-outbox-changed';
const SCREENSHOT_MAX_WIDTH = 1280;

export type FeedbackKind = 'bug' | 'idea' | 'question' | 'crash';

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: 'bug', label: 'Something broke', hint: 'wrong number, stuck screen, lost entry' },
  { value: 'idea', label: 'Idea', hint: 'what would make this easier' },
  { value: 'question', label: 'Question', hint: "not sure what to do here" },
];

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  /** JPEG data URL captured BEFORE the composer opened (null = none) */
  screenshot?: string | null;
}

interface OutboxItem extends DiagnosticsSnapshot {
  id: string;
  kind: FeedbackKind;
  message: string;
  hasScreenshot: boolean;
  createdAt: string;
}

const shotKey = (id: string) => `feedback-shot-${id}`;

function readOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as OutboxItem[];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(FEEDBACK_OUTBOX_EVENT));
  } catch {
    /* ignore */
  }
}

export function outboxCount(): number {
  return readOutbox().length;
}

/**
 * Picture of the current screen (the `main` region — not the sheet that is
 * about to open over it). Downscaled to ≤1280px wide JPEG; null on any
 * failure or after 8s — a screenshot is a nice-to-have, never a blocker.
 */
export async function captureScreenshot(): Promise<string | null> {
  const target = (document.querySelector('main') ?? document.body) as HTMLElement;
  const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / Math.max(1, target.clientWidth || window.innerWidth));
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000));
  const shot = (async () => {
    try {
      // Loaded on demand so the composer never sits on the boot path
      // (a static import here slowed the dev boot ~4s). NOTE: pdf.ts still
      // imports html2canvas statically, so the production bundle only
      // shrinks once that side goes lazy too.
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(target, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        // Only what is on screen — a long page would make a huge, useless image
        height: Math.min(target.scrollHeight, window.innerHeight * 2),
        windowHeight: window.innerHeight,
      });
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  })();
  return Promise.race([shot, timeout]);
}

/**
 * File a report: outbox first (survives reloads and offline), then try to
 * drain immediately. Resolves 'sent' when the server took it, 'queued' when
 * it is waiting for signal — the toast tells the truth either way.
 */
export async function submitFeedback(draft: FeedbackDraft): Promise<'sent' | 'queued'> {
  const id = generateId();
  const diag = collectDiagnostics();
  let hasScreenshot = false;
  if (draft.screenshot) {
    const blob = dataUrlToBlob(draft.screenshot);
    if (blob) {
      try {
        await putLocalMedia(shotKey(id), blob);
        hasScreenshot = true;
      } catch {
        hasScreenshot = false;
      }
    }
  }
  const item: OutboxItem = {
    ...diag,
    id,
    kind: draft.kind,
    message: draft.message.trim(),
    hasScreenshot,
    createdAt: nowISO(),
  };
  writeOutbox([...readOutbox(), item]);
  await drainFeedbackOutbox();
  return readOutbox().some((x) => x.id === id) ? 'queued' : 'sent';
}

let inflight: Promise<void> | null = null;

/** Single-flight: concurrent callers share one pass, so two triggers firing
 *  together (online event + timer) can never post the same report twice. */
export function drainFeedbackOutbox(): Promise<void> {
  if (inflight) return inflight;
  inflight = drainOnce().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function drainOnce(): Promise<void> {
  if (!getSession().loggedIn) return;
  for (const item of readOutbox()) {
    if (!navigator.onLine) return;
    try {
      let screenshot: string | null = null;
      if (item.hasScreenshot) {
        const blob = await getLocalMedia(shotKey(item.id)).catch(() => undefined);
        if (blob) screenshot = await blobToDataUrl(blob);
      }
      const { hasScreenshot: _omit, ...body } = item;
      void _omit;
      const res = await authedFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ ...body, screenshot }),
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
        // Landed — or the server will never accept it (malformed/too big):
        // either way it must not wedge the queue behind it
        if (!res.ok) logSyncEvent(`feedback ${item.id.slice(0, 8)} rejected (${res.status}) — dropped`);
        writeOutbox(readOutbox().filter((x) => x.id !== item.id));
        await deleteLocalMedia(shotKey(item.id)).catch(() => undefined);
        continue;
      }
      return; // 401 (session paused) or 5xx — keep it, retry next pass
    } catch {
      return; // offline blip — next pass retries
    }
  }
}

let started = false;

/** Drain on online / foreground / every 5 minutes. Idempotent. */
export function startFeedbackOutbox(): void {
  if (started) return;
  started = true;
  const kick = () => void drainFeedbackOutbox();
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  window.setInterval(kick, 5 * 60_000);
  window.setTimeout(kick, 3000);
}
