// PowerSync integration: token minting and the ordered write path.
//
// The device's PowerSync SDK downloads its company's `records` rows via the
// PowerSync service (sync rules bucket on the token's cid claim) and uploads
// queued CRUD here. The server applies ops IN ARRIVAL ORDER inside one
// transaction — device clocks are irrelevant by construction.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  canEditAcceptedDrillLog,
  canEditApproved,
  canPerformOp,
  canTransitionDrillLog,
  canTransitionStatus,
  APPROVAL_LOCKED_TABLES,
  LOCKED_DAY_STATUSES,
  PARENT_CHAIN,
  type Role,
} from '@shotlog/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';
import {
  deleteRecord,
  getRecord,
  parsePayloadSafe,
  upsertRecord,
  type StoredRecord,
} from './records.js';

// Must match the HS256 JWKS entry in the PowerSync service config
// (infra/powersync/service.yaml locally; the deployed service config in prod).
const POWERSYNC_JWT_SECRET =
  process.env.POWERSYNC_JWT_SECRET ?? 'spike-shared-secret-for-local-dev-only';
const POWERSYNC_JWT_KID = process.env.POWERSYNC_JWT_KID ?? 'shotlog-spike';
/** Public URL of the PowerSync service, handed to clients with the token */
const POWERSYNC_URL = process.env.POWERSYNC_URL ?? 'http://localhost:8095';
/** Token audience — PowerSync Cloud may expect the instance URL here */
const POWERSYNC_JWT_AUD = process.env.POWERSYNC_JWT_AUD ?? 'powersync';

export const powersyncRouter = Router();

