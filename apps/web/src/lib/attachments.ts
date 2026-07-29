// Attachment capture pipeline + blob-free queries. The record that syncs is
// METADATA ONLY (kind, size, thumb, checksum, clip marks, storage key) — the
// binary goes to the device-local media store at capture time, then to R2 via
// the background uploader (photos/PDFs/small videos) or stays on the device
// (full-length shot videos, until a clip is extracted — phase 2).
import { useLiveQuery, db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
import { authedFetch, getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { getLocalMedia, putLocalMedia } from '@/lib/localMedia';
import type { Attachment } from '@/db/schema';

/** Binaries above this never upload to R2 — full videos wait for clipping */
export const R2_MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_MAX_DIM = 2560;
const THUMB_DIM = 240;

export const BUILTIN_KINDS: { value: string; label: string }[] = [
  { value: 'bill_of_lading', label: 'Bill of lading' },
  { value: 'shot_video', label: 'Shot video' },
  { value: 'photo', label: 'Photo' },
];

/** Built-ins + company-defined customs + Other, for the picker */
export function mergeKinds(custom: string[] | undefined): { value: string; label: string }[] {
  const customs = (custom ?? [])
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => ({ value: c, label: c }));
  return [...BUILTIN_KINDS, ...customs, { value: 'other', label: 'Other' }];
}

export function kindLabel(kind: string | undefined): string {
  if (!kind || kind === 'other') return 'Other';
  return BUILTIN_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Should this binary go to R2, or stay on the capturing device? */
export function eligibleForR2(mimeType: string, size: number): boolean {
  return size <= R2_MAX_BYTES;
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function drawScaled(
  source: HTMLImageElement | HTMLVideoElement,
  w: number,
  h: number,
  maxDim: number,
  quality: number,
): { dataUrl: string; blobPromise: Promise<Blob | null> } {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    blobPromise: new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)),
  };
}

/** Downscale a camera image for storage + make a tiny preview thumb */
async function processImage(blob: Blob): Promise<{ stored: Blob; thumb: string }> {
  try {
    const img = await loadImage(blob);
    const { blobPromise } = drawScaled(img, img.naturalWidth, img.naturalHeight, IMAGE_MAX_DIM, 0.85);
    const { dataUrl: thumb } = drawScaled(img, img.naturalWidth, img.naturalHeight, THUMB_DIM, 0.7);
    const stored = (await blobPromise) ?? blob;
    // Only keep the re-encode when it actually helps
    return { stored: stored.size < blob.size ? stored : blob, thumb };
  } catch {
    return { stored: blob, thumb: '' };
  }
}

/** Read duration + a poster-frame thumb from a video blob */
async function probeVideo(blob: Blob): Promise<{ duration: number | null; thumb: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    const done = (duration: number | null, thumb: string) => {
      URL.revokeObjectURL(url);
      resolve({ duration, thumb });
    };
    const bail = setTimeout(() => done(null, ''), 10000);
    video.onloadedmetadata = () => {
      // MediaRecorder blobs report Infinity until seeked far forward
      if (!Number.isFinite(video.duration)) video.currentTime = 1e6;
      else video.currentTime = Math.min(0.5, video.duration / 2);
    };
    video.onseeked = () => {
      clearTimeout(bail);
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      try {
        const { dataUrl } = drawScaled(video, video.videoWidth, video.videoHeight, THUMB_DIM, 0.7);
        done(duration, dataUrl);
      } catch {
        done(duration, '');
      }
    };
    video.onerror = () => {
      clearTimeout(bail);
      done(null, '');
    };
    video.src = url;
  });
}

/**
 * Capture files as attachments: binary → local media store; metadata-only
 * record → sync. The background uploader moves eligible binaries to R2.
 */
