// Background uploader: moves eligible captured binaries from this device's
// local media store into R2 (presigned PUT), then flips the record to
// 'stored'. Sequential + retry-safe; runs after capture, on 'online', and on
// app-foreground. Devices that DON'T hold the binary skip the record.
import { db } from '@/db';
import { authedFetch, getSession } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import { logSyncEvent } from '@/lib/syncLog';
import { getLocalMedia, listLocalMediaIds } from '@/lib/localMedia';
import { eligibleForR2 } from '@/lib/attachments';

let running = false;

export async function runFileUploader(): Promise<void> {
  if (running || !navigator.onLine || !getSession().loggedIn) return;
  running = true;
  try {
    const localIds = new Set(await listLocalMediaIds());
    if (localIds.size === 0) return;
    const pending = (await db.attachments.filter((a) => a.storageStatus === 'device').toArray())
      .filter((a) => localIds.has(a.id))
      .filter((a) => eligibleForR2(a.mimeType, a.size ?? 0));
    for (const a of pending) {
      const blob = await getLocalMedia(a.id);
      if (!blob) continue;
      try {
        const presign = await authedFetch('/files/presign-upload', {
          method: 'POST',
          body: JSON.stringify({
            attachmentId: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            size: blob.size,
          }),
        });
        if (presign.status === 503) return; // storage not configured — try later
        if (!presign.ok) {
          logSyncEvent(`file upload presign failed (${presign.status}) for ${a.fileName}`);
          continue;
        }
        const { url, key } = (await presign.json()) as { url: string; key: string };
        const put = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': a.mimeType },
          body: blob,
        });
        if (!put.ok) {
          logSyncEvent(`file upload PUT failed (${put.status}) for ${a.fileName}`);
          continue;
        }
        await db.attachments.update(a.id, {
          storageStatus: 'stored',
          storageKey: key,
          updatedAt: nowISO(),
        });
        logSyncEvent(`file uploaded: ${a.fileName}`);
      } catch {
        // offline blip mid-upload — the next run retries
        return;
      }
    }
  } finally {
    running = false;
  }
}

/** Call once from AppShell: wires the uploader to connectivity/lifecycle */
export function startFileUploader(): () => void {
  const kick = () => void runFileUploader();
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisible);
  const interval = window.setInterval(kick, 5 * 60_000);
  kick();
  return () => {
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(interval);
  };
}
