// Background uploader: moves eligible captured binaries from this device's
// local media store into R2 (presigned PUT), then flips the record to
// 'stored'. Sequential + retry-safe; runs after capture, on 'online', and on
// app-foreground. Devices that DON'T hold the binary skip the record.
import { db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
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
  const { url, key, exists } = (await presign.json()) as { url?: string; key: string; exists?: boolean };
  // Stored on an earlier attempt (an interrupted filing retried): nothing to
  // send, and a bucket lock would refuse the overwrite anyway (S10)
  if (exists || !url) return key;
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': mimeType }, body: blob });
  if (!put.ok) {
    logSyncEvent(`file upload PUT failed (${put.status}) for ${fileName}`);
    return null;
  }
  return key;
}

/** Move filed-submission binaries (PDF + frozen assets) from this device
 *  into R2, then flip the record's storage pointer — the one post-file
 *  change the server's write-once rule permits.
 *
 *  S20 (Office Test, Sep 16 2026: every Beta blasting log read "still on
 *  the device that filed it" while the daily reports opened fine): the
 *  PDF counts the moment it lands — the pointer flips as soon as the PDF
 *  is in storage, and the photos follow. A photo whose frozen copy is not
 *  on this device but whose attachment already sits in storage is pointed
 *  at that object instead of re-sent; only a photo that exists nowhere but
 *  here is waited for, and the record says how many are still to come. */
async function uploadSubmissionBinaries(localIds: Set<string>): Promise<void> {
  // A light pass first — ids and pointers only, never the payloads. A
  // table-wide filter revived every filed copy in the local table, legacy
  // inline PDFs included, and stalled the page for seconds on every device
  // at every kick (harness78 caught it on the work day's time-card sheet).
  const light = await getPowerSync().getAll<{
    id: string;
    storageStatus: string | null;
    pdfKey: string | null;
    hasInlinePdf: number;
    assetCount: number | null;
    keyCount: number | null;
  }>(
    `SELECT id,
            json_extract(payload,'$.storageStatus') AS storageStatus,
            json_extract(payload,'$.pdfKey')        AS pdfKey,
            CASE WHEN json_type(payload,'$.pdf') IN ('object','text') THEN 1 ELSE 0 END AS hasInlinePdf,
            json_array_length(payload,'$.assets')   AS assetCount,
            (SELECT count(*) FROM json_each(payload,'$.assetKeys')) AS keyCount
     FROM records WHERE table_name = 'submissions'`,
  );
  const candidates = light.filter((r) =>
    r.storageStatus === 'device'
      ? localIds.has(subPdfKey(r.id)) || r.hasInlinePdf === 1 // this device's filing, or the inline copy it kept
      : r.storageStatus === 'stored' && (r.assetCount ?? 0) > (r.keyCount ?? 0),
  );
  for (const c of candidates) {
    const s = await db.submissions.get(c.id); // one full record at a time
    if (!s) continue;
    try {
      let pdfKey = s.pdfKey;
      if (s.storageStatus !== 'stored' || !pdfKey) {
        // the device copy, else the PDF that rode inline when the device refused the copy
        const pdf =
          (await getLocalMedia(subPdfKey(s.id)).catch(() => undefined)) ??
          (s.pdf instanceof Blob && s.pdf.size > 0 ? s.pdf : undefined);
        if (!pdf) continue; // not this device's filing
        const key = await presignAndPut(subPdfKey(s.id), `${s.type}-${s.date}-v${s.version}.pdf`, 'application/pdf', pdf);
        if (key === 'unconfigured') return;
        if (!key) continue;
        pdfKey = key;
        await db.submissions.update(s.id, { storageStatus: 'stored', pdfKey, pdf: null, updatedAt: nowISO() });
        logSyncEvent(`filing uploaded: ${s.title} v${s.version}`);
      }
      const assetKeys: Record<string, string> = { ...(s.assetKeys ?? {}) };
      let changed = false;
      let missing = 0;
      for (const a of s.assets ?? []) {
        if (assetKeys[a.id]) continue;
        const frozenId = subAssetKey(s.id, a.id);
        const frozen = localIds.has(frozenId) ? await getLocalMedia(frozenId).catch(() => null) : null;
        if (frozen) {
          const key = await presignAndPut(frozenId, a.fileName || a.id, a.mimeType, frozen);
          if (key === 'unconfigured') return;
          if (key) {
            assetKeys[a.id] = key;
            changed = true;
            continue;
          }
        }
        // no frozen copy on this device — the attachment itself may already be in storage
        const att = await db.attachments.get(a.id);
        if (att?.storageStatus === 'stored' && att.storageKey) {
          assetKeys[a.id] = att.storageKey;
          changed = true;
          continue;
        }
        missing++;
      }
      if (changed) {
        await db.submissions.update(s.id, { assetKeys, updatedAt: nowISO() });
        logSyncEvent(
          `filing photos in storage: ${Object.keys(assetKeys).length} of ${(s.assets ?? []).length} — ${s.title} v${s.version}${missing ? ` (${missing} still on the device that took them)` : ''}`,
        );
      }
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
    // A device holding no media of its own has nothing to send: its filed
    // copies were made elsewhere, and copies stranded by an older build are
    // the server's boot sweep's job (strandedFilings.ts). Touching the
    // database from here at app start also unsettled the work day's sheets
    // (harness78) — so the pass stays behind this guard.
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
