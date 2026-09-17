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
  STATUS_GUARDED_TABLES,
  buildRoleDefsLookup,
  canEditAcceptedDrillLogAs,
  canEditApprovedAs,
  canApproveTimeCardsAs,
  canPerformOpAs,
  canTransitionDrillLogAs,
  canTransitionRecordStatusAs,
  canTransitionStatusAs,
  diffPayloads,
  APPROVAL_LOCKED_TABLES,
  LIFECYCLE_CHILDREN,
  LOCKED_DAY_STATUSES,
  NEVER_USED_DELETE_TABLES,
  PARENT_CHAIN,
  CARD_PATHS,
  cardValuesEqual,
  getPath,
  isBlastingWork,
  isCardPath,
  withPath,
  type RoleDefsLookup,
} from '@shotlog/shared';
import { randomUUID } from 'node:crypto';
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
import { isProduction } from './env.js';

// Must match the HS256 JWKS entry in the PowerSync service config
// (infra/powersync/service.yaml locally; the deployed service config in prod).
if (!process.env.POWERSYNC_JWT_SECRET) {
  // A missing secret must never silently sign production sync tokens with the
  // dev value (S10): refuse to start under NODE_ENV=production, and shout on
  // Railway either way (/health also reports powersyncSecret: 'default')
  if (process.env.NODE_ENV === 'production') throw new Error('POWERSYNC_JWT_SECRET env var is required in production');
  if (isProduction()) console.error('POWERSYNC_JWT_SECRET is not set — signing sync tokens with the dev default');
}
const POWERSYNC_JWT_SECRET =
  process.env.POWERSYNC_JWT_SECRET ?? 'spike-shared-secret-for-local-dev-only';
const POWERSYNC_JWT_KID = process.env.POWERSYNC_JWT_KID ?? 'shotlog-spike';
/** Public URL of the PowerSync service, handed to clients with the token */
const POWERSYNC_URL = process.env.POWERSYNC_URL ?? 'http://localhost:8095';
/** Token audience — PowerSync Cloud may expect the instance URL here */
const POWERSYNC_JWT_AUD = process.env.POWERSYNC_JWT_AUD ?? 'powersync';

/** Tables that must stay 1:1 with their parent (audit finding: offline
 *  read-then-create races could produce invisible duplicates). */
const ONE_PER_PARENT: Record<string, string> = {
  blastLogs: 'blastDayId',
  dailyReports: 'blastDayId',
  explosiveUsages: 'blastLogId',
};

/** Plain words for the day family, for the notices a device shows (S13) */
/** The one post-file change a filed copy allows: where its binaries live */
const STORAGE_POINTER_FIELDS = new Set(['storageStatus', 'pdfKey', 'assetKeys', 'pdf', 'updatedAt', 'syncStatus']);

/** S16 "Change the date": the papers that carry the day's date, and the
 *  only fields a move may touch on them */
const MOVE_DATE_TABLES = new Set(['drillLogs', 'drillLogHoles', 'timeCards', 'drillChecklists', 'dayReminders']);
const MOVE_DATE_FIELDS = new Set(['date', 'blastDayId', 'updatedAt', 'syncStatus']);
interface MoveInfo {
  blastDayId: string;
  jobId: string;
  fromDate: string;
  toDate: string;
  moveChecklists: boolean;
}

const TABLE_LABEL: Record<string, string> = {
  blastDays: 'work day',
  blastLogs: 'blasting log',
  dailyReports: 'daily report',
  explosiveUsages: 'explosives list',
  shots: 'shot',
  seismoReadings: 'seismo reading',
  typicalColumns: 'typical column',
  drillLogs: 'drill log',
  drillLogHoles: 'drill log hole',
  workForceEntries: 'crew row',
  equipmentEntries: 'equipment row',
  materialEntries: 'materials row',
  subcontractorEntries: 'subcontractor row',
  workDayConfirmations: 'confirmation',
  dayCardEdits: 'card change',
  dayReminders: 'reminder',
  dayMoves: 'date change',
};

type CardSetRow = { v: number; by: string; byName: string; at: string };

export const powersyncRouter = Router();

