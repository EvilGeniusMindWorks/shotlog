// Audit trail reads for the office: per-record timelines, the searchable
// company-wide log, and the actor list for filters. Append-only data —
// there are deliberately no write or delete endpoints here.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, requireRole, type AuthedRequest } from './auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('admin', 'office', 'supervisor'));

const recordsSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(300) });

/** Timeline for a set of records (a day + its children) — newest first */
auditRouter.post('/records', async (req: AuthedRequest, res) => {
  const parsed = recordsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ids required (max 300)' });
    return;
  }
  const entries = await prisma.auditEntry.findMany({
    where: { companyId: req.companyId, recordId: { in: parsed.data.ids } },
    orderBy: { at: 'desc' },
    take: 2000,
  });
  res.json({ entries });
});

const querySchema = z.object({
  from: z.string().optional(), // ISO date (inclusive)
  to: z.string().optional(), // ISO date (inclusive)
  actorId: z.string().optional(),
  tableName: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(200).default(100),
});

/** Company-wide audit log, newest first, cursor-paginated */
auditRouter.get('/', async (req: AuthedRequest, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid audit query' });
    return;
  }
  const { from, to, actorId, tableName, cursor, take } = parsed.data;
  const entries = await prisma.auditEntry.findMany({
    where: {
      companyId: req.companyId,
      ...(actorId ? { actorId } : {}),
      ...(tableName ? { tableName } : {}),
      at: {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      },
    },
    orderBy: { at: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = entries.slice(0, take);
  res.json({
    entries: page,
    nextCursor: entries.length > take ? page[page.length - 1]?.id : undefined,
  });
});

/** Distinct actors for the filter dropdown */
auditRouter.get('/actors', async (req: AuthedRequest, res) => {
  const actors = await prisma.auditEntry.groupBy({
    by: ['actorId', 'actorName'],
    where: { companyId: req.companyId },
  });
  res.json({ actors: actors.map((a) => ({ id: a.actorId, name: a.actorName })) });
});
