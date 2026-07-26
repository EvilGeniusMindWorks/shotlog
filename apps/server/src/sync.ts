import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Pull: everything RECEIVED by the server since the client's last pull.
 * `since` compares against syncedAt (server receive time), NOT the record's
 * client updatedAt — a record created offline days ago and pushed today must
 * still reach devices that pulled yesterday. serverTime (returned below) is
 * the client's next `since`, so both sides use the server's clock.
 */
syncRouter.get('/changes', async (req: AuthedRequest, res: Response) => {
  const since = typeof req.query.since === 'string' ? new Date(req.query.since) : null;
  const records = await prisma.syncRecord.findMany({
    where: {
      companyId: req.companyId!,
      ...(since && !Number.isNaN(since.getTime()) ? { syncedAt: { gt: since } } : {}),
    },
    orderBy: { syncedAt: 'asc' },
    take: 5000,
  });
  res.json({
    records: records.map((r) => ({
      tableName: r.tableName,
      recordId: r.recordId,
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
      payload: r.payload,
    })),
    serverTime: new Date().toISOString(),
  });
});

/**
 * Diagnostics: what the server currently holds for this company, per table.
 * Lets any device verify from the field whether a record actually arrived.
 */
syncRouter.get('/stats', async (req: AuthedRequest, res: Response) => {
  const rows = await prisma.syncRecord.groupBy({
    by: ['tableName'],
    where: { companyId: req.companyId!, deletedAt: null },
    _count: { recordId: true },
    _max: { syncedAt: true },
  });
  res.json({
    tables: rows.map((r) => ({
      tableName: r.tableName,
      count: r._count.recordId,
      lastReceived: r._max.syncedAt?.toISOString() ?? null,
    })),
    serverTime: new Date().toISOString(),
  });
});

const pushSchema = z.object({
  records: z
    .array(
      z.object({
        tableName: z.string().min(1).max(64),
        recordId: z.string().min(1).max(128),
        updatedAt: z.string().datetime(),
        deletedAt: z.string().datetime().nullable().optional(),
        payload: z.unknown(),
      }),
    )
    .max(1000),
});

/**
 * Push: last-write-wins upsert. A record is accepted when the incoming
 * client updatedAt is >= the stored one; otherwise it's reported stale so
 * the client can pull the newer copy.
 */
syncRouter.post('/push', async (req: AuthedRequest, res: Response) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid push payload', details: parsed.error.issues.slice(0, 3) });
    return;
  }
  const companyId = req.companyId!;
  const accepted: { tableName: string; recordId: string }[] = [];
  const stale: { tableName: string; recordId: string; serverUpdatedAt: string }[] = [];

  for (const record of parsed.data.records) {
    const incomingAt = new Date(record.updatedAt);
    const existing = await prisma.syncRecord.findUnique({
      where: {
        companyId_tableName_recordId: {
          companyId,
          tableName: record.tableName,
          recordId: record.recordId,
        },
      },
    });
    if (existing && existing.updatedAt > incomingAt) {
      stale.push({
        tableName: record.tableName,
        recordId: record.recordId,
        serverUpdatedAt: existing.updatedAt.toISOString(),
      });
      continue;
    }
    await prisma.syncRecord.upsert({
      where: {
        companyId_tableName_recordId: {
          companyId,
          tableName: record.tableName,
          recordId: record.recordId,
        },
      },
      create: {
        companyId,
        tableName: record.tableName,
        recordId: record.recordId,
        updatedAt: incomingAt,
        deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
        payload: record.payload as object,
      },
      update: {
        updatedAt: incomingAt,
        deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
        payload: record.payload as object,
        syncedAt: new Date(),
      },
    });
    accepted.push({ tableName: record.tableName, recordId: record.recordId });
  }

  res.json({ accepted, stale, serverTime: new Date().toISOString() });
});
