// Online-only admin actions. These write the `records` table DIRECTLY
// (server is the system of record) and PowerSync fans the change out to
// every device — the caller gets an immediate, truthful success/error
// instead of an offline queue-and-hope.
import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { buildRoleDefsLookup, canTransitionStatusAs, hasCapability, slugify, type Role, type RoleDefsLookup } from '@shotlog/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { requireAuth, requireRole, type AuthedRequest } from './auth.js';
import { getRecord, upsertRecord } from './records.js';
import { resolveActor, writeAudit } from './auditWrite.js';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const statusSchema = z.object({
  to: z.enum(['draft', 'submitted', 'approved']),
  /** Send-back reason — shown inline on the field home's needs-attention strip */
  note: z.string().max(500).optional(),
});

// S21 (the approval process): the company's role definitions, so a role the
// matrix ticked (Office × Time cards) is honoured here the way the sync
// choke point honours it
async function loadRoleDefs(tx: Prisma.TransactionClient, cid: string): Promise<RoleDefsLookup> {
  const rows = await tx.record.findMany({ where: { companyId: cid, tableName: 'roleDefinitions' }, select: { payload: true } });
  return buildRoleDefsLookup(
    rows.map((r) => {
      try {
        return JSON.parse(r.payload) as { key?: unknown; name?: unknown; capabilities?: unknown; homeDashboard?: unknown };
      } catch {
        return {};
      }
    }),
  );
}

/** paper → the capability that approves it (mirrors the web's lib/approvals.ts) */
const PAPER_CAP: Record<string, string> = {
  blast_log: 'approve_days',
  daily_report: 'approve_days',
  drill_log: 'approve_drill_logs',
  drill_checklist: 'approve_checklists',
  time_card: 'approve_time_cards',
};
const PAPER_TABLE: Record<string, string> = {
  drill_log: 'drillLogs',
  drill_checklist: 'drillChecklists',
  time_card: 'timeCards',
};
const paperSchema = z.object({
  paper: z.enum(['blast_log', 'daily_report', 'drill_log', 'drill_checklist', 'time_card']),
  recordId: z.string().optional(),
  to: z.enum(['approved', 'sent_back']),
  note: z.string().max(500).optional(),
  label: z.string().max(120).optional(),
});

const productSchema = z.object({
  manufacturer: z.string().min(1),
  productName: z.string().min(1),
  category: z.enum([
    'bulk',
    'anfo',
    'anfo_wr',
    'gel_dynamite',
    'emulsion',
    'booster',
    'booster_electronic',
    'cartridge',
  ]),
  weightMultiplier: z.number().positive(),
  unitType: z.string().min(1),
  sizeDescription: z.string().default(''),
  unitsPerCase: z.number().positive().nullable().default(null),
  sortOrder: z.number().int().default(999),
  isActive: z.boolean().default(true),
});

// ── Manufacturers ─────────────────────────────────────────────────────────

/** Create a manufacturer (admin) */
adminRouter.post('/manufacturers', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const cid = req.companyId as string;
  const name = parsed.data.name.trim();
  const id = `mfr-${slugify(name)}`;
  const now = new Date().toISOString();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stored = await getRecord(tx, cid, id);
      if (stored) return { code: 409 as const };
      const count = await tx.record.count({ where: { companyId: cid, tableName: 'manufacturers' } });
      const doc = { id, name, isActive: true, sortOrder: count, createdAt: now, updatedAt: now, syncStatus: 'synced' };
      await upsertRecord(tx, cid, id, 'manufacturers', JSON.stringify(doc), now);
      await writeAudit(tx, {
        companyId: cid, tableName: 'manufacturers', recordId: id, op: 'PUT',
        actor: await resolveActor(req.userId, req.role),
        changes: [{ field: '*', note: `created ${name}` }],
      });
      return { code: 201 as const, manufacturer: doc };
    });
    if (result.code === 409) {
      res.status(409).json({ error: 'that manufacturer already exists' });
      return;
    }
    res.status(201).json({ ok: true, manufacturer: result.manufacturer });
  } catch (err) {
    console.error('manufacturer create failed:', err);
    res.status(500).json({ error: 'create failed' });
  }
});

