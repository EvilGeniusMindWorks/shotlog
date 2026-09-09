import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { TABLE_PERMISSIONS } from '@shotlog/shared';
import { authRouter, ensureAdminUser, requireAuth, requirePlatformAdmin } from './auth.js';
import { adminRouter } from './admin.js';
import { enrollRouter, invitesRouter } from './enrollment.js';
import { powersyncRouter } from './powersync.js';
import { filesRouter } from './files.js';
import { auditRouter } from './audit.js';
import { usersRouter } from './users.js';
import { feedbackRouter } from './feedback.js';
import { rehearsalRouter } from './rehearsal.js';
import { companiesRouter } from './companies.js';
import { emailEnabled } from './email.js';
import { filesConfigured } from './files.js';
import { countLegacyInlinePdfs, migrateLegacyInlinePdfs } from './legacyPdfs.js';
import { countLegacyInlineImages, migrateLegacyInlineImages } from './legacyImages.js';
import { seedCompanyReference } from './seed.js';
import { isProduction } from './env.js';

const app = express();
// Behind Railway's load balancer: trust the first proxy hop so req.ip is the
// real client (the rate limiters key on it) and secure-cookie logic is right
app.set('trust proxy', 1);
// Standard browser safety headers. The API serves JSON to a different origin,
// so resources must stay loadable cross-origin (helmet's default is same-origin).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// CORS: an explicit origin allowlist in production (ALLOWED_ORIGINS, comma
// separated; defaults to the Vercel app). Outside production every origin is
// allowed so local web (:5199) and harness contexts keep working.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors(
    isProduction() || allowedOrigins.length
      ? { origin: allowedOrigins.length ? allowedOrigins : ['https://shotlog-app.vercel.app'] }
      : {},
  ),
);
// Payloads carry base64 blobs (signatures, map snapshots, printout photos)
app.use(express.json({ limit: '30mb' }));

app.get('/health', async (_req, res) => {
  // Filed copies still carrying their PDF inline — watched reaching zero
  // after the boot migration (legacyPdfs.ts); null when the DB is unreachable
  const legacyInlinePdfs = await countLegacyInlinePdfs().catch(() => null);
  const legacyInlineImages = await countLegacyInlineImages().catch(() => null);
  // `tables` surfaces the permission matrix size — a cheap deploy marker
  // proving which @shotlog/shared build this server is running. `commit`
  // (Railway-injected) pins the exact build even when the matrix is
  // unchanged — rounds that touch only route code verify against it.
  res.json({
    ok: true,
    service: 'shotlog-sync',
    time: new Date().toISOString(),
    tables: Object.keys(TABLE_PERMISSIONS).length,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    // Truthful email status — the People page says "share the link" when
    // this is false instead of pretending an invite was emailed
    email: emailEnabled(),
    // Truthful file-storage status — Settings says where filed PDFs live
    files: filesConfigured(),
    // S10: is the sync token secret configured, or is the dev default in use?
    powersyncSecret: process.env.POWERSYNC_JWT_SECRET ? 'set' : 'default',
    production: isProduction(),
    legacyInlinePdfs,
    legacyInlineImages,
  });
});

// On-demand run of the inline-image move (platform admin) — the boot run
// covers production; this is for a re-run after storage is configured
app.post('/platform/migrations/inline-images', requireAuth, requirePlatformAdmin, async (_req, res) => {
  const result = await migrateLegacyInlineImages();
  res.json(result);
});

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/admin/invites', invitesRouter);
app.use('/enroll', enrollRouter);
app.use('/powersync', powersyncRouter);
app.use('/files', filesRouter);
app.use('/audit', auditRouter);
app.use('/users', usersRouter);
app.use('/feedback', feedbackRouter);
// Platform-level (vendor) routes — gated by the platform-admin marker, not
// by any company role. First occupant: rehearsal mode (Round S6).
app.use('/platform/rehearsal', rehearsalRouter);
app.use('/platform/companies', companiesRouter);

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await ensureAdminUser();
  await seedCompanyReference();
  app.listen(port, () => {
    console.log(`ShotLog sync server listening on :${port}`);
  });
  // Move legacy inline PDFs, then inline images, to file storage (idempotent, logs a summary)
  void migrateLegacyInlinePdfs()
    .catch((err) => console.error('[legacy-pdfs]', err))
    .then(() => migrateLegacyInlineImages())
    .catch((err) => console.error('[legacy-images]', err));
}

void main();
