// Filing to the office: point-in-time PDF + frozen attachment copies,
// written once as a `submissions` record. The server discards any re-PUT
// of an existing submission id — corrections are new versions (v1, v2, …),
// so the office's record book never changes under it.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { pagesToPdfBlob } from '@/lib/pdf';
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

/** Freeze attachments for the archive: images downscaled, PDFs copied,
 *  videos skipped (too heavy to duplicate through sync — referenced). */
async function freezeAttachments(
  attachments: Attachment[],
): Promise<{ assets: SubmissionAsset[]; skippedVideos: string[] }> {
  const assets: SubmissionAsset[] = [];
  const skippedVideos: string[] = [];
  for (const a of attachments) {
    if (a.mimeType.startsWith('video/')) {
      skippedVideos.push(a.fileName || a.id);
      continue;
    }
    const data = a.mimeType.startsWith('image/') ? await toArchivalImage(a.data) : a.data;
    assets.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, data });
  }
  return { assets, skippedVideos };
}

export async function nextSubmissionVersion(sourceId: string, type: SubmissionType): Promise<number> {
  const prior = await db.submissions
    .filter((s) => s.sourceId === sourceId && s.type === type)
    .toArray();
  return 1 + prior.reduce((m, s) => Math.max(m, s.version), 0);
}

/**
 * File the CURRENTLY RENDERED `.page` document with the office. The caller
 * is responsible for having the right print layout mounted and visible.
 */
export async function fileSubmission(opts: {
  type: SubmissionType;
  sourceId: string;
  blastDayId?: string;
  jobId?: string;
  title: string;
  date: string;
  attachments?: Attachment[];
  meta?: Record<string, unknown>;
}): Promise<string> {
  const session = getSessionUser();
  await waitForPageImages();
  const pdf = await pagesToPdfBlob();
  const { assets, skippedVideos } = await freezeAttachments(opts.attachments ?? []);
  const now = nowISO();
  const id = generateId();
  const submission: Submission = {
    id,
    type: opts.type,
    sourceId: opts.sourceId,
    blastDayId: opts.blastDayId,
    jobId: opts.jobId,
    version: await nextSubmissionVersion(opts.sourceId, opts.type),
    title: opts.title,
    date: opts.date,
    submittedBy: session?.name ?? '',
    submittedByUserId: session?.id ?? '',
    pdf,
    assets,
    meta: skippedVideos.length ? { ...opts.meta, skippedVideos } : opts.meta,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.submissions.add(submission);
  return id;
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