/**
 * Update a manufacturer: rename (cascades the display name onto every
 * product in its line) and/or retire/reactivate.
 */
adminRouter.put('/manufacturers/:id', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const parsed = z
    .object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() })
    .safeParse(req.body);
  const id = req.params.id;
  if (!parsed.success || typeof id !== 'string') {
    res.status(400).json({ error: 'name and/or isActive required' });
    return;
  }
  const cid = req.companyId as string;
  const now = new Date().toISOString();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stored = await getRecord(tx, cid, id);
      if (!stored || stored.tableName !== 'manufacturers') return { code: 404 as const };
      const doc = { ...stored.payload, ...parsed.data, updatedAt: now };
      await upsertRecord(tx, cid, id, 'manufacturers', JSON.stringify(doc), now);
      let cascaded = 0;
      if (parsed.data.name && parsed.data.name !== stored.payload.name) {
        const products = await tx.record.findMany({
          where: { companyId: cid, tableName: 'productCatalog' },
        });
        for (const row of products) {
          const p = JSON.parse(row.payload) as Record<string, unknown>;
          if (p.manufacturerId !== id) continue;
          p.manufacturer = parsed.data.name;
          p.fullDescription = `${parsed.data.name} - ${p.productName as string}`;
          p.updatedAt = now;
          await tx.record.update({
            where: { companyId_id: { companyId: cid, id: row.id } },
            data: { payload: JSON.stringify(p), updatedAt: now },
          });
          cascaded++;
        }
      }
      await writeAudit(tx, {
        companyId: cid, tableName: 'manufacturers', recordId: id, op: 'PATCH',
        actor: await resolveActor(req.userId, req.role),
        changes: [{ field: '*', note: `updated${cascaded ? ` (renamed ${cascaded} products)` : ''}` }],
      });
      return { code: 200 as const, manufacturer: doc, cascaded };
    });
    if (result.code === 404) {
      res.status(404).json({ error: 'manufacturer not found' });
      return;
    }
    res.json({ ok: true, manufacturer: result.manufacturer, productsRenamed: result.cascaded });
  } catch (err) {
    console.error('manufacturer update failed:', err);
    res.status(500).json({ error: 'update failed' });
  }
});

/** Bulk activate/deactivate every product in a manufacturer's line */
adminRouter.post(
  '/manufacturers/:id/set-products-active',
  requireRole('admin'),
  async (req: AuthedRequest, res: Response) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    const id = req.params.id;
    if (!parsed.success || typeof id !== 'string') {
      res.status(400).json({ error: 'active required' });
      return;
    }
    const cid = req.companyId as string;
    const now = new Date().toISOString();
    try {
      const changed = await prisma.$transaction(async (tx) => {
        const products = await tx.record.findMany({
          where: { companyId: cid, tableName: 'productCatalog' },
        });
        let n = 0;
        for (const row of products) {
          const p = JSON.parse(row.payload) as Record<string, unknown>;
          if (p.manufacturerId !== id || p.isActive === parsed.data.active) continue;
          p.isActive = parsed.data.active;
          p.updatedAt = now;
          await tx.record.update({
            where: { companyId_id: { companyId: cid, id: row.id } },
            data: { payload: JSON.stringify(p), updatedAt: now },
          });
          n++;
        }
        if (n > 0) {
          await writeAudit(tx, {
            companyId: cid, tableName: 'manufacturers', recordId: id, op: 'PATCH',
            actor: await resolveActor(req.userId, req.role),
            changes: [{ field: 'products.isActive', new: parsed.data.active, note: `${n} products` }],
          });
        }
        return n;
      });
      res.json({ ok: true, changed });
    } catch (err) {
      console.error('bulk product toggle failed:', err);
      res.status(500).json({ error: 'bulk update failed' });
    }
  },
);

