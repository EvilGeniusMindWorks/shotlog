import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { requireAuth, requireAdmin, type AuthedRequest } from './auth.js';
import { parsePayloadSafe, upsertRecord } from './records.js';
import { resolveActor, writeAudit } from './auditWrite.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdmin);

const ROLES = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'] as const;

// ── People model: every login IS a roster person ────────────────────────────
// The synced crewMembers record is the person; a User account is the person's
// login. These helpers keep the two in lockstep server-side so a "ghost"
// user (login with no roster entry) can no longer exist, and role/name/
// active-state edits land on both sides in one action.

type CrewRow = { id: string; payload: Record<string, unknown> };

async function listCrewRecords(tx: Prisma.TransactionClient, cid: string): Promise<CrewRow[]> {
  const rows = await tx.$queryRaw<{ id: string; payload: string }[]>`
    SELECT "id", "payload" FROM "records"
    WHERE "company_id" = ${cid} AND "table_name" = 'crewMembers'`;
  return rows.map((r) => ({ id: r.id, payload: parsePayloadSafe(r.payload) }));
}

const normName = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Find the roster record linked to a user (userId first, then an unlinked
 *  name match), patch it — or create one. Returns the crew record id. */
async function syncCrewForUser(
  tx: Prisma.TransactionClient,
  cid: string,
  user: { id: string; name: string; role: string; isActive?: boolean },
  preferCrewId?: string,
  actor?: { actorId: string; actorName: string; actorRole: string },
): Promise<string> {
  const crew = await listCrewRecords(tx, cid);
  const linked =
    (preferCrewId ? crew.find((c) => c.id === preferCrewId) : undefined) ??
    crew.find((c) => c.payload.userId === user.id) ??
    crew.find((c) => !c.payload.userId && normName(c.payload.name) === normName(user.name));
  const now = new Date().toISOString();
  if (linked) {
    await upsertRecord(
      tx,
      cid,
      linked.id,
      'crewMembers',
      JSON.stringify({
        ...linked.payload,
        userId: user.id,
        name: user.name,
        role: user.role,
        ...(user.isActive !== undefined ? { isActive: user.isActive } : {}),
        updatedAt: now,
      }),
      now,
    );
    if (actor) {
      await writeAudit(tx, {
        companyId: cid, tableName: 'crewMembers', recordId: linked.id, op: 'PATCH',
        actor, changes: [{ field: '*', note: `roster synced from login (${user.name})` }],
      });
    }
    return linked.id;
  }
  const id = randomUUID();
  await upsertRecord(
    tx,
    cid,
    id,
    'crewMembers',
    JSON.stringify({
      id,
      name: user.name,
      licenseNumber: '',
      licenseState: '',
      isActive: user.isActive ?? true,
      userId: user.id,
      role: user.role,
      createdAt: now,
      updatedAt: now,
    }),
    now,
  );
  if (actor) {
    await writeAudit(tx, {
      companyId: cid, tableName: 'crewMembers', recordId: id, op: 'PUT',
      actor, changes: [{ field: '*', note: `roster entry created for login (${user.name})` }],
    });
  }
  return id;
}

/** List the company's users (licenses included for expiry surfacing) */
usersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.companyId! },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      licenses: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ users });
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  tempPassword: z.string().min(8),
  /** Existing roster person this login belongs to (People page row action) */
  crewMemberId: z.string().min(1).optional(),
});

/** Create a user in the admin's company with a temporary password */
usersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email, name, role, and tempPassword (8+ chars) required' });
    return;
  }
  const { email, name, role, tempPassword, crewMemberId } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'a user with that email already exists' });
    return;
  }
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        role,
        companyId: req.companyId!,
        passwordHash: await bcrypt.hash(tempPassword, 12),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    // every login is a roster person — link or create the crew record
    await syncCrewForUser(tx, req.companyId!, created, crewMemberId, await resolveActor(req.userId, req.role));
    return created;
  });
  res.status(201).json({ user });
});

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.role !== undefined, {
    message: 'nothing to update',
  });

/** Edit a user's name, email, or role. Role changes revoke all sessions. */
usersRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  const rawId = req.params.id;
  if (!parsed.success || typeof rawId !== 'string') {
    res.status(400).json({ error: 'provide name, email, and/or role' });
    return;
  }
  const user = await prisma.user.findFirst({ where: { id: rawId, companyId: req.companyId! } });
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  const { name, email, role } = parsed.data;
  if (role !== undefined && rawId === req.userId && role !== 'admin') {
    res.status(400).json({ error: "you can't remove your own admin role" });
    return;
  }
  if (email !== undefined && email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      res.status(409).json({ error: 'a user with that email already exists' });
      return;
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    // one role/name per person: the roster record follows the login
    if (name !== undefined || role !== undefined) {
      await syncCrewForUser(tx, req.companyId!, u, undefined, await resolveActor(req.userId, req.role));
    }
    return u;
  });
  if (role !== undefined && role !== user.role) {
    // The role claim lives in the access token (≤1h). Revoking refresh
    // tokens forces a fresh login — and fresh claims — within that window.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true, user: updated });
});

const idSchema = z.object({ id: z.string().min(1) });

/** Deactivate (revokes all sessions) or reactivate a user */
usersRouter.post('/:id/set-active', async (req: AuthedRequest, res: Response) => {
  const rawId = req.params.id;
  const id = typeof rawId === 'string' && idSchema.safeParse({ id: rawId }).success ? rawId : null;
  const active = Boolean((req.body as { active?: boolean })?.active);
  if (!id) {
    res.status(400).json({ error: 'user id required' });
    return;
  }
  if (id === req.userId && !active) {
    res.status(400).json({ error: "you can't deactivate yourself" });
    return;
  }
  const user = await prisma.user.findFirst({ where: { id, companyId: req.companyId! } });
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { isActive: active },
      select: { id: true, name: true, role: true, isActive: true },
    });
    // ONE deactivate switch: the person leaves (or rejoins) the roster too
    await syncCrewForUser(tx, req.companyId!, u, undefined, await resolveActor(req.userId, req.role));
  });
  if (!active) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true });
});

/** Idempotent backfill: every active user gets a linked roster record.
 *  Called by the People page on mount — heals pre-merge "ghost" users. */
usersRouter.post('/backfill-roster', async (req: AuthedRequest, res: Response) => {
  const linked = await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: { companyId: req.companyId! },
      select: { id: true, name: true, role: true, isActive: true },
    });
    const crew = await listCrewRecords(tx, req.companyId!);
    const byUserId = new Set(crew.map((c) => c.payload.userId).filter(Boolean));
    let count = 0;
    for (const u of users) {
      if (byUserId.has(u.id)) continue;
      await syncCrewForUser(tx, req.companyId!, u, undefined, await resolveActor(req.userId, req.role));
      count++;
    }
    return count;
  });
  res.json({ ok: true, linked });
});

const resetSchema = z.object({ tempPassword: z.string().min(8) });

/** Admin reset: set a temporary password, revoke sessions */
usersRouter.post('/:id/reset-password', async (req: AuthedRequest, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'tempPassword (8+ chars) required' });
    return;
  }
  const rawId = req.params.id;
  if (typeof rawId !== 'string') {
    res.status(400).json({ error: 'user id required' });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { id: rawId, companyId: req.companyId! },
  });
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.tempPassword, 12) },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.json({ ok: true });
});
