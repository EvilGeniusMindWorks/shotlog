// Filing to the office: point-in-time PDF + frozen attachment copies,
// written once as a `submissions` record. The server discards any re-PUT
// of an existing submission id — corrections are new versions (v1, v2, …),
// so the office's record book never changes under it.
import { useLiveQuery, db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
import { authedFetch, getSessionUser } from '@/lib/session';
import { getLocalMedia, putLocalMedia } from '@/lib/localMedia';
import { getJobContext } from '@/lib/jobContext';
import { generateId, nowISO } from '@/lib/utils';
import type { Attachment, Submission, SubmissionAsset, SubmissionType } from '@/db/schema';

/** Archive copies of images are capped at this edge (originals stay live) */
const ARCHIVE_MAX_DIM = 1600;

/** Wait until every image inside the rendered `.page` DOM has loaded —
 *  html2canvas snapshots whatever is there, loaded or not. */
export async function waitForPageImages(timeoutMs = 8000): Promise<void> {
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.page img')];
  const pending = imgs.filter((i) => !i.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Poll until the print layout is actually rendered: at least one `.page`
 *  exists and none of them are still on a loading placeholder. */
export async function waitForPagesReady(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pages = [...document.querySelectorAll<HTMLElement>('.page')];
    const ready =
      pages.length > 0 && !pages.some((p) => (p.textContent ?? '').trim() === 'Loading…');
    if (ready) break;
    if (Date.now() > deadline) throw new Error('print layout never rendered');
    await new Promise((r) => setTimeout(r, 200));
  }
  await waitForPageImages();
  await new Promise((r) => setTimeout(r, 400)); // let object URLs paint
}

/** Every attachment hanging off a work day: the day itself, its blast log,
 *  shots, seismo readings, and daily report. */
export async function collectDayAttachments(dayId: string): Promise<Attachment[]> {
  const parents = new Set<string>([dayId]);
  const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
  if (log) {
    parents.add(log.id);
    const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
    for (const s of shots) {
      parents.add(s.id);
      const readings = await db.seismoReadings.where('shotId').equals(s.id).toArray();
      for (const r of readings) parents.add(r.id);
    }
  }
  const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
  if (report) parents.add(report.id);
  return db.attachments.filter((a) => parents.has(a.parentId)).toArray();
}

/** Downscale an image blob to archival size (JPEG). Non-images and
 *  failures fall back to the original blob. */
async function toArchivalImage(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, ARCHIVE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return out ?? blob;
  } catch {
    return blob;
  }
}

/** Resolve an attachment's binary at archive time: legacy inline data →
 *  this device's media store → R2 (online only). Null = unavailable here. */
async function resolveBinary(a: Attachment): Promise<Blob | null> {
  if (a.data && a.data.size > 0) return a.data;
  const local = await getLocalMedia(a.id);
  if (local) return local;
  if (a.storageKey) {
    try {
      const res = await authedFetch('/files/presign-download', {
        method: 'POST',
        body: JSON.stringify({ key: a.storageKey }),
      });
      if (!res.ok) return null;
      const { url } = (await res.json()) as { url: string };
      const fileRes = await fetch(url);
      return fileRes.ok ? await fileRes.blob() : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Freeze attachments for the archive: images downscaled, PDFs copied,
 *  videos referenced (with clip marks + where the full file lives). */
async function freezeAttachments(
  attachments: Attachment[],
): Promise<{ assets: SubmissionAsset[]; skippedVideos: string[] }> {
  const assets: SubmissionAsset[] = [];
  const skippedVideos: string[] = [];
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  for (const a of attachments) {
    if (a.mimeType.startsWith('video/')) {
      const marks =
        a.clipStart !== undefined && a.clipEnd !== undefined
          ? ` · clip ${fmtT(a.clipStart)}–${fmtT(a.clipEnd)}`
          : '';
      const where = a.storageStatus === 'device' && a.originName ? ` · full video on ${a.originName}'s device` : '';
      skippedVideos.push(`${a.fileName || a.id}${marks}${where}`);
      continue;
    }
    const binary = await resolveBinary(a);
    if (!binary) {
      // Not reachable from this device right now — reference, don't block filing
      skippedVideos.push(`${a.fileName || a.id} · not available on this device`);
      continue;
    }
    const data = a.mimeType.startsWith('image/') ? await toArchivalImage(binary) : binary;
    assets.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, data });
  }
  return { assets, skippedVideos };
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** localMedia keys for a submission's binaries */
export const subPdfKey = (submissionId: string) => `sub-pdf-${submissionId}`;
export const subAssetKey = (submissionId: string, assetId: string) =>
  `sub-asset-${submissionId}-${assetId}`;

export async function nextSubmissionVersion(sourceId: string, type: SubmissionType): Promise<number> {
  const prior = await db.submissions
    .filter((s) => s.sourceId === sourceId && s.type === type)
    .toArray();
  return 1 + prior.reduce((m, s) => Math.max(m, s.version), 0);
}

// ── Blob-free submission lists ────────────────────────────────────────────
// Every Submission row carries its full PDF + frozen attachment copies as
// blobs. Loading them wholesale for LIST views materialized every filed
// document into JS memory on each Records/dashboard visit — enough for
// Safari to kill the page ("this webpage was using significant memory").
// Summaries keep the heavy base64 inside SQLite via json_extract; the full
// record is fetched one-at-a-time only when a PDF is actually opened.

export interface SubmissionSummary {
  id: string;
  type: SubmissionType;
  sourceId: string;
  blastDayId?: string;
  jobId?: string;
  version: number;
  title: string;
  date: string;
  submittedBy: string;
  submittedByUserId: string;
  assetCount: number;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export async function listSubmissionSummaries(): Promise<SubmissionSummary[]> {
  const rows = await getPowerSync().getAll<{
    id: string; type: SubmissionType; sourceId: string; blastDayId: string | null;
    jobId: string | null; version: number; title: string; date: string;
    submittedBy: string; submittedByUserId: string; assetCount: number | null;
    createdAt: string; metaJson: string | null;
  }>(
    `SELECT id,
            json_extract(payload,'$.type')              AS type,
            json_extract(payload,'$.sourceId')          AS sourceId,
            json_extract(payload,'$.blastDayId')        AS blastDayId,
            json_extract(payload,'$.jobId')             AS jobId,
            json_extract(payload,'$.version')           AS version,
            json_extract(payload,'$.title')             AS title,
            json_extract(payload,'$.date')              AS date,
            json_extract(payload,'$.submittedBy')       AS submittedBy,
            json_extract(payload,'$.submittedByUserId') AS submittedByUserId,
            json_array_length(payload,'$.assets')       AS assetCount,
            json_extract(payload,'$.createdAt')         AS createdAt,
            json_extract(payload,'$.meta')              AS metaJson
     FROM records WHERE table_name = 'submissions'`,
  );
  return rows.map((r) => ({
    id: r.id, type: r.type, sourceId: r.sourceId,
    blastDayId: r.blastDayId ?? undefined, jobId: r.jobId ?? undefined,
    version: r.version, title: r.title, date: r.date,
    submittedBy: r.submittedBy, submittedByUserId: r.submittedByUserId,
    assetCount: r.assetCount ?? 0,
    createdAt: r.createdAt,
    meta: r.metaJson ? (JSON.parse(r.metaJson) as Record<string, unknown>) : undefined,
  }));
}

/** Live blob-free list of ALL filed copies (list views only) */
export function useSubmissionSummaries(): SubmissionSummary[] | undefined {
  return useLiveQuery(listSubmissionSummaries, []);
}

/**
 * Open one filed PDF. The window opens SYNCHRONOUSLY (Safari blocks
 * window.open after an await) and the blob streams in after the single
 * record is fetched.
 */
export function openSubmissionPdfById(id: string): void {
  const w = window.open('', '_blank');
  void getSubmissionPdfBlob(id).then((pdf) => {
    if (!pdf) return w?.close();
    const url = URL.createObjectURL(pdf);
    if (w) w.location.href = url;
    else window.open(url, '_blank');
  });
}

export async function downloadSubmissionPdfById(id: string, fileName: string): Promise<void> {
  const pdf = await getSubmissionPdfBlob(id);
  if (!pdf) return;
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * File a document with the office. The caller builds the PDF (a searchable
 * text-native blob from `@/pdfdocs`) and passes it in — filing itself is
 * pure data from here on.
 */
export async function fileSubmission(opts: {
  type: SubmissionType;
  sourceId: string;
  blastDayId?: string;
  jobId?: string;
  title: string;
  date: string;
  pdf: Blob;
  attachments?: Attachment[];
  meta?: Record<string, unknown>;
}): Promise<string> {
  const session = getSessionUser();
  const pdf = opts.pdf;
  const { assets, skippedVideos } = await freezeAttachments(opts.attachments ?? []);
  const now = nowISO();
  const id = generateId();
  // Binaries go to the device media store; the record carries metadata +
  // checksums only. The background uploader lands binaries in R2 and flips
  // the storage pointer — the ONE post-file change the server permits.
  await putLocalMedia(subPdfKey(id), pdf);
  const assetRefs: SubmissionAsset[] = [];
  for (const a of assets) {
    const data = a.data as Blob;
    await putLocalMedia(subAssetKey(id, a.id), data);
    assetRefs.push({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      data: null,
      sha256: await sha256Hex(data),
      size: data.size,
    });
  }
  const jobCtx = await getJobContext(opts.jobId);
  const submission: Submission = {
    id,
    type: opts.type,
    sourceId: opts.sourceId,
    blastDayId: opts.blastDayId,
    jobId: opts.jobId,
    customerId: jobCtx?.customer?.id,
    siteId: jobCtx?.site?.id,
    version: await nextSubmissionVersion(opts.sourceId, opts.type),
    title: opts.title,
    date: opts.date,
    submittedBy: session?.name ?? '',
    submittedByUserId: session?.id ?? '',
    pdf: null,
    pdfSha256: await sha256Hex(pdf),
    pdfSize: pdf.size,
    assets: assetRefs,
    storageStatus: 'device',
    meta: skippedVideos.length ? { ...opts.meta, skippedVideos } : opts.meta,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.submissions.add(submission);
  return id;
}

/** Resolve a submission's PDF: legacy inline → device store → R2 (cached) */
export async function getSubmissionPdfBlob(id: string): Promise<Blob | null> {
  const s = await db.submissions.get(id);
  if (!s) return null;
  if (s.pdf && s.pdf.size > 0) return s.pdf;
  const local = await getLocalMedia(subPdfKey(id));
  if (local) return local;
  if (s.pdfKey) {
    const blob = await fetchFromStorage(s.pdfKey);
    if (blob) await putLocalMedia(subPdfKey(id), blob).catch(() => undefined);
    return blob;
  }
  return null;
}

/** Resolve one frozen asset copy the same way */
export async function getSubmissionAssetBlob(
  submissionId: string,
  assetId: string,
): Promise<Blob | null> {
  const s = await db.submissions.get(submissionId);
  const asset = s?.assets.find((a) => a.id === assetId);
  if (!s || !asset) return null;
  if (asset.data && asset.data.size > 0) return asset.data;
  const local = await getLocalMedia(subAssetKey(submissionId, assetId));
  if (local) return local;
  const key = s.assetKeys?.[assetId];
  if (key) {
    const blob = await fetchFromStorage(key);
    if (blob) await putLocalMedia(subAssetKey(submissionId, assetId), blob).catch(() => undefined);
    return blob;
  }
  return null;
}

async function fetchFromStorage(key: string): Promise<Blob | null> {
  try {
    const res = await authedFetch('/files/presign-download', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url: string };
    const fileRes = await fetch(url);
    return fileRes.ok ? await fileRes.blob() : null;
  } catch {
    return null;
  }
}

/** Live list of a source record's filed versions, newest first */
export function useSubmissions(sourceId: string | undefined): Submission[] | undefined {
  return useLiveQuery(
    async () =>
      sourceId
        ? (await db.submissions.filter((s) => s.sourceId === sourceId).toArray()).sort(
            (a, b) => b.version - a.version,
          )
        : [],
    [sourceId],
  );
}

/** Full-screen overlay shown while a submit route renders + files */
export function describeSubmission(s: Submission): string {
  return `${s.title} · v${s.version} · ${s.submittedBy}`;
}