const companySchema = z.object({
  companyName: z.string().min(1),
  dealerNumber: z.string().default(''),
  address: z.string().default(''),
  city: z.string().default(''),
  state: z.string().max(2).default(''),
  phone: z.string().default(''),
});

/** Company settings — single synced doc, admin-managed */
adminRouter.put('/company', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'company name required' });
    return;
  }
  const cid = req.companyId as string;
  const now = new Date().toISOString();
  const id = 'companySettings-singleton';
  try {
    await prisma.$transaction(async (tx) => {
      const stored = await getRecord(tx, cid, id);
      const doc = {
        ...(stored?.payload ?? { id, createdAt: now, syncStatus: 'synced' }),
        ...parsed.data,
        updatedAt: now,
      };
      await upsertRecord(tx, cid, id, 'companySettings', JSON.stringify(doc), now);
      await writeAudit(tx, {
        companyId: cid,
        tableName: 'companySettings',
        recordId: id,
        op: 'PATCH',
        actor: await resolveActor(req.userId, req.role),
        changes: [{ field: '*', note: 'company details updated' }],
      });
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('company settings failed:', err);
    res.status(500).json({ error: 'save failed' });
  }
});

/** Create a catalog product (admin) */
adminRouter.post('/catalog', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid product', details: parsed.error.issues[0]?.message });
    return;
  }
  const cid = req.companyId as string;
  const now = new Date().toISOString();
  const id = randomUUID();
  const manufacturerId = `mfr-${slugify(parsed.data.manufacturer)}`;
  const doc = {
    id,
    ...parsed.data,
    manufacturerId,
    fullDescription: `${parsed.data.manufacturer} - ${parsed.data.productName}`,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
  };
  try {
    await prisma.$transaction(async (tx) => {
      // A brand-new manufacturer name creates its entity on the fly
      const mfr = await getRecord(tx, cid, manufacturerId);
      if (!mfr) {
        const count = await tx.record.count({
          where: { companyId: cid, tableName: 'manufacturers' },
        });
        await upsertRecord(
          tx,
          cid,
          manufacturerId,
          'manufacturers',
          JSON.stringify({
            id: manufacturerId,
            name: parsed.data.manufacturer,
            isActive: true,
            sortOrder: count,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'synced',
          }),
          now,
        );
      }
      await upsertRecord(tx, cid, id, 'productCatalog', JSON.stringify(doc), now);
      await writeAudit(tx, {
        companyId: cid, tableName: 'productCatalog', recordId: id, op: 'PUT',
        actor: await resolveActor(req.userId, req.role),
        changes: [{ field: '*', note: 'product created' }],
      });
    });
    res.status(201).json({ ok: true, product: doc });
  } catch (err) {
    console.error('catalog create failed:', err);
    res.status(500).json({ error: 'create failed' });
  }
});

/** Update a catalog product — partial fields, including isActive (admin) */
adminRouter.put('/catalog/:id', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const parsed = productSchema.partial().safeParse(req.body);
  const id = req.params.id;
  if (!parsed.success || typeof id !== 'string') {
    res.status(400).json({ error: 'invalid product fields' });
    return;
  }
  const cid = req.companyId as string;
  const now = new Date().toISOString();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stored = await getRecord(tx, cid, id);
      if (!stored || stored.tableName !== 'productCatalog') {
        return { code: 404 as const };
      }
      const merged = { ...stored.payload, ...parsed.data, updatedAt: now } as Record<
        string,
        unknown
      >;
      merged.fullDescription = `${merged.manufacturer as string} - ${merged.productName as string}`;
      merged.manufacturerId = `mfr-${slugify(merged.manufacturer as string)}`;
      await upsertRecord(tx, cid, id, 'productCatalog', JSON.stringify(merged), now);
      await writeAudit(tx, {
        companyId: cid, tableName: 'productCatalog', recordId: id, op: 'PATCH',
        actor: await resolveActor(req.userId, req.role),
        changes: [{ field: '*', note: 'product updated' }],
      });
      return { code: 200 as const, product: merged };
    });
    if (result.code === 404) {
      res.status(404).json({ error: 'product not found' });
      return;
    }
    res.json({ ok: true, product: result.product });
  } catch (err) {
    console.error('catalog update failed:', err);
    res.status(500).json({ error: 'update failed' });
  }
});

