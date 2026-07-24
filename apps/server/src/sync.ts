import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export const syncRouter = Router();
syncRouter.use(requireAuth);

/**
 * Pull: everything changed since the client's last sync.
 * `since` is the client's LWW clock (ISO); omitted = full pull.
 */
syncRouter.get('/changes', async (req: AuthedRequest, res) => {
  const since = typeof req.query.since === 'string' ? new Date(req.query.since) : null;
  const records = await prisma.syncRecord.findMany({
    where: {
      userId: req.userId!,
      ...(since && !Number.isNaN(since.getTime()) ? { updatedAt: { gt: since } } : {}),
    },
    orderBy: { updatedAt: 'asc' },
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
syncRouter.post('/push', async (req: AuthedRequest, res) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid push payload', details: parsed.error.issues.slice(0, 3) });
    return;
  }
  const userId = req.userId!;
  const accepted: { tableName: string; recordId: string }[] = [];
  const stale: { tableName: string; recordId: string; serverUpdatedAt: string }[] = [];

  for (const record of parsed.data.records) {
    const incomingAt = new Date(record.updatedAt);
    const existing = await prisma.syncRecord.findUnique({
      where: {
        userId_tableName_recordId: {
          userId,
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
        userId_tableName_recordId: {
          userId,
          tableName: record.tableName,
          recordId: record.recordId,
        },
      },
      create: {
        userId,
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
