import express from 'express';
import cors from 'cors';
import { TABLE_PERMISSIONS } from '@shotlog/shared';
import { authRouter, ensureAdminUser } from './auth.js';
import { adminRouter } from './admin.js';
import { enrollRouter, invitesRouter } from './enrollment.js';
import { powersyncRouter } from './powersync.js';
import { filesRouter } from './files.js';
import { auditRouter } from './audit.js';
import { usersRouter } from './users.js';
import { feedbackRouter } from './feedback.js';
import { rehearsalRouter } from './rehearsal.js';
import { emailEnabled } from './email.js';
import { filesConfigured } from './files.js';
import { countLegacyInlinePdfs, migrateLegacyInlinePdfs } from './legacyPdfs.js';
import { seedCompanyReference } from './seed.js';

const app = express();
app.use(cors());
// Payloads carry base64 blobs (signatures, map snapshots, printout photos)
app.use(express.json({ limit: '30mb' }));

app.get('/health', async (_req, res) => {
  // Filed copies still carrying their PDF inline — watched reaching zero
  // after the boot migration (legacyPdfs.ts); null when the DB is unreachable
  const legacyInlinePdfs = await countLegacyInlinePdfs().catch(() => null);
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
    legacyInlinePdfs,
  });
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

const port = Number(process.env.PORT ?? 4000);

async function main() {
  await ensureAdminUser();
  await seedCompanyReference();
  app.listen(port, () => {
    console.log(`ShotLog sync server listening on :${port}`);
  });
  // Move legacy inline PDFs to file storage (idempotent, logs a summary)
  void migrateLegacyInlinePdfs().catch((err) => console.error('[legacy-pdfs]', err));
}

void main();
