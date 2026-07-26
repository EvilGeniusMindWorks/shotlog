import express from 'express';
import cors from 'cors';
import { buildProductCatalogSeed } from '@shotlog/shared';
import { prisma } from './db.js';
import { authRouter, ensureAdminUser } from './auth.js';
import { adminRouter } from './admin.js';
import { powersyncRouter } from './powersync.js';
import { usersRouter } from './users.js';

const app = express();
app.use(cors());
// Payloads carry base64 blobs (signatures, map snapshots, printout photos)
app.use(express.json({ limit: '30mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'shotlog-sync', time: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/powersync', powersyncRouter);
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

async function main() {
  await ensureAdminUser();
  await ensureCatalogSeed();
  app.listen(port, () => {
    console.log(`ShotLog sync server listening on :${port}`);
  });
}

void main();