export async function addAttachmentFiles(
  parentId: string,
  parentType: Attachment['parentType'],
  files: FileList | File[],
  kind?: string,
  extra?: Partial<Pick<Attachment, 'sourceAttachmentId'>>,
): Promise<string[]> {
  const session = getSessionUser();
  const ids: string[] = [];
  for (const file of Array.from(files)) {
    const id = generateId();
    let stored: Blob = file;
    let thumb = '';
    let duration: number | null | undefined;
    if (file.type.startsWith('image/')) {
      const p = await processImage(file);
      stored = p.stored;
      thumb = p.thumb;
    } else if (file.type.startsWith('video/')) {
      const p = await probeVideo(file);
      duration = p.duration;
      thumb = p.thumb;
    }
    await putLocalMedia(id, stored);
    const now = nowISO();
    const attachment: Attachment = {
      id,
      parentId,
      parentType,
      fileName: file.name || `${kind ?? 'file'}-${now.slice(0, 10)}`,
      mimeType: file.type || 'application/octet-stream',
      data: null, // binary NEVER rides the sync record
      kind,
      size: stored.size,
      duration,
      thumb: thumb || undefined,
      sha256: await sha256Hex(stored),
      storageStatus: 'device',
      originName: session?.name ?? undefined,
      ...extra,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await db.attachments.add(attachment);
    ids.push(id);
  }
  return ids;
}

/** Blob-free list row for attachment grids */
export interface AttachmentSummary {
  id: string;
  parentId: string;
  parentType: string;
  fileName: string;
  mimeType: string;
  kind?: string;
  size?: number;
  duration?: number | null;
  clipStart?: number;
  clipEnd?: number;
  thumb?: string;
  localOnly: boolean;
  storageKey?: string;
  storageStatus?: string;
  originName?: string;
  /** Legacy rows carry the binary inline (pre-R2) */
  legacyInline: boolean;
  /** Extracted clip → the full-video attachment it came from */
  sourceAttachmentId?: string;
  createdAt: string;
}

export async function listAttachmentSummaries(parentIds: string[]): Promise<AttachmentSummary[]> {
  if (parentIds.length === 0) return [];
  const placeholders = parentIds.map(() => '?').join(',');
  const rows = await getPowerSync().getAll<{
    id: string; parentId: string; parentType: string; fileName: string; mimeType: string;
    kind: string | null; size: number | null; duration: number | null;
    clipStart: number | null; clipEnd: number | null; thumb: string | null;
    storageKey: string | null; storageStatus: string | null; originName: string | null;
    sourceAttachmentId: string | null; dataLen: number | null; createdAt: string;
  }>(
    `SELECT id,
            json_extract(payload,'$.parentId')      AS parentId,
            json_extract(payload,'$.parentType')    AS parentType,
            json_extract(payload,'$.fileName')      AS fileName,
            json_extract(payload,'$.mimeType')      AS mimeType,
            json_extract(payload,'$.kind')          AS kind,
            json_extract(payload,'$.size')          AS size,
            json_extract(payload,'$.duration')      AS duration,
            json_extract(payload,'$.clipStart')     AS clipStart,
            json_extract(payload,'$.clipEnd')       AS clipEnd,
            json_extract(payload,'$.thumb')         AS thumb,
            json_extract(payload,'$.storageKey')    AS storageKey,
            json_extract(payload,'$.storageStatus') AS storageStatus,
            json_extract(payload,'$.originName')    AS originName,
            json_extract(payload,'$.sourceAttachmentId') AS sourceAttachmentId,
            length(json_extract(payload,'$.data.__blob')) AS dataLen,
            json_extract(payload,'$.createdAt')     AS createdAt
     FROM records
     WHERE table_name = 'attachments'
       AND json_extract(payload,'$.parentId') IN (${placeholders})`,
    parentIds,
  );
  return rows.map((r) => ({
    id: r.id, parentId: r.parentId, parentType: r.parentType, fileName: r.fileName,
    mimeType: r.mimeType, kind: r.kind ?? undefined, size: r.size ?? undefined,
    duration: r.duration, clipStart: r.clipStart ?? undefined, clipEnd: r.clipEnd ?? undefined,
    thumb: r.thumb ?? undefined, localOnly: r.storageStatus === 'device',
    storageKey: r.storageKey ?? undefined, storageStatus: r.storageStatus ?? undefined,
    originName: r.originName ?? undefined,
    legacyInline: !r.storageStatus && (r.dataLen ?? 0) > 0,
    sourceAttachmentId: r.sourceAttachmentId ?? undefined,
    createdAt: r.createdAt,
  })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useAttachmentSummaries(parentIds: string[]): AttachmentSummary[] | undefined {
  return useLiveQuery(() => listAttachmentSummaries(parentIds), [parentIds.join(',')]);
}

/**
 * Resolve an attachment's binary: this device's media store → legacy inline
 * data → R2 via a presigned download (cached back into the media store).
 */
export async function getAttachmentBlob(summary: AttachmentSummary): Promise<Blob | null> {
  const local = await getLocalMedia(summary.id);
  if (local) return local;
  if (summary.legacyInline) {
    const full = await db.attachments.get(summary.id);
    if (full?.data && full.data.size > 0) return full.data;
  }
  if (summary.storageKey) {
    const res = await authedFetch('/files/presign-download', {
      method: 'POST',
      body: JSON.stringify({ key: summary.storageKey }),
    });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url: string };
    const fileRes = await fetch(url);
    if (!fileRes.ok) return null;
    const blob = await fileRes.blob();
    await putLocalMedia(summary.id, blob).catch(() => undefined);
    return blob;
  }
  return null;
}

/** Persist clip in/out marks (tiny metadata PATCH — syncs everywhere) */
export async function saveClipMarks(id: string, clipStart: number, clipEnd: number): Promise<void> {
  await db.attachments.update(id, { clipStart, clipEnd, updatedAt: nowISO() });
}
