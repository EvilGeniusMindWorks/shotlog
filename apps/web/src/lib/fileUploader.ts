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
import { subAssetKey, subPdfKey } from '@/lib/archive';

let running = false;

async function presignAndPut(
  id: string,
  fileName: string,
  mimeType: string,
  blob: Blob,
): Promise<string | null | 'unconfigured'> {
  const presign = await authedFetch('/files/presign-upload', {
    method: 'POST',
    body: JSON.stringify({ attachmentId: id, fileName, mimeType, size: blob.size }),
  });
  if (presign.status === 503) return 'unconfigured';
  if (!presign.ok) {
    logSyncEvent(`file upload presign failed (${presign.status}) for ${fileName}`);
    return null;
  }
  const { url, key } = (await presign.json()) as { url: string; key: string };
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': mimeType }, body: blob });
  if (!put.ok) {
    logSyncEvent(`file upload PUT failed (${put.status}) for ${fileName}`);
    return null;
  }
  return key;
}

/** Move filed-submission binaries (PDF + frozen assets) from this device
 *  into R2, then flip the record's storage pointer — the one post-file
 *  change the server's write-once rule permits. */
async function uploadSubmissionBinaries(localIds: Set<string>): Promise<void> {
  const pending = (await db.submissions.filter((s) => s.storageStatus === 'device').toArray())
    .filter((s) => localIds.has(subPdfKey(s.id)));
  for (const s of pending) {
    try {
      const pdf = await getLocalMedia(subPdfKey(s.id));
      if (!pdf) continue;
      const pdfKey = await presignAndPut(subPdfKey(s.id), `${s.type}-${s.date}-v${s.version}.pdf`, 'application/pdf', pdf);
      if (pdfKey === 'unconfigured') return;
      if (!pdfKey) continue;
      const assetKeys: Record<string, string> = {};
      let allAssets = true;
      for (const a of s.assets) {
        const blob = await getLocalMedia(subAssetKey(s.id, a.id));
        if (!blob) {
          allAssets = false;
          continue;
        }
        const key = await presignAndPut(subAssetKey(s.id, a.id), a.fileName || a.id, a.mimeType, blob);
        if (key === 'unconfigured') return;
        if (!key) {
          allAssets = false;
          continue;
        }
        assetKeys[a.id] = key;
      }
      if (!allAssets) continue; // retry the whole submission next run
      await db.submissions.update(s.id, {
        storageStatus: 'stored',
        pdfKey,
        assetKeys,
        updatedAt: nowISO(),
      });
      logSyncEvent(`filing uploaded: ${s.title} v${s.version}`);
    } catch {
      return; // offline blip — next run retries
    }
  }
}

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
        const key = await presignAndPut(a.id, a.fileName, a.mimeType, blob);
        if (key === 'unconfigured') return; // storage not configured — try later
        if (!key) continue;
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
    await uploadSubmissionBinaries(localIds);
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
