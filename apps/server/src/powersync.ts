// PowerSync integration: token minting and the ordered write path.
//
// The device's PowerSync SDK downloads its company's `records` rows via the
// PowerSync service (sync rules bucket on the token's cid claim) and uploads
// queued CRUD here. The server applies ops IN ARRIVAL ORDER inside one
// transaction — device clocks are irrelevant by construction.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

// Must match the HS256 JWKS entry in the PowerSync service config
// (infra/powersync/service.yaml locally; the deployed service config in prod).
const POWERSYNC_JWT_SECRET =
  process.env.POWERSYNC_JWT_SECRET ?? 'spike-shared-secret-for-local-dev-only';
const POWERSYNC_JWT_KID = process.env.POWERSYNC_JWT_KID ?? 'shotlog-spike';
/** Public URL of the PowerSync service, handed to clients with the token */
const POWERSYNC_URL = process.env.POWERSYNC_URL ?? 'http://localhost:8095';

export const powersyncRouter = Router();

powersyncRouter.get('/token', requireAuth, (req: AuthedRequest, res) => {
  const token = jwt.sign({ sub: req.userId, cid: req.companyId }, POWERSYNC_JWT_SECRET, {
    algorithm: 'HS256',
    audience: 'powersync',
    expiresIn: '1h',
    keyid: POWERSYNC_JWT_KID,
  });
  res.json({ token, endpoint: POWERSYNC_URL });
});

const uploadSchema = z.object({
  ops: z
    .array(
      z.object({
        op: z.enum(['PUT', 'PATCH', 'DELETE']),
        id: z.string().min(1),
        data: z
          .object({
            table_name: z.string().optional(),
            payload: z.string().optional(),
            updated_at: z.string().optional(),
          })
          .partial()
          .optional(),
      }),
    )
    .max(5000),
});

powersyncRouter.post('/upload', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid ops' });
    return;
  }
  const cid = req.companyId as string;
  const now = new Date().toISOString();

  try {
    await prisma.$transaction(async (tx) => {
      for (const op of parsed.data.ops) {
        if (op.op === 'PUT' || op.op === 'PATCH') {
          // PATCH carries ONLY changed columns — absent columns must keep
          // their stored values (COALESCE), never be defaulted.
          // Conflict target is the composite PK, so an identical id under
          // another company is a separate row, never a collision.
          await tx.$executeRaw`
            INSERT INTO "records" ("id", "company_id", "table_name", "payload", "updated_at")
            VALUES (${op.id}, ${cid}, ${op.data?.table_name ?? ''}, ${op.data?.payload ?? '{}'}, ${now})
            ON CONFLICT ("company_id", "id") DO UPDATE SET
              "table_name" = COALESCE(${op.data?.table_name ?? null}, "records"."table_name"),
              "payload"    = COALESCE(${op.data?.payload ?? null}, "records"."payload"),
              "updated_at" = ${now}`;
        } else {
          await tx.$executeRaw`
            DELETE FROM "records" WHERE "id" = ${op.id} AND "company_id" = ${cid}`;
        }
      }
    });
  } catch (err) {
    console.error('powersync upload failed:', err);
    // 500 keeps the client's CRUD queue intact; the SDK retries with backoff
    res.status(500).json({ error: 'upload failed' });
    return;
  }
  res.json({ ok: true });
});