/**
 * Blast day status transition (approve / send back / reopen).
 * Validated against the stored status so two supervisors acting at once
 * get a clean 409 instead of silently double-applying.
 */
adminRouter.post(
  '/blast-days/:id/status',
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
        // S21: the matrix decides who approves — a role the office ticked
        // holds approve_days through its role definition
        const roleDefs = await loadRoleDefs(tx, cid);
        if (!canTransitionStatusAs(from, to, role, roleDefs)) {
          return { code: 403 as const, error: `your role does not approve work days (can't go from ${from} to ${to})` };
        }
        // Send-back carries the reason to the field home; any other
        // transition clears it (the day is moving forward again)
        const sendBackNote =
          to === 'draft' && parsed.data.note?.trim() ? parsed.data.note.trim() : undefined;
        // S9a: the day page shows who sent it back and when, not just the note
        const actor = await resolveActor(req.userId, role);
        const nowIso = new Date().toISOString();
        // S21: "Approved 9:12 am by Evette" on the day, the File row and Records
        const approvedStamp =
          to === 'approved'
            ? { approvedAt: nowIso, approvedByUserId: actor.actorId, approvedByName: actor.actorName }
            : { approvedAt: undefined, approvedByUserId: undefined, approvedByName: undefined };
        // a day sent back as a whole clears its per-paper send-backs on the day's own papers
        const reviews = { ...((stored.payload.paperReviews as Record<string, unknown> | undefined) ?? {}) };
        if (to === 'draft') {
          delete reviews.blast_log;
          delete reviews.daily_report;
        }
        const payload = JSON.stringify({
          ...stored.payload,
          status: to,
          sendBackNote,
          sendBackBy: sendBackNote ? actor.actorName : undefined,
          sendBackAt: sendBackNote ? nowIso : undefined,
          ...approvedStamp,
          paperReviews: reviews,
          updatedAt: nowIso,
        });
        await upsertRecord(tx, cid, id, 'blastDays', payload, new Date().toISOString());
        // OFFICE approvals must be in the change log the ATF binder exports
        await writeAudit(tx, {
          companyId: cid,
          tableName: 'blastDays',
          recordId: id,
          op: 'PATCH',
          actor,
          changes: [
            { field: 'status', old: from, new: to },
            ...(sendBackNote ? [{ field: 'sendBackNote', old: null, new: sendBackNote }] : []),
            ...(to === 'approved' ? [{ field: 'approvedByName', old: null, new: actor.actorName }] : []),
          ],
          reason: 'office status change',
        });
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

/**
 * S21 — one paper of a day, approved or sent back from the review screen.
 * The decision is written on the day (paperReviews) and, where the paper is
 * its own record, on that record: a time card goes back to draft with the
 * note (or is approved and stamped), a drill log reopens to its driller
 * with the note (S20's Sent back to you band picks it up), a checklist
 * carries the note. Every decision is in the audit trail.
 */
adminRouter.post('/blast-days/:id/papers', async (req: AuthedRequest, res: Response) => {
  const parsed = paperSchema.safeParse(req.body);
  const id = req.params.id;
  if (!parsed.success || typeof id !== 'string') {
    res.status(400).json({ error: 'paper, to and (for a record) recordId are required' });
    return;
  }
  const cid = req.companyId as string;
  const role = req.role as Role;
  const { paper, recordId, to, note, label } = parsed.data;
  if (to === 'sent_back' && !note?.trim()) {
    res.status(400).json({ error: 'a send-back needs the note the filer will read' });
    return;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const day = await getRecord(tx, cid, id);
      if (!day || day.tableName !== 'blastDays') return { code: 404 as const, error: 'blast day not found' };
      const roleDefs = await loadRoleDefs(tx, cid);
      if (!hasCapability(role, PAPER_CAP[paper], roleDefs)) {
        return { code: 403 as const, error: `your role does not approve this paper (${paper.replace('_', ' ')})` };
      }
      const actor = await resolveActor(req.userId, role);
      const nowIso = new Date().toISOString();
      const key = paper === 'blast_log' || paper === 'daily_report' ? paper : `${paper}:${recordId ?? ''}`;
      let paperLabel = label?.trim() || paper.replace('_', ' ');
      // the paper's own record, when it has one
      if (PAPER_TABLE[paper]) {
        if (!recordId) return { code: 400 as const, error: 'recordId required for this paper' };
        const rec = await getRecord(tx, cid, recordId);
        if (!rec || rec.tableName !== PAPER_TABLE[paper]) return { code: 404 as const, error: 'paper not found' };
        const p = rec.payload as Record<string, unknown>;
        const onDay =
          p.blastDayId === id || (p.jobId === day.payload.jobId && p.date === day.payload.date);
        if (!onDay) return { code: 409 as const, error: 'that paper is not on this day' };
        const from = (p.status as string | undefined) ?? '';
        let next: Record<string, unknown> = {};
        if (paper === 'time_card') {
          paperLabel = label?.trim() || `Time card · ${String(p.personName ?? '')}`;
          next =
            to === 'approved'
              ? { status: 'approved', approvedAt: nowIso, approvedByUserId: actor.actorId, approvedByName: actor.actorName, sendBackNote: undefined, sendBackBy: undefined, sendBackAt: undefined }
              : { status: 'draft', filedAt: undefined, approvedAt: undefined, approvedByUserId: undefined, approvedByName: undefined, sendBackNote: note?.trim(), sendBackBy: actor.actorName, sendBackAt: nowIso };
        } else if (paper === 'drill_log') {
          paperLabel = label?.trim() || `Drill log · ${String(p.drillerName ?? '')}`;
          // approving records the sign-off; the pattern's acceptance stays the blaster's
          next =
            to === 'approved'
              ? {}
              : { status: 'open', sentBackAt: nowIso, sentBackByName: actor.actorName, reopenNote: note?.trim(), completedAt: undefined };
        } else {
          paperLabel = label?.trim() || `Rig checklist · ${String(p.drillerName ?? '')}`;
          next = to === 'approved' ? { sendBackNote: undefined, sendBackBy: undefined, sendBackAt: undefined } : { sendBackNote: note?.trim(), sendBackBy: actor.actorName, sendBackAt: nowIso };
        }
        if (Object.keys(next).length > 0) {
          await upsertRecord(tx, cid, recordId, rec.tableName, JSON.stringify({ ...p, ...next, updatedAt: nowIso }), nowIso);
          await writeAudit(tx, {
            companyId: cid,
            tableName: rec.tableName,
            recordId,
            op: 'PATCH',
            actor,
            changes: [
              ...(typeof next.status === 'string' ? [{ field: 'status', old: from, new: next.status }] : []),
              { field: 'review', old: null, new: to === 'approved' ? 'approved' : `sent back: ${note?.trim() ?? ''}` },
            ],
            reason: 'office review of a paper',
          });
        }
      }
      const reviews = { ...((day.payload.paperReviews as Record<string, unknown> | undefined) ?? {}) };
      reviews[key] = { status: to, byUserId: actor.actorId, byName: actor.actorName, at: nowIso, note: to === 'sent_back' ? note?.trim() : undefined, label: paperLabel };
      await upsertRecord(tx, cid, id, 'blastDays', JSON.stringify({ ...day.payload, paperReviews: reviews, updatedAt: nowIso }), nowIso);
      await writeAudit(tx, {
        companyId: cid,
        tableName: 'blastDays',
        recordId: id,
        op: 'PATCH',
        actor,
        changes: [{ field: `paperReviews.${key}`, old: null, new: to === 'approved' ? `approved · ${paperLabel}` : `sent back · ${paperLabel} · ${note?.trim() ?? ''}` }],
        reason: 'office review of a paper',
      });
      return { code: 200 as const, key };
    });
    if (result.code !== 200) {
      res.status(result.code).json({ error: result.error });
      return;
    }
    res.json({ ok: true, key: result.key });
  } catch (err) {
    console.error('paper review failed:', err);
    res.status(500).json({ error: 'the review did not save' });
  }
});

