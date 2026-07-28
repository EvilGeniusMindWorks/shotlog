// Attachment binaries live in Cloudflare R2 (S3-compatible), NOT in Postgres:
// sync records carry metadata + checksum only; the browser PUTs/GETs blobs
// directly against short-lived presigned URLs, company-scoped by key prefix.
import { Router } from 'express';
import { z } from 'zod';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth, type AuthedRequest } from './auth.js';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET = process.env.R2_BUCKET ?? '';

/** Max binary accepted into object storage (photos, PDFs, clips — never full videos) */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const configured = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

const s3 = configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null;

/** Keys are safe, deterministic, and always under the caller's company prefix */
function sanitizeFileName(name: string): string {
  return (name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
}

export const filesRouter = Router();

filesRouter.get('/status', requireAuth, (_req, res) => {
  res.json({ configured });
});

const presignUploadSchema = z.object({
  attachmentId: z.string().min(1).max(64),
  fileName: z.string().max(256),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive(),
});

filesRouter.post('/presign-upload', requireAuth, async (req: AuthedRequest, res) => {
  if (!s3) {
    res.status(503).json({ error: 'file storage not configured' });
    return;
  }
  const parsed = presignUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid presign request' });
    return;
  }
  const { attachmentId, fileName, mimeType, size } = parsed.data;
  if (size > MAX_FILE_BYTES) {
    res.status(413).json({ error: `file too large (max ${MAX_FILE_BYTES} bytes)` });
    return;
  }
  const key = `c/${req.companyId}/a/${attachmentId}/${sanitizeFileName(fileName)}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn: 15 * 60 },
  );
  res.json({ url, key });
});

const presignDownloadSchema = z.object({ key: z.string().min(1).max(512) });

filesRouter.post('/presign-download', requireAuth, async (req: AuthedRequest, res) => {
  if (!s3) {
    res.status(503).json({ error: 'file storage not configured' });
    return;
  }
  const parsed = presignDownloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid download request' });
    return;
  }
  // Company scoping: a key outside the caller's prefix is someone else's file
  if (!parsed.data.key.startsWith(`c/${req.companyId}/`)) {
    res.status(403).json({ error: 'not your file' });
    return;
  }
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: parsed.data.key }),
    { expiresIn: 60 * 60 },
  );
  res.json({ url });
});