powersyncRouter.get('/token', requireAuth, (req: AuthedRequest, res) => {
  // 12h (was 1h): the SDK re-fetches credentials on expiry, and every refetch
  // that hits a slow server response flips the stream to "disconnected" —
  // hourly flaps read as the app "going offline" in the field. The token only
  // authorizes sync for this user's company; 12h covers a full shift.
  const token = jwt.sign({ sub: req.userId, cid: req.companyId }, POWERSYNC_JWT_SECRET, {
    algorithm: 'HS256',
    audience: POWERSYNC_JWT_AUD,
    expiresIn: '12h',
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

/**
 * Batch-scoped view of stored records: caches lookups AND reflects writes
 * applied earlier in the same batch, so op N sees the state op N-1 created.
 */
class BatchRecords {
  private cache = new Map<string, StoredRecord | null>();
  constructor(
    private tx: Prisma.TransactionClient,
    private cid: string,
  ) {}

  async get(id: string): Promise<StoredRecord | null> {
    if (!this.cache.has(id)) this.cache.set(id, await getRecord(this.tx, this.cid, id));
    return this.cache.get(id) ?? null;
  }

  applied(id: string, tableName: string, payload: Record<string, unknown>): void {
    this.cache.set(id, { tableName, payload });
  }

  deleted(id: string): void {
    this.cache.set(id, null);
  }
}

/** Follow the parent chain from a record up to its owning blastDay id. */
async function resolveBlastDayId(
  tableName: string,
  ownPayload: Record<string, unknown>,
  batch: BatchRecords,
): Promise<string | null> {
  let current = tableName;
  let payload = ownPayload;
  for (let hops = 0; hops < 5; hops++) {
    const link = PARENT_CHAIN[current];
    if (!link) return null;
    const parentId = payload[link.parentIdField];
    if (typeof parentId !== 'string' || !parentId) return null;
    if (link.parentTable === 'blastDays') return parentId;
    const parent = await batch.get(parentId);
    if (!parent) return null;
    current = link.parentTable;
    payload = parent.payload;
  }
  return null;
}

powersyncRouter.post('/upload', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid ops' });
    return;
  }
  const cid = req.companyId as string;
  const role = (req.role ?? 'office') as Role;
  const now = new Date().toISOString();
  const discardedIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const batch = new BatchRecords(tx, cid);
      const blastDayStatus = new Map<string, string>();
      const statusOf = async (blastDayId: string): Promise<string> => {
        let s = blastDayStatus.get(blastDayId);
        if (s === undefined) {
          const day = await batch.get(blastDayId);
          s = (day?.payload.status as string | undefined) ?? 'draft';
          blastDayStatus.set(blastDayId, s);
        }
        return s;
      };
      const discard = (op: { id: string; op: string }, tableName: string, reason: string) => {
        discardedIds.push(op.id);
        console.warn(
          `[upload] discarded ${op.op} on ${tableName || '?'} (${op.id}) by ${req.userId} role=${role}: ${reason}`,
        );
      };

      for (const op of parsed.data.ops) {
        // PATCH may omit table_name; DELETE carries no data at all — the
        // stored row is the identity source for those.
        const stored = await batch.get(op.id);
        const tableName = op.data?.table_name ?? stored?.tableName ?? '';
        const incoming = parsePayloadSafe(op.data?.payload);
        // The record's effective payload after this op (PATCH replaces the
        // whole payload column when present; COALESCE keeps stored otherwise)
        const effective = op.data?.payload !== undefined ? incoming : (stored?.payload ?? {});

        if (op.op === 'DELETE' && !stored) continue; // deleting nothing — no-op

        // 1. table × op × role
        if (!canPerformOp(tableName, op.op, role)) {
          discard(op, tableName, 'role denied');
          continue;
        }

        // 1b. submissions are write-once: a PUT on an existing id is a
        // replay or a forgery — corrections come as NEW submissions (vN+1)
        if (tableName === 'submissions' && stored && op.op !== 'DELETE') {
          discard(op, tableName, 'submission is write-once');
          continue;
        }

        // 2. blastDay status transitions
        if (tableName === 'blastDays' && op.op !== 'DELETE') {
          const from = (stored?.payload.status as string | undefined) ?? 'draft';
          const to = (effective.status as string | undefined) ?? from;
          if (!canTransitionStatus(from, to, role)) {
            discard(op, tableName, `forbidden transition ${from}->${to}`);
            continue;
          }
          // Same-status edits to a FILED day are frozen for field roles —
          // the office copy and the live record must not silently diverge
          if (from === to && LOCKED_DAY_STATUSES.has(from) && !canEditApproved(role)) {
            discard(op, tableName, `day ${from} (locked)`);
            continue;
          }
          blastDayStatus.set(op.id, to);
        }

        // 2b. drill log status transitions (accept happens OFFLINE-capable
        // via the sync path — blasters may have no signal at the bench)
        if (tableName === 'drillLogs' && op.op !== 'DELETE') {
          const from = (stored?.payload.status as string | undefined) ?? 'open';
          const to = (effective.status as string | undefined) ?? from;
          if (!canTransitionDrillLog(from, to, role)) {
            discard(op, tableName, `forbidden drill-log transition ${from}->${to}`);
            continue;
          }
        }

        // 2c. hole rows freeze for drillers once their log is accepted
        if (tableName === 'drillLogHoles' && !canEditAcceptedDrillLog(role)) {
          const logId = (effective.drillLogId ?? stored?.payload.drillLogId) as
            | string
            | undefined;
          if (logId) {
            const log = await batch.get(logId);
            if (((log?.payload.status as string | undefined) ?? 'open') === 'accepted') {
              discard(op, tableName, 'drill log accepted (locked)');
              continue;
            }
          }
        }

        // 3. filed/approved lock on the blast-day family: children freeze
        // for field roles once the day is submitted to the office
        if (APPROVAL_LOCKED_TABLES.has(tableName) && !canEditApproved(role)) {
          const dayId = await resolveBlastDayId(tableName, effective, batch);
          if (dayId) {
            const status = await statusOf(dayId);
            if (LOCKED_DAY_STATUSES.has(status)) {
              discard(op, tableName, `blast day ${status} (locked)`);
              continue;
            }
          }
        }

        // 4. apply
        if (op.op === 'PUT' || op.op === 'PATCH') {
          await upsertRecord(tx, cid, op.id, op.data?.table_name ?? null, op.data?.payload ?? null, now);
          batch.applied(op.id, tableName, effective);
        } else {
          await deleteRecord(tx, cid, op.id);
          batch.deleted(op.id);
        }
      }
    });
  } catch (err) {
    console.error('powersync upload failed:', err);
    // 500 keeps the client's CRUD queue intact; the SDK retries with backoff.
    // Permission problems NEVER take this path — they are discarded above so
    // one forbidden op can't wedge the device's queue forever.
    res.status(500).json({ error: 'upload failed' });
    return;
  }
  res.json({ ok: true, discarded: discardedIds.length, discardedIds });
});
// NOTE: submissions immutability + LOCKED_DAY_STATUSES enforcement above
// require @shotlog/shared >= the build that exports LOCKED_DAY_STATUSES.