// ── Customer → Site → Job backfill ─────────────────────────────────────────
// Idempotent: every job lacking a siteId gets its legacy customer string
// turned into a Customer (deduped by normalized name) and its address into
// a Site under that customer (deduped by normalized address+city). Site
// carries the job's K factor/history, local reg, and contacts. Legacy job
// fields are left in place — readers fall back to them until synced.
const normKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

adminRouter.post('/backfill-hierarchy', requireRole('admin'), async (req: AuthedRequest, res: Response) => {
  const cid = req.companyId as string;
  try {
    const linked = await prisma.$transaction(async (tx) => {
      const load = async (table: string) =>
        (
          await tx.$queryRaw<{ id: string; payload: string }[]>`
            SELECT "id", "payload" FROM "records"
            WHERE "company_id" = ${cid} AND "table_name" = ${table}`
        ).map((r) => ({ id: r.id, payload: JSON.parse(r.payload) as Record<string, unknown> }));

      const jobs = await load('jobs');
      const customers = await load('customers');
      const sites = await load('sites');
      const now = new Date().toISOString();
      let count = 0;

      for (const job of jobs) {
        if (job.payload.siteId) continue;
        const customerName = String(job.payload.customer ?? '').trim() || 'Unknown customer';

        let customer = customers.find((c) => normKey(c.payload.name) === normKey(customerName));
        if (!customer) {
          const id = randomUUID();
          const payload = {
            id, name: customerName, isActive: true,
            createdAt: now, updatedAt: now, syncStatus: 'synced',
          };
          await upsertRecord(tx, cid, id, 'customers', JSON.stringify(payload), now);
          customer = { id, payload };
          customers.push(customer);
        }

        const addr = String(job.payload.address ?? '');
        const city = String(job.payload.city ?? '');
        const siteKey = normKey(addr || job.payload.name) + '|' + normKey(city);
        let site = sites.find(
          (s) =>
            s.payload.customerId === customer!.id &&
            normKey(String(s.payload.address ?? '') || String(s.payload.name ?? '')) + '|' + normKey(s.payload.city) === siteKey,
        );
        if (!site) {
          const id = randomUUID();
          const payload = {
            id,
            customerId: customer.id,
            name: [addr, city].filter(Boolean).join(', ') || String(job.payload.name ?? customerName),
            address: addr,
            city,
            state: String(job.payload.state ?? ''),
            kFactor: Number(job.payload.kFactor ?? 180),
            kFactorHistory: job.payload.kFactorHistory ?? [],
            ...(job.payload.localRegName !== undefined ? { localRegName: job.payload.localRegName } : {}),
            ...(job.payload.localPPVLimit !== undefined ? { localPPVLimit: job.payload.localPPVLimit } : {}),
            ...(job.payload.contacts !== undefined ? { contacts: job.payload.contacts } : {}),
            ...(job.payload.contactNotes !== undefined ? { contactNotes: job.payload.contactNotes } : {}),
            isActive: true,
            createdAt: now, updatedAt: now, syncStatus: 'synced',
          };
          await upsertRecord(tx, cid, id, 'sites', JSON.stringify(payload), now);
          site = { id, payload };
          sites.push(site);
        }

        await upsertRecord(
          tx, cid, job.id, 'jobs',
          JSON.stringify({ ...job.payload, customerId: customer.id, siteId: site.id, updatedAt: now }),
          now,
        );
        count++;
      }
      return count;
    });
    res.json({ ok: true, linked });
  } catch (err) {
    console.error('hierarchy backfill failed:', err);
    res.status(500).json({ error: 'backfill failed' });
  }
});
