// Images that still ride INSIDE synced records (2026-09-08): raw seismograph
// printout captures on seismoReadings (four of them were 13.7 MB of an
// 18.8 MB company) and the pre-R2 attachments whose binary sits in `data`.
// Every device downloads all of them on every first sync — that was 96 % of
// the company's sync volume. Same move as the legacy PDFs: bytes to file
// storage under the key the app's own uploader would have used, a pointer
// in the record, checksum and size kept. A printout becomes a proper
// `attachments` record (kind photo, parentType seismo_reading) and the
// reading points at it — exactly what a new capture produces on a device.
//
// Runs at boot when file storage is configured (idempotent) and on demand
// at POST /platform/migrations/inline-images. Reported on /health as
// `legacyInlineImages`.
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { filesConfigured, putObjectDirect, submissionObjectKey } from './files.js';
import { upsertRecord } from './records.js';

interface BlobMarker {
  __blob: string;
  __type?: string;
}
const isMarker = (v: unknown): v is BlobMarker =>
  typeof v === 'object' && v !== null && typeof (v as { __blob?: unknown }).__blob === 'string';

const PRINTOUT_WHERE = `table_name = 'seismoReadings' AND payload::jsonb -> 'printoutImage' ->> '__blob' IS NOT NULL`;
const ATTACHMENT_WHERE = `table_name = 'attachments' AND payload::jsonb -> 'data' ->> '__blob' IS NOT NULL`;

export async function countLegacyInlineImages(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
    `SELECT (SELECT count(*) FROM records WHERE ${PRINTOUT_WHERE}) + (SELECT count(*) FROM records WHERE ${ATTACHMENT_WHERE}) AS n`,
  );
  return Number(rows[0]?.n ?? 0);
}

const extOf = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('heic') ? 'heic' : 'jpg');

export interface LegacyImageMigration {
  candidates: number;
  moved: number;
  bytes: number;
  failed: number;
  skipped: string | null;
}

export async function migrateLegacyInlineImages(log: (msg: string) => void = console.log): Promise<LegacyImageMigration> {
  const out: LegacyImageMigration = { candidates: 0, moved: 0, bytes: 0, failed: 0, skipped: null };
  if (!filesConfigured()) {
    out.skipped = 'file storage not configured';
    log(`[legacy-images] ${out.skipped} — nothing moved`);
    return out;
  }

  // 1. Seismograph printouts → an attachment record + R2, reading points at it
  const readings = await prisma.$queryRawUnsafe<{ id: string; company_id: string; payload: string }[]>(
    `SELECT id, company_id, payload FROM records WHERE ${PRINTOUT_WHERE}`,
  );
  out.candidates += readings.length;
  for (const r of readings) {
    try {
      const p = JSON.parse(r.payload) as Record<string, unknown>;
      if (!isMarker(p.printoutImage)) continue;
      const bytes = Buffer.from(p.printoutImage.__blob, 'base64');
      const mime = p.printoutImage.__type || 'image/jpeg';
      const attachmentId = `seismo-photo-${r.id}`;
      const fileName = `printout-graph-${String(p.graphNumber ?? '')}.${extOf(mime)}`;
      const key = submissionObjectKey(r.company_id, attachmentId, fileName);
      await putObjectDirect(key, bytes, mime);
      out.bytes += bytes.length;
      const now = new Date().toISOString();
      const attachment = {
        id: attachmentId,
        parentId: r.id,
        parentType: 'seismo_reading',
        fileName,
        mimeType: mime,
        data: null,
        kind: 'photo',
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        storageKey: key,
        storageStatus: 'stored',
        originName: typeof p.operator === 'string' && p.operator ? p.operator : undefined,
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
        updatedAt: now,
        syncStatus: 'synced',
      };
      const next = { ...p, printoutImage: null, printoutAttachmentId: attachmentId, updatedAt: now };
      await prisma.$transaction(async (tx) => {
        await upsertRecord(tx, r.company_id, attachmentId, 'attachments', JSON.stringify(attachment), now);
        await tx.$executeRawUnsafe(
          `UPDATE records SET payload = $1, updated_at = $2 WHERE company_id = $3 AND id = $4 AND table_name = 'seismoReadings'`,
          JSON.stringify(next),
          now,
          r.company_id,
          r.id,
        );
      });
      out.moved++;
    } catch (err) {
      out.failed++;
      log(`[legacy-images] reading ${r.id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  // 2. Legacy attachments with the binary inline → R2 pointer
  const attachments = await prisma.$queryRawUnsafe<{ id: string; company_id: string; payload: string }[]>(
    `SELECT id, company_id, payload FROM records WHERE ${ATTACHMENT_WHERE}`,
  );
  out.candidates += attachments.length;
  for (const a of attachments) {
    try {
      const p = JSON.parse(a.payload) as Record<string, unknown>;
      if (!isMarker(p.data)) continue;
      const bytes = Buffer.from(p.data.__blob, 'base64');
      const mime = (typeof p.mimeType === 'string' && p.mimeType) || p.data.__type || 'application/octet-stream';
      const fileName = (typeof p.fileName === 'string' && p.fileName) || `${a.id}.${extOf(mime)}`;
      const key = submissionObjectKey(a.company_id, a.id, fileName);
      await putObjectDirect(key, bytes, mime);
      out.bytes += bytes.length;
      const now = new Date().toISOString();
      const next = {
        ...p,
        data: null,
        size: typeof p.size === 'number' ? p.size : bytes.length,
        sha256: typeof p.sha256 === 'string' ? p.sha256 : createHash('sha256').update(bytes).digest('hex'),
        storageKey: key,
        storageStatus: 'stored',
        updatedAt: now,
      };
      await prisma.$executeRawUnsafe(
        `UPDATE records SET payload = $1, updated_at = $2 WHERE company_id = $3 AND id = $4 AND table_name = 'attachments'`,
        JSON.stringify(next),
        now,
        a.company_id,
        a.id,
      );
      out.moved++;
    } catch (err) {
      out.failed++;
      log(`[legacy-images] attachment ${a.id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  log(`[legacy-images] moved ${out.moved}/${out.candidates} image(s), ${(out.bytes / 1048576).toFixed(1)} MB to storage${out.failed ? `, ${out.failed} failed` : ''}`);
  return out;
}
