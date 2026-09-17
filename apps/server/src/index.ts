import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { TABLE_PERMISSIONS } from '@shotlog/shared';
import { authRouter, ensureAdminUser, requireAuth, requirePlatformAdmin, type AuthedRequest } from './auth.js';
import { prisma } from './db.js';
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
import { adoptStrandedFilings, countStrandedFilings } from './strandedFilings.js';
import { seedCompanyReference } from './seed.js';
import { isProduction } from './env.js';
import { recordServerCrash } from './feedback.js';
import { forgetMaps } from './crash.js';
import { z } from 'zod';

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
  // S20: filed copies whose PDF is in storage but whose record still says
  // "device", or whose photos are not yet pointed at — watched reaching zero
  const strandedFilings = await countStrandedFilings().catch(() => null);
  const sourcemaps = await prisma.sourceMap
    .findFirst({ orderBy: { createdAt: 'desc' }, select: { buildId: true, createdAt: true } })
    .then(async (latest) => ({
      latestBuild: latest?.buildId ?? null,
      uploadedAt: latest?.createdAt ?? null,
      files: latest ? await prisma.sourceMap.count({ where: { buildId: latest.buildId } }) : 0,
    }))
    .catch(() => null);
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
    strandedFilings,
    // S11: are crash traces decodable? The web build uploads its source maps
    // (scripts/build-web.mjs); this shows the newest build that has them.
    sourcemaps,
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

// ── S11: crash reporting without a vendor ────────────────────────────────────
// The web build uploads its source maps here (scripts/build-web.mjs, bearer
// SOURCEMAP_TOKEN) so minified traces decode to real files and lines.
// Maps are never served; a build's set replaces the previous one.
const sourcemapSchema = z.object({
  buildId: z.string().min(1).max(64),
  files: z.array(z.object({ file: z.string().min(1).max(200), map: z.string().max(30_000_000) })).max(200),
});
app.post('/platform/sourcemaps', async (req, res) => {
  const token = process.env.SOURCEMAP_TOKEN;
  const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token || given !== token) {
    res.status(401).json({ error: 'sourcemap token' });
    return;
  }
  const parsed = sourcemapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid sourcemaps' });
    return;
  }
  const { buildId, files } = parsed.data;
  for (const f of files) {
    await prisma.sourceMap.upsert({
      where: { id: `${buildId}/${f.file}` },
      create: { id: `${buildId}/${f.file}`, buildId, file: f.file, map: f.map },
      update: { map: f.map },
    });
  }
  forgetMaps(buildId);
  // Keep the last 40 builds' maps; older ones cannot be matched to a device any more
  const builds = await prisma.sourceMap.findMany({ distinct: ['buildId'], select: { buildId: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  const stale = builds.slice(40).map((b: { buildId: string }) => b.buildId);
  if (stale.length) await prisma.sourceMap.deleteMany({ where: { buildId: { in: stale } } });
  console.log(`[sourcemaps] ${files.length} map(s) for build ${buildId}`);
  res.json({ ok: true, files: files.length });
});
// Platform admin: throw on purpose to prove the inbox catches server failures
app.post('/platform/crash-test', requireAuth, requirePlatformAdmin, (_req, _res) => {
  throw new Error('Crash test from Admin (S11)');
});

// The API's first catch-all (S11): a failure in any route becomes a crash
// line in Admin › Feedback › Crashes with a report code, instead of a log
// line nobody reads. Must be registered after every router.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void recordServerCrash(err, { method: req.method, originalUrl: req.originalUrl, userId: (req as AuthedRequest).userId }).then((code) => {
    if (res.headersSent) return;
    res.status(500).json({ error: 'server error', reportCode: code });
  });
});
process.on('unhandledRejection', (reason) => {
  void recordServerCrash(reason);
});
process.on('uncaughtException', (err) => {
  void recordServerCrash(err).finally(() => {
    console.error('[crash] uncaught exception — exiting so the host restarts', err);
    process.exit(1);
  });
});

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
    .catch((err) => console.error('[legacy-images]', err))
    // S20: then adopt filed copies whose bytes reached storage but whose record never said so
    .then(() => adoptStrandedFilings())
    .catch((err) => console.error('[stranded-filings]', err));
}

void main();
