// Online-only admin actions. These write the `records` table DIRECTLY
// (server is the system of record) and PowerSync fans the change out to
// every device — the caller gets an immediate, truthful success/error
// instead of an offline queue-and-hope.
import { Router, type Response } from 'express';
import { z } from 'zod';
import { canTransitionStatus, type Role } from '@shotlog/shared';
import { prisma } from './db.js';
import { requireAuth, requireRole, type AuthedRequest } from './auth.js';
import { getRecord, upsertRecord } from './records.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const statusSchema = z.object({ to: z.enum(['draft', 'submitted', 'approved']) });

/**
 * Blast day status transition (approve / send back / reopen).
 * Validated against the stored status so two supervisors acting at once
 * get a clean 409 instead of silently double-applying.
 */
adminRouter.post(
  '/blast-days/:id/status',
  requireRole('admin', 'supervisor'),
  async (req: AuthedRequest, res: Response) => {
    const parsed = statusSchema.safeParse(req.body);
    const id = req.params.id;
    if (!parsed.success || typeof id !== 'string') {
      res.status(400).json({ error: 'target status required' });
      return;
    }
    const cid = req.companyId as string;
    const role = req.role as Role;
    const to = parsed.data.to;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const stored = await getRecord(tx, cid, id);
        if (!stored || stored.tableName !== 'blastDays') {
          return { code: 404 as const, error: 'blast day not found' };
        }
        const from = (stored.payload.status as string | undefined) ?? 'draft';
        if (from === to) {
          return { code: 200 as const, status: to };
        }
        if (!canTransitionStatus(from, to, role)) {
          return { code: 409 as const, error: `can't go from ${from} to ${to}` };
        }
        const payload = JSON.stringify({
          ...stored.payload,
          status: to,
          updatedAt: new Date().toISOString(),
        });
        await upsertRecord(tx, cid, id, 'blastDays', payload, new Date().toISOString());
        return { code: 200 as const, status: to };
      });
      if (result.code !== 200) {
        res.status(result.code).json({ error: result.error });
        return;
      }
      res.json({ ok: true, status: result.status });
    } catch (err) {
      console.error('status transition failed:', err);
      res.status(500).json({ error: 'status change failed' });
    }
  },
);
