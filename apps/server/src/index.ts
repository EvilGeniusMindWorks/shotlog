import express from 'express';
import cors from 'cors';
import { TABLE_PERMISSIONS, buildProductCatalogSeed, slugify } from '@shotlog/shared';
import { prisma } from './db.js';
import { authRouter, ensureAdminUser } from './auth.js';
import { adminRouter } from './admin.js';
import { enrollRouter, invitesRouter } from './enrollment.js';
import { powersyncRouter } from './powersync.js';
import { filesRouter } from './files.js';
import { auditRouter } from './audit.js';
import { usersRouter } from './users.js';

const app = express();
app.use(cors());
// Payloads carry base64 blobs (signatures, map snapshots, printout photos)
app.use(express.json({ limit: '30mb' }));

app.get('/health', (_req, res) => {
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

const port = Number(process.env.PORT ?? 4000);

/**
 * Seed the product catalog per company (server-side, once). Devices get
 * the catalog via sync; client-side seeding is gone — field roles can't
 * write productCatalog anyway.
 */
async function ensureCatalogSeed(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true } });
  const now = new Date().toISOString();
  for (const company of companies) {
    const count = await prisma.record.count({
      where: { companyId: company.id, tableName: 'productCatalog' },
    });
    if (count > 0) continue;
    const docs = buildProductCatalogSeed(now);
    await prisma.record.createMany({
      data: docs.map((d) => ({
        id: d.id,
        companyId: company.id,
        tableName: 'productCatalog',
        payload: JSON.stringify(d),
        updatedAt: now,
      })),
    });
    console.log(`Seeded ${docs.length} catalog products for company ${company.id}`);
  }
}

/**
 * Backfill manufacturer records from distinct catalog product names and
 * stamp manufacturerId on products missing it. Idempotent, per company.
 */
async function ensureManufacturers(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true } });
  const now = new Date().toISOString();
  for (const company of companies) {
    const products = await prisma.record.findMany({
      where: { companyId: company.id, tableName: 'productCatalog' },
    });
    const existing = new Set(
      (
        await prisma.record.findMany({
          where: { companyId: company.id, tableName: 'manufacturers' },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    const wanted = new Map<string, string>(); // id -> name
    let stamped = 0;
    for (const row of products) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const name = (payload.manufacturer as string | undefined)?.trim();
      if (!name) continue;
      const mfrId = `mfr-${slugify(name)}`;
      wanted.set(mfrId, name);
      if (payload.manufacturerId !== mfrId) {
        payload.manufacturerId = mfrId;
        await prisma.record.update({
          where: { companyId_id: { companyId: company.id, id: row.id } },
          data: { payload: JSON.stringify(payload), updatedAt: now },
        });
        stamped++;
      }
    }
    let created = 0;
    let sortOrder = 0;
    for (const [id, name] of [...wanted.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
      if (existing.has(id)) {
        sortOrder++;
        continue;
      }
      await prisma.record.create({
        data: {
          id,
          companyId: company.id,
          tableName: 'manufacturers',
          payload: JSON.stringify({
            id,
            name,
            isActive: true,
            sortOrder: sortOrder++,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'synced',
          }),
          updatedAt: now,
        },
      });
      created++;
    }
    if (created || stamped) {
      console.log(
        `Manufacturers backfill for ${company.id}: ${created} created, ${stamped} products stamped`,
      );
    }
  }
}

async function main() {
  await ensureAdminUser();
  await ensureCatalogSeed();
  await ensureManufacturers();
  app.listen(port, () => {
    console.log(`ShotLog sync server listening on :${port}`);
  });
}

void main();