powersyncRouter.get('/token', requireAuth, async (req: AuthedRequest, res) => {
  // S8c: a person moved to another company (go-live) still holds an access
  // token for the old one for up to an hour — refuse to sync it, the device
  // signs in once and downloads the new company
  const user = await prisma.user.findUnique({ where: { id: req.userId as string }, select: { companyId: true } });
  if (!user || user.companyId !== req.companyId) {
    res.status(401).json({ error: 'company_moved' });
    return;
  }
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
  // May be a CUSTOM role key — every check below resolves it through the
  // company's role definitions (capability layer), built-ins as fallback
  const role = req.role ?? 'office';
  const now = new Date().toISOString();
  const discardedIds: string[] = [];
  /** S13: honest words for discards that are NOT a role denial — a race
   *  someone else won, a parent deleted meanwhile, a guard that refused */
  const notices: { id: string; kind: 'race' | 'refused' | 'child'; text: string }[] = [];

  // Audit actor: name resolved once per request (JWT carries only the id)
  const actorId = req.userId as string;
  const actorName =
    (await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ??
    actorId;
  const audits: Prisma.AuditEntryCreateManyInput[] = [];
  const audit = (
    recordId: string,
    tableName: string,
    op: string,
    changes: unknown,
    reason?: string,
  ) => {
    audits.push({
      companyId: cid,
      tableName: tableName || '?',
      recordId,
      op,
      actorId,
      actorName,
      actorRole: role,
      changes: changes as Prisma.InputJsonValue,
      reason,
    });
  };

  try {
    await prisma.$transaction(async (tx) => {
      const batch = new BatchRecords(tx, cid);
      // The company's role definitions, loaded once per batch — permission
      // checks resolve custom/edited roles through these (admin protected,
      // built-ins the fallback when a role has no definition record)
      const defRows = await tx.record.findMany({
        where: { companyId: cid, tableName: 'roleDefinitions' },
        select: { payload: true },
      });
      const roleDefs: RoleDefsLookup = buildRoleDefsLookup(
        defRows.map((r) => parsePayloadSafe(r.payload)),
      );
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
      const discardedInBatch = new Set<string>();
      const discard = (
        op: { id: string; op: string },
        tableName: string,
        reason: string,
        notice?: { kind: 'race' | 'refused' | 'child'; text: string },
      ) => {
        discardedIds.push(op.id);
        discardedInBatch.add(op.id);
        if (notice) notices.push({ id: op.id, ...notice });
        // Refused writes are part of the audit record too
        audit(op.id, tableName, 'DISCARD', [], reason);
        console.warn(
          `[upload] discarded ${op.op} on ${tableName || '?'} (${op.id}) by ${req.userId} role=${role}: ${reason}`,
        );
      };

      // S16: the "Change the date" rows in this batch, by day and by job+date.
      // A date-only change on one of the day's papers is allowed when a move
      // row says so — in this batch or already stored — whoever wrote it.
      const movesByDay = new Map<string, MoveInfo>();
      const movesByJobDate = new Map<string, MoveInfo>();
      for (const o of parsed.data.ops) {
        if (o.op === 'PUT' && o.data?.table_name === 'dayMoves' && o.data.payload) {
          const m = parsePayloadSafe(o.data.payload) as Record<string, unknown>;
          const info: MoveInfo = {
            blastDayId: String(m.blastDayId ?? ''),
            jobId: String(m.jobId ?? ''),
            fromDate: String(m.fromDate ?? ''),
            toDate: String(m.toDate ?? ''),
            moveChecklists: Boolean(m.moveChecklists),
          };
          if (info.blastDayId) movesByDay.set(info.blastDayId, info);
          if (info.jobId && info.fromDate) movesByJobDate.set(`${info.jobId}|${info.fromDate}`, info);
        }
      }
      const storedMove = async (dayId: string | undefined, jobId: string | undefined, fromDate: string | undefined, toDate: string): Promise<MoveInfo | null> => {
        const rows = await tx.$queryRaw<{ payload: string }[]>`
          SELECT "payload" FROM "records"
          WHERE "company_id" = ${cid} AND "table_name" = 'dayMoves'
            AND ("payload"::jsonb ->> 'toDate') = ${toDate}
            AND (("payload"::jsonb ->> 'blastDayId') = ${dayId ?? ''}
                 OR (("payload"::jsonb ->> 'jobId') = ${jobId ?? ''} AND ("payload"::jsonb ->> 'fromDate') = ${fromDate ?? ''}))
          ORDER BY "updated_at" DESC LIMIT 1`;
        if (rows.length === 0) return null;
        const m = parsePayloadSafe(rows[0].payload) as Record<string, unknown>;
        return { blastDayId: String(m.blastDayId ?? ''), jobId: String(m.jobId ?? ''), fromDate: String(m.fromDate ?? ''), toDate: String(m.toDate ?? ''), moveChecklists: Boolean(m.moveChecklists) };
      };
      const moveAuthorises = async (table: string, before: Record<string, unknown>, newDate: string): Promise<boolean> => {
        let dayId = before.blastDayId as string | undefined;
        let jobId = before.jobId as string | undefined;
        const fromDate = before.date as string | undefined;
        if (table === 'drillLogHoles') {
          const log = before.drillLogId ? await batch.get(before.drillLogId as string) : null;
          dayId = log?.payload.blastDayId as string | undefined;
          jobId = log?.payload.jobId as string | undefined;
        }
        const inBatch = (dayId && movesByDay.get(dayId)) || (jobId && fromDate && movesByJobDate.get(`${jobId}|${fromDate}`)) || null;
        const move = inBatch && inBatch.toDate === newDate ? inBatch : await storedMove(dayId, jobId, fromDate, newDate);
        if (!move) return false;
        if (table === 'drillChecklists' && !move.moveChecklists) return false;
        return true;
      };

      for (const op of parsed.data.ops) {
        // PATCH may omit table_name; DELETE carries no data at all — the
        // stored row is the identity source for those.
        const stored = await batch.get(op.id);
        const tableName = op.data?.table_name ?? stored?.tableName ?? '';

        // 0. Oversize backstop: attachment binaries live in R2 now; the only
        // legitimately-heavy payloads left are filed submissions (PDF+assets,
        // well under 10MB). Anything near the express 30MB body cap would
        // 413 and wedge the fleet's ordered upload queue — discard instead.
        if ((op.data?.payload?.length ?? 0) > 25_000_000) {
          discard(op, tableName, `payload too large (${op.data?.payload?.length} chars)`);
          continue;
        }

        const incoming = parsePayloadSafe(op.data?.payload);
        // The record's effective payload after this op (PATCH replaces the
        // whole payload column when present; COALESCE keeps stored otherwise)
        let effective = op.data?.payload !== undefined ? incoming : (stored?.payload ?? {});
        // What gets written: the incoming payload unless a guard below
        // rewrites it (the day's card, the edit log)
        let payloadOut: string | null = op.data?.payload ?? null;

        if (op.op === 'DELETE' && !stored) continue; // deleting nothing — no-op

        // S13 bug fix: a PATCH onto a record the server no longer has (merged
        // away or deleted by someone else while this device was offline —
        // or never accepted) must not resurrect it. PATCH ops carry no
        // table name, so the stored row was the identity; without it the
        // op can only be refused — and the device told in plain words.
        if (op.op === 'PATCH' && !stored) {
          if (discardedInBatch.has(op.id)) {
            discard(op, tableName, 'record discarded earlier in this batch', { kind: 'child', text: '' });
            continue;
          }
          const label = TABLE_LABEL[tableName] ?? (tableName || 'record');
          discard(op, tableName, 'record no longer exists', {
            kind: 'refused',
            text: `The ${label} you changed is no longer on the server — deleted by someone else while you were offline, or never accepted — so your change was not saved`,
          });
          continue;
        }

        // 0b. S16: a date-only change on a paper of a moved day passes for the
        // mover — the move row is the authority, not the paper's owner
        if (op.op === 'PATCH' && stored && MOVE_DATE_TABLES.has(tableName)) {
          const changes = diffPayloads(stored.payload, effective);
          const dateOnly = changes.every((c) => MOVE_DATE_FIELDS.has(c.field));
          const newDate = effective.date as string | undefined;
          if (dateOnly && newDate && (await moveAuthorises(tableName, stored.payload, newDate))) {
            if (changes.length > 0) {
              audit(op.id, tableName, 'PATCH', changes, 'date change');
              await upsertRecord(tx, cid, op.id, op.data?.table_name ?? null, payloadOut, now);
              batch.applied(op.id, tableName, effective);
            }
            continue;
          }
        }

        // 1. table × op × role (capability-resolved; custom roles supported).
        // Sep 15 2026 (Beta: three rig checklists "on the filing device" for
        // ever): the uploader's storage-pointer flip on a filed copy is a
        // PATCH, and submissions PATCH is admin-only — so every driller's
        // and blaster's office copy stayed "device" on the server while the
        // PDF sat in R2. A PATCH that touches only the storage pointer is
        // allowed to whoever may file (PUT); the write-once rule below still
        // refuses any change to the document itself.
        const storagePointerOnly =
          tableName === 'submissions' &&
          op.op === 'PATCH' &&
          Boolean(stored) &&
          diffPayloads(stored!.payload, effective).every((c) => STORAGE_POINTER_FIELDS.has(c.field));
        if (!canPerformOpAs(tableName, op.op, role, roleDefs) && !(storagePointerOnly && canPerformOpAs(tableName, 'PUT', role, roleDefs))) {
          discard(op, tableName, 'role denied');
          continue;
        }

        // 1a. role definitions are structural: a key is required, and the
        // 'admin' bundle can never be redefined (protected by design)
        if (tableName === 'roleDefinitions' && op.op !== 'DELETE') {
          const key = effective.key;
          if (typeof key !== 'string' || !key.trim() || key.trim() === 'admin') {
            discard(op, tableName, 'invalid or protected role key');
            continue;
          }
        }

        // 1a2. lifecycle — archive/restore rides the table's DELETE grant
        // (docs/deletion-pattern.md): flipping archivedAt in either
        // direction is the supervisory act, whatever op carries it
        if (op.op !== 'DELETE') {
          const wasArchived = Boolean(stored?.payload.archivedAt);
          const willBeArchived = Boolean(effective.archivedAt);
          if (
            wasArchived !== willBeArchived &&
            !canPerformOpAs(tableName, 'DELETE', role, roleDefs)
          ) {
            discard(op, tableName, 'archive/restore requires the delete grant');
            continue;
          }
        }

        // 1a3. lifecycle — Delete is the created-in-error verb. Hierarchy
        // and registry records go only if NEVER used (zero children ever);
        // anything with history is archive-only. Same-batch children are
        // visible here: upserts landed in this transaction.
        if (op.op === 'DELETE' && NEVER_USED_DELETE_TABLES.has(tableName)) {
          let used: string | null = null;
          for (const child of LIFECYCLE_CHILDREN[tableName]) {
            const rows = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = ${child.table}
                AND ("payload"::jsonb ->> ${child.field}) = ${op.id}
              LIMIT 1`;
            if (rows.length > 0) {
              used = child.table;
              break;
            }
          }
          if (used) {
            discard(op, tableName, `record has history (${used}) — archive instead`);
            continue;
          }
        }

        // 1a4. lifecycle — a work day deletes only while it's a DRAFT with
        // nothing filed from it ("this day never happened"). Submitted or
        // approved days unlock first via the normal transitions.
        if (tableName === 'blastDays' && op.op === 'DELETE') {
          const status = (stored?.payload.status as string | undefined) ?? 'draft';
          if (status !== 'draft') {
            discard(op, tableName, `only draft days can be deleted (day is ${status})`);
            continue;
          }
          const filed = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "records"
            WHERE "company_id" = ${cid} AND "table_name" = 'submissions'
              AND ("payload"::jsonb ->> 'blastDayId') = ${op.id}
            LIMIT 1`;
          if (filed.length > 0) {
            discard(op, tableName, 'day has filed documents — archive-only history');
            continue;
          }
        }

        // 1a5. lifecycle — an ACCEPTED drill log never deletes (the blast
        // side took the pattern); un-accept first if it was a mistake
        if (
          tableName === 'drillLogs' &&
          op.op === 'DELETE' &&
          (stored?.payload.status as string | undefined) === 'accepted'
        ) {
          discard(op, tableName, 'accepted drill logs cannot be deleted');
          continue;
        }

        // 1b. submissions are write-once: the DOCUMENT (pdf checksum, assets,
        // facts) can never change after filing — corrections come as NEW
        // submissions (vN+1). The ONE permitted post-file change is the
        // storage-pointer flip when the uploader lands binaries in R2.
        if (tableName === 'submissions' && stored && op.op !== 'DELETE') {
          const changes = diffPayloads(stored.payload, effective);
          const contentTouched = changes.some((c) => !STORAGE_POINTER_FIELDS.has(c.field));
          if (contentTouched) {
            discard(op, tableName, 'submission is write-once');
            continue;
          }
        }

        // 1b2. children of a discarded record must not land as orphans —
        // same batch (parent id in this batch's discard set) OR a later
        // batch (parent simply doesn't exist server-side because it was
        // discarded earlier). Only guarded-parent tables pay the lookup.
        {
          const link = PARENT_CHAIN[tableName];
          const parentId = link ? (effective[link.parentIdField] ?? stored?.payload[link.parentIdField]) : undefined;
          if (link && typeof parentId === 'string' && parentId) {
            if (discardedInBatch.has(parentId)) {
              discard(op, tableName, 'parent record was discarded', { kind: 'child', text: '' });
              continue;
            }
            // S13 bug fix: the old condition skipped children of blastDays,
            // so a drill log whose day was deleted landed as an orphan. Every
            // NEW child needs its parent to exist — and the device is told.
            if (op.op === 'PUT' && !stored) {
              const parent = await batch.get(parentId);
              if (!parent) {
                discard(op, tableName, 'parent record missing', {
                  kind: 'refused',
                  text: `The ${TABLE_LABEL[link.parentTable] ?? 'record'} this ${TABLE_LABEL[tableName] ?? 'record'} belongs to was deleted while you were offline — it was not saved`,
                });
                continue;
              }
            }
          }
        }


        // 1c. one-per-parent children: two offline devices can BOTH create
        // "the day's blast log" — first to sync wins, the copy is discarded
        // (the loser's device keeps local data; the shared record stays 1:1)
        if (op.op === 'PUT' && !stored) {
          const parentField = ONE_PER_PARENT[tableName];
          const parentId = parentField ? effective[parentField] : undefined;
          if (parentField && typeof parentId === 'string' && parentId) {
            const dup = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = ${tableName}
                AND ("payload"::jsonb ->> ${parentField}) = ${parentId}
              LIMIT 1`;
            if (dup.length > 0) {
              discard(op, tableName, `parent already has a ${tableName} record`, {
                kind: 'race',
                text: `Someone else started the ${TABLE_LABEL[tableName] ?? tableName} first while you were offline — theirs was kept; yours was not saved`,
              });
              continue;
            }
          }
        }

        // 1d. S13 — the day and the card (docs/day-at-a-job-design.md):
        //  · a PUT of a day that already exists is the SAME day from a second
        //    phone (name-based ids): the stored day stands, quietly; the two
        //    facts the dialog chose (type of work, label) become HELD edits
        //    when they differ, so nobody's choice is dropped without asking
        //  · a NEW day never carries version stamps of its own
        //  · a PATCH of a day never touches the card: type of work, on-site
        //    time, conditions, label and the version stamps come from the
        //    stored row; the setup stamp and the NWS reading are first-wins
        if (tableName === 'blastDays' && op.op === 'PUT' && stored) {
          const sets = (stored.payload.cardSets ?? {}) as Record<string, CardSetRow>;
          const setup = (stored.payload.setup ?? {}) as { by?: string; byName?: string; at?: string };
          for (const path of ['typeOfWork', 'name'] as const) {
            const v = effective[path];
            if (v === undefined || v === null || v === '') continue;
            if (cardValuesEqual(getPath(stored.payload, path), v)) continue;
            const cur = sets[path];
            const editId = randomUUID();
            const held = {
              id: editId,
              blastDayId: op.id,
              path,
              value: v,
              baseVersion: 0,
              by: actorId,
              byName: actorName,
              at: now,
              status: 'held',
              heldAt: now,
              current: {
                value: getPath(stored.payload, path),
                v: cur?.v ?? 0,
                by: cur?.by ?? setup.by ?? '',
                byName: cur?.byName ?? setup.byName ?? '',
                at: cur?.at ?? setup.at ?? '',
              },
              createdAt: now,
              updatedAt: now,
              syncStatus: 'synced',
            };
            await upsertRecord(tx, cid, editId, 'dayCardEdits', JSON.stringify(held), now);
            batch.applied(editId, 'dayCardEdits', held);
            audit(editId, 'dayCardEdits', 'PUT', [{ field: path, note: 'held' }], 'second copy of the same day');
          }
          audit(op.id, tableName, 'MERGE', [], 'second copy of the same day — the stored day stands');
          continue;
        }
        if (tableName === 'blastDays' && op.op === 'PUT' && !stored && effective.cardSets !== undefined) {
          effective = { ...effective };
          delete effective.cardSets;
          payloadOut = JSON.stringify(effective);
        }
        if (tableName === 'blastDays' && op.op === 'PATCH' && stored && op.data?.payload !== undefined) {
          let next: Record<string, unknown> = { ...effective };
          for (const path of CARD_PATHS) next = withPath(next, path, getPath(stored.payload, path));
          next.cardSets = stored.payload.cardSets;
          if (stored.payload.setup !== undefined) next.setup = stored.payload.setup;
          if (stored.payload.nws !== undefined) next.nws = stored.payload.nws;
          effective = next;
          payloadOut = JSON.stringify(effective);
          // S16: the date changes only while the day is a draft with no office copy
          if (effective.date !== stored.payload.date) {
            const filed = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = 'submissions'
                AND ("payload"::jsonb ->> 'blastDayId') = ${op.id}
              LIMIT 1`;
            if (stored.payload.status !== 'draft' || filed.length > 0) {
              discard(op, tableName, 'date change on a filed day', {
                kind: 'refused',
                text: 'This day is filed with the office — withdraw the filing before changing its date',
              });
              continue;
            }
          }
        }

        // 2. blastDay status transitions
        if (tableName === 'blastDays' && op.op !== 'DELETE') {
          const from = (stored?.payload.status as string | undefined) ?? 'draft';
          const to = (effective.status as string | undefined) ?? from;
          if (!canTransitionStatusAs(from, to, role, roleDefs)) {
            discard(op, tableName, `forbidden transition ${from}->${to}`);
            continue;
          }
          // Same-status edits to a FILED day are frozen for field roles —
          // the office copy and the live record must not silently diverge
          if (from === to && LOCKED_DAY_STATUSES.has(from) && !canEditApprovedAs(role, roleDefs)) {
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
          if (!canTransitionDrillLogAs(from, to, role, roleDefs)) {
            discard(op, tableName, `forbidden drill-log transition ${from}->${to}`);
            continue;
          }
        }

        // 2b2. sensitive status flips on the remaining status tables
        // (repair tickets, incidents, equipment, drill plans)
        if (STATUS_GUARDED_TABLES.has(tableName) && op.op !== 'DELETE') {
          const from = (stored?.payload.status as string | undefined) ?? '';
          const to = (effective.status as string | undefined) ?? from;
          if (!canTransitionRecordStatusAs(tableName, from, to, role, roleDefs)) {
            discard(op, tableName, `forbidden ${tableName} transition ${from}->${to}`);
            continue;
          }
        }

        // 2b3. time cards: everyone writes their OWN. A card whose subject
        // holds a login may only be written by that login; no-login roster
        // people are the attributed exception. Approvers (approve_days)
        // bypass — they fix and approve cards. Approved cards freeze;
        // delete is draft-only ("created in error").
        if (tableName === 'timeCards' && !canEditApprovedAs(role, roleDefs) && !canApproveTimeCardsAs(role, roleDefs)) {
          const from = (stored?.payload.status as string | undefined) ?? 'draft';
          const to =
            op.op === 'DELETE' ? from : ((effective.status as string | undefined) ?? from);
          if (from === 'approved') {
            discard(op, tableName, 'time card approved (locked)');
            continue;
          }
          if (op.op === 'DELETE' && from !== 'draft') {
            discard(op, tableName, 'only draft time cards can be deleted');
            continue;
          }
          // A filed card is with the office — pull it back (filed→draft)
          // before editing; same-status edits are frozen like filed days
          if (from === 'filed' && to === 'filed') {
            discard(op, tableName, 'time card filed (locked)');
            continue;
          }
          let subjectUserId = (effective.userId ?? stored?.payload.userId) as string | undefined;
          if (!subjectUserId) {
            const cmId = (effective.crewMemberId ?? stored?.payload.crewMemberId) as
              | string
              | undefined;
            if (cmId) {
              subjectUserId = (await batch.get(cmId))?.payload.userId as string | undefined;
            }
          }
          if (subjectUserId && subjectUserId !== actorId) {
            discard(op, tableName, 'not your time card');
            continue;
          }
          if (op.op === 'PUT' && !stored && effective.enteredByUserId !== actorId) {
            discard(op, tableName, 'entered-by must be the signed-in user');
            continue;
          }
        }

        // 2b4. hour corrections are attributed to whoever files them —
        // the ledger's audit story depends on it
        if (
          tableName === 'hourCorrections' &&
          op.op === 'PUT' &&
          !stored &&
          role !== 'admin' &&
          effective.correctedByUserId !== actorId
        ) {
          discard(op, tableName, 'correction must be attributed to the signed-in user');
          continue;
        }

        // (2b5, the per-shot sign-off guard of the multi-blaster model, was
        // retired in S16: one log, one blaster, one signature — the log's.)

        // 2c. hole rows freeze for drillers once their log is accepted
        if (tableName === 'drillLogHoles' && !canEditAcceptedDrillLogAs(role, roleDefs)) {
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
        if (APPROVAL_LOCKED_TABLES.has(tableName) && !canEditApprovedAs(role, roleDefs)) {
          const dayId = await resolveBlastDayId(tableName, effective, batch);
          if (dayId) {
            const status = await statusOf(dayId);
            if (LOCKED_DAY_STATUSES.has(status)) {
              discard(op, tableName, `blast day ${status} (locked)`);
              continue;
            }
          }
        }

        // 3b. S13 — the card's edit log. A phone sends one edit per fact with
        // the version it was based on; the server APPLIES it when nobody
        // else set that fact since (first to land sticks — and a person's
        // own later edit supersedes their earlier one), otherwise HOLDS it
        // with the current value and its author for the person to decide.
        // Edit rows are written by the server: a device may only close a
        // held one ("use theirs" / "use mine").
        if (tableName === 'dayCardEdits' && op.op === 'PUT') {
          if (stored) {
            audit(op.id, tableName, 'MERGE', [], 'edit row re-sent — kept as stored');
            continue;
          }
          const dayId = effective.blastDayId as string | undefined;
          const day = dayId ? await batch.get(dayId) : null;
          const path = effective.path as string;
          if (!dayId || !day || !isCardPath(path)) {
            discard(op, tableName, 'not a card fact of a known day');
            continue;
          }
          if (effective.by !== actorId && !canEditApprovedAs(role, roleDefs)) {
            discard(op, tableName, 'edit must be yours');
            continue;
          }
          const sets = (day.payload.cardSets ?? {}) as Record<string, CardSetRow>;
          const cur = sets[path];
          const curV = cur?.v ?? 0;
          const base = Number(effective.baseVersion ?? 0);
          const value = effective.value;
          const currentValue = getPath(day.payload, path);
          const same = cardValuesEqual(currentValue, value);
          const applies = same || effective.force === true || base === curV || (cur !== undefined && cur.by === effective.by);
          if (!applies) {
            const setup = (day.payload.setup ?? {}) as { by?: string; byName?: string; at?: string };
            effective = {
              ...effective,
              status: 'held',
              heldAt: now,
              current: {
                value: currentValue,
                v: curV,
                by: cur?.by ?? setup.by ?? '',
                byName: cur?.byName ?? setup.byName ?? '',
                at: cur?.at ?? setup.at ?? '',
              },
              updatedAt: now,
            };
            payloadOut = JSON.stringify(effective);
            audit(op.id, tableName, 'PUT', [{ field: path, note: 'held' }], `${path} was set by ${cur?.byName ?? setup.byName ?? '?'} since v${base}`);
          } else {
            if (!same) {
              // The type of work stays a blasting type while a blast log exists
              if (path === 'typeOfWork' && isBlastingWork(currentValue as string) && !isBlastingWork(value as string)) {
                const logs = await tx.$queryRaw<{ id: string }[]>`
                  SELECT "id" FROM "records"
                  WHERE "company_id" = ${cid} AND "table_name" = 'blastLogs'
                    AND ("payload"::jsonb ->> 'blastDayId') = ${dayId}
                  LIMIT 1`;
                if (logs.length > 0) {
                  discard(op, tableName, 'day has a blasting log', {
                    kind: 'refused',
                    text: 'The type of work stays a blasting type while the day has a blasting log — the log would have to go first',
                  });
                  continue;
                }
              }
              let next = withPath(day.payload, path, value);
              next = {
                ...next,
                cardSets: { ...sets, [path]: { v: curV + 1, by: effective.by, byName: effective.byName ?? '', at: now } },
                updatedAt: now,
              };
              await upsertRecord(tx, cid, dayId, 'blastDays', JSON.stringify(next), now);
              batch.applied(dayId, 'blastDays', next);
              audit(dayId, 'blastDays', 'PATCH', diffPayloads(day.payload, next), 'card edit');
            }
            effective = { ...effective, status: 'applied', appliedAt: now, appliedV: same ? curV : curV + 1, updatedAt: now };
            payloadOut = JSON.stringify(effective);
          }
        }
        if (tableName === 'dayCardEdits' && op.op === 'PATCH' && stored) {
          const closing = stored.payload.status === 'held' && effective.status === 'resolved';
          const own = stored.payload.by === actorId || canEditApprovedAs(role, roleDefs);
          if (!closing || !own) {
            discard(op, tableName, 'edit rows are written by the server');
            continue;
          }
          effective = { ...stored.payload, status: 'resolved', resolution: effective.resolution, resolvedAt: now, updatedAt: now };
          payloadOut = JSON.stringify(effective);
        }

        // 3c. S13 — presence: one row per person per day, own row only
        if (tableName === 'workDayConfirmations' && op.op !== 'DELETE') {
          const subject = (effective.userId ?? stored?.payload.userId) as string | undefined;
          if (subject !== actorId && !canEditApprovedAs(role, roleDefs)) {
            discard(op, tableName, 'not your confirmation');
            continue;
          }
        }

        // 3b. S16: a "Change the date" row — apply it to the day and every
        // paper on it, this device's and everyone else's, then mark it applied
        if (tableName === 'dayMoves' && op.op === 'PUT' && !stored) {
          const dayId = String(effective.blastDayId ?? '');
          const toDate = String(effective.toDate ?? '');
          const fromDate = String(effective.fromDate ?? '');
          const jobId = String(effective.jobId ?? '');
          const day = dayId ? await batch.get(dayId) : null;
          if (!day || !toDate || !fromDate) {
            discard(op, tableName, 'day no longer exists', { kind: 'refused', text: 'The day you moved is no longer on the server — the move was not applied' });
            continue;
          }
          const filed = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "records"
            WHERE "company_id" = ${cid} AND "table_name" = 'submissions'
              AND ("payload"::jsonb ->> 'blastDayId') = ${dayId}
            LIMIT 1`;
          if (day.payload.status !== 'draft' || filed.length > 0) {
            discard(op, tableName, 'date change on a filed day', {
              kind: 'refused',
              text: 'This day is filed with the office — withdraw the filing before changing its date',
            });
            continue;
          }
          // another day for this job on the target date: absorbed when empty, refused when it has papers
          const others = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "records"
            WHERE "company_id" = ${cid} AND "table_name" = 'blastDays'
              AND ("payload"::jsonb ->> 'jobId') = ${jobId} AND ("payload"::jsonb ->> 'date') = ${toDate} AND "id" <> ${dayId}`;
          let refused = false;
          for (const other of others) {
            const papers = await tx.$queryRaw<{ n: bigint }[]>`
              SELECT COUNT(*)::bigint AS n FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" IN ('blastLogs', 'dailyReports', 'drillLogs', 'timeCards')
                AND ("payload"::jsonb ->> 'blastDayId') = ${other.id}`;
            if (Number(papers[0]?.n ?? 0) > 0) {
              refused = true;
              break;
            }
            audit(other.id, 'blastDays', 'DELETE', [{ field: '*', note: 'empty day absorbed by a date change' }]);
            await deleteRecord(tx, cid, other.id);
            batch.deleted(other.id);
          }
          if (refused) {
            discard(op, tableName, 'target date has a day with papers', { kind: 'refused', text: `This job already has a day on ${toDate} with papers — open that day instead` });
            continue;
          }
          if (day.payload.date !== toDate) {
            const nextDay = { ...day.payload, date: toDate, movedFrom: { date: fromDate, by: effective.by ?? '', byName: effective.byName ?? '', at: now }, updatedAt: now };
            audit(dayId, 'blastDays', 'PATCH', diffPayloads(day.payload, nextDay), 'date change');
            await upsertRecord(tx, cid, dayId, 'blastDays', JSON.stringify(nextDay), now);
            batch.applied(dayId, 'blastDays', nextDay);
          }
          const movedLogIds: string[] = [];
          for (const table of ['drillLogs', 'timeCards', 'dayReminders']) {
            const rows = await tx.$queryRaw<{ id: string; payload: string }[]>`
              SELECT "id", "payload" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = ${table}
                AND (("payload"::jsonb ->> 'blastDayId') = ${dayId}
                     OR (("payload"::jsonb ->> 'jobId') = ${jobId} AND ("payload"::jsonb ->> 'date') = ${fromDate}))`;
            for (const r of rows) {
              const before = parsePayloadSafe(r.payload) as Record<string, unknown>;
              if (table === 'drillLogs') movedLogIds.push(r.id);
              if (before.date === toDate && before.blastDayId === dayId) continue;
              const next = { ...before, date: toDate, blastDayId: dayId, updatedAt: now };
              audit(r.id, table, 'PATCH', diffPayloads(before, next), 'date change');
              await upsertRecord(tx, cid, r.id, table, JSON.stringify(next), now);
              batch.applied(r.id, table, next);
            }
          }
          for (const logId of movedLogIds) {
            const holes = await tx.$queryRaw<{ id: string; payload: string }[]>`
              SELECT "id", "payload" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = 'drillLogHoles'
                AND ("payload"::jsonb ->> 'drillLogId') = ${logId} AND ("payload"::jsonb ->> 'date') = ${fromDate}`;
            for (const h of holes) {
              const before = parsePayloadSafe(h.payload) as Record<string, unknown>;
              const next = { ...before, date: toDate, updatedAt: now };
              await upsertRecord(tx, cid, h.id, 'drillLogHoles', JSON.stringify(next), now);
              batch.applied(h.id, 'drillLogHoles', next);
            }
          }
          if (effective.moveChecklists) {
            const chks = await tx.$queryRaw<{ id: string; payload: string }[]>`
              SELECT "id", "payload" FROM "records"
              WHERE "company_id" = ${cid} AND "table_name" = 'drillChecklists'
                AND ("payload"::jsonb ->> 'jobId') = ${jobId} AND ("payload"::jsonb ->> 'date') = ${fromDate}`;
            for (const c of chks) {
              const before = parsePayloadSafe(c.payload) as Record<string, unknown>;
              const next = { ...before, date: toDate, updatedAt: now };
              audit(c.id, 'drillChecklists', 'PATCH', diffPayloads(before, next), 'date change');
              await upsertRecord(tx, cid, c.id, 'drillChecklists', JSON.stringify(next), now);
              batch.applied(c.id, 'drillChecklists', next);
            }
          }
          effective = { ...effective, status: 'applied', appliedAt: now, updatedAt: now };
          payloadOut = JSON.stringify(effective);
        }

        // 4. apply (+ audit: field-level diff of stored → effective)
        if (op.op === 'PUT' || op.op === 'PATCH') {
          const changes = diffPayloads(stored?.payload ?? null, effective);
          if (changes.length > 0) audit(op.id, tableName, op.op, changes);
          await upsertRecord(tx, cid, op.id, op.data?.table_name ?? null, payloadOut, now);
          batch.applied(op.id, tableName, effective);
        } else {
          audit(op.id, tableName, 'DELETE', [{ field: '*', note: 'deleted' }]);
          await deleteRecord(tx, cid, op.id);
          batch.deleted(op.id);
        }
      }

      if (audits.length > 0) await tx.auditEntry.createMany({ data: audits });
    });
  } catch (err) {
    console.error('powersync upload failed:', err);
    // 500 keeps the client's CRUD queue intact; the SDK retries with backoff.
    // Permission problems NEVER take this path — they are discarded above so
    // one forbidden op can't wedge the device's queue forever.
    res.status(500).json({ error: 'upload failed' });
    return;
  }
  res.json({ ok: true, discarded: discardedIds.length, discardedIds, notices });
});
// NOTE: submissions immutability + LOCKED_DAY_STATUSES enforcement above
// require @shotlog/shared >= the build that exports LOCKED_DAY_STATUSES.
