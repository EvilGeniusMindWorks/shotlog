// Per-company reference data (catalog + manufacturers). Runs for every
// company at boot and for a single company when the platform creates one
// (rehearsal sandbox today; tenant onboarding later). Idempotent.
import { buildProductCatalogSeed, slugify } from '@shotlog/shared';
import { prisma } from './db.js';

/**
 * Seed the product catalog per company (server-side, once). Devices get
 * the catalog via sync; client-side seeding is gone — field roles can't
 * write productCatalog anyway.
 */
async function ensureCatalogSeed(companyId?: string): Promise<void> {
  const companies = companyId
    ? [{ id: companyId }]
    : await prisma.company.findMany({ select: { id: true } });
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
async function ensureManufacturers(companyId?: string): Promise<void> {
  const companies = companyId
    ? [{ id: companyId }]
    : await prisma.company.findMany({ select: { id: true } });
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

/** Catalog + manufacturers for one company, or for all when omitted */
export async function seedCompanyReference(companyId?: string): Promise<void> {
  await ensureCatalogSeed(companyId);
  await ensureManufacturers(companyId);
}
