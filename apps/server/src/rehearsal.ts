// Rehearsal mode (Round S6). The platform admin picks a role and is signed
// into the SANDBOX company as a brand-new person of that role — PIN, welcome,
// walkthrough, empty home — to judge the experience regularly without
// invites, throwaway emails or touching a customer's data. `end` wipes the
// sandbox. The sandbox is a real tenant: its own records bucket, seeded
// reference data, a roster of six rehearsal people. It is also the first
// company the platform ever creates programmatically.
//
// S7a (2026-09-07): Start copies the platform admin's OWN company's
// reference data — equipment, roster (logins stripped), catalog,
// manufacturers, settings, custom roles — into the sandbox so the fleet and
// the people are real; `withData: false` keeps the true blank slate. And
// /sample loads a connected week (rehearsalFixture.ts) instead of one job.
import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';
import {
  issueSession,
  requireAuth,
  requirePlatformAdmin,
  type AuthedRequest,
} from './auth.js';
import { seedCompanyReference } from './seed.js';
import { upsertRecord } from './records.js';
import { buildSampleWeek } from './rehearsalFixture.js';

export const SANDBOX_COMPANY_NAME = 'ShotLog Sandbox';

const ROLES = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'] as const;
type RehearsalRole = (typeof ROLES)[number];
const ROLE_NAME: Record<RehearsalRole, string> = {
  admin: 'Rehearsal Admin',
  supervisor: 'Rehearsal Supervisor',
  blaster: 'Rehearsal Blaster',
  driller: 'Rehearsal Driller',
  mechanic: 'Rehearsal Mechanic',
  office: 'Rehearsal Office',
};
const rehearsalEmail = (role: RehearsalRole) => `rehearsal-${role}@sandbox.shotlog`;

/** Tables copied from the platform admin's company on Start. Records are
 *  keyed per company, so ids are kept — links between them (catalog →
 *  manufacturer, roles) stay intact. */
const COPIED_TABLES = [
  'equipment',
  'crewMembers',
  'productCatalog',
  'manufacturers',
  'companySettings',
  'roleDefinitions',
] as const;

export async function ensureSandbox(): Promise<{ id: string; name: string }> {
  const existing = await prisma.company.findFirst({ where: { name: SANDBOX_COMPANY_NAME } });
  if (existing) {
    if (existing.environment !== 'sandbox') await prisma.company.update({ where: { id: existing.id }, data: { environment: 'sandbox' } });
    return existing;
  }
  return prisma.company.create({ data: { name: SANDBOX_COMPANY_NAME, environment: 'sandbox' } });
}

/** True when the request's company is the sandbox */
async function isSandboxRequest(req: AuthedRequest): Promise<boolean> {
  const sandbox = await prisma.company.findFirst({ where: { name: SANDBOX_COMPANY_NAME }, select: { id: true } });
  return Boolean(sandbox && req.companyId === sandbox.id);
}

/** One account per built-in role. Passwords are random and never shared —
 *  sessions are minted directly by /start. Idempotent. */
async function ensureRehearsalUsers(cid: string) {
  const out = [];
  for (const role of ROLES) {
    const email = rehearsalEmail(role);
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: {
          email,
          name: ROLE_NAME[role],
          role,
          companyId: cid,
          passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
        },
      }));
    out.push(user);
  }
  return out;
}

/** Back to day one for every rehearsal account: no welcome seen, no tour,
 *  no PIN, no license, no signature; every old session revoked. */
async function resetFirstRun(cid: string): Promise<void> {
  const users = await prisma.user.findMany({ where: { companyId: cid }, select: { id: true } });
  await prisma.user.updateMany({
    where: { companyId: cid },
    data: {
      onboardedAt: null,
      tourDoneAt: null,
      toursDone: [],
      pinHash: null,
      licenses: [],
      signature: null,
      mustChangePassword: false,
      isActive: true,
    },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
}

/** Copy one company's reference data into another. People lose their
 *  login link (nobody can sign in as them); machines lose their usual
 *  operator (a login in the source company). The source is only read. */
export async function copyCompanyData(fromCid: string, toCid: string): Promise<number> {
  const rows = await prisma.record.findMany({
    where: { companyId: fromCid, tableName: { in: [...COPIED_TABLES] } },
  });
  const now = new Date().toISOString();
  const data = [];
  for (const r of rows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(r.payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (r.tableName === 'crewMembers') delete payload.userId;
    if (r.tableName === 'equipment') delete payload.assignedUserId;
    payload.syncStatus = 'synced';
    data.push({ id: r.id, companyId: toCid, tableName: r.tableName, payload: JSON.stringify(payload), updatedAt: now });
  }
  if (data.length > 0) await prisma.record.createMany({ data, skipDuplicates: true });
  return data.length;
}

/** Empty the sandbox of everything a rehearsal produced, then put back the
 *  reference data (copied from `sourceCid` when given, seeded otherwise)
 *  and the six-person roster. */
export async function wipeSandbox(cid: string, sourceCid?: string): Promise<number> {
  await prisma.$executeRaw`DELETE FROM "records" WHERE "company_id" = ${cid}`;
  await prisma.auditEntry.deleteMany({ where: { companyId: cid } });
  await prisma.feedback.deleteMany({ where: { companyId: cid } });
  await prisma.inviteToken.deleteMany({ where: { companyId: cid } });
  const copied = sourceCid && sourceCid !== cid ? await copyCompanyData(sourceCid, cid) : 0;
  await seedCompanyReference(cid);
  const now = new Date().toISOString();
  const users = await prisma.user.findMany({ where: { companyId: cid } });
  for (const u of users) {
    const id = randomUUID();
    await upsertRecord(
      prisma,
      cid,
      id,
      'crewMembers',
      JSON.stringify({
        id,
        name: u.name,
        role: u.role,
        userId: u.id,
        isActive: true,
        licenseNumber: '',
        licenseState: '',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
      }),
      now,
    );
  }
  return copied;
}

async function recordCount(cid: string, tableName: string): Promise<number> {
  return prisma.record.count({ where: { companyId: cid, tableName } });
}

export const rehearsalRouter = Router();

const startSchema = z.object({ role: z.enum(ROLES), withData: z.boolean().optional() });

/** Platform admin → fresh sandbox + a session as the chosen role. With
 *  `withData` (default) the sandbox starts with the admin's own company's
 *  fleet, roster, catalog and settings. */
rehearsalRouter.post('/start', requireAuth, requirePlatformAdmin, async (req: AuthedRequest, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'role required' });
    return;
  }
  const sandbox = await ensureSandbox();
  const users = await ensureRehearsalUsers(sandbox.id);
  const withData = parsed.data.withData !== false && req.companyId !== sandbox.id;
  const copied = await wipeSandbox(sandbox.id, withData ? req.companyId : undefined);
  await resetFirstRun(sandbox.id);
  const user = users.find((u) => u.role === parsed.data.role)!;
  const session = await issueSession(user.id);
  console.log(`[rehearsal] ${req.userId} started as ${parsed.data.role} (${withData ? `${copied} records copied` : 'empty'})`);
  res.json({ ...session, sandbox, role: parsed.data.role, withData, copied });
});

/** From inside the sandbox: wipe it (the client then restores the real session) */
rehearsalRouter.post('/end', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!(await isSandboxRequest(req))) {
    res.status(403).json({ error: 'not a rehearsal session' });
    return;
  }
  const cid = req.companyId as string;
  await wipeSandbox(cid);
  await resetFirstRun(cid);
  res.json({ ok: true });
});

const sampleSchema = z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** A connected week so every role has real work: two jobs, a plan half
 *  drilled, yesterday submitted with cards, today's draft, a rig in the
 *  shop, a rig due for service, an open incident. The client sends ITS
 *  local date — the server's clock is UTC. Idempotent. */
rehearsalRouter.post('/sample', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (!(await isSandboxRequest(req))) {
    res.status(403).json({ error: 'not a rehearsal session' });
    return;
  }
  const cid = req.companyId as string;
  if ((await recordCount(cid, 'jobs')) > 0) {
    res.json({ ok: true, existing: true });
    return;
  }
  const parsed = sampleSchema.safeParse(req.body ?? {});
  const today = (parsed.success && parsed.data.today) || new Date().toISOString().slice(0, 10);
  const users = await prisma.user.findMany({
    where: { companyId: cid },
    select: { id: true, name: true, role: true },
  });
  const summary = await buildSampleWeek(cid, users, today);
  res.json({ ok: true, ...summary });
});

/** Harness + curiosity: what is in the sandbox right now (+ the platform
 *  admin's own company's record count, to prove Start never writes it) */
rehearsalRouter.get('/status', requireAuth, requirePlatformAdmin, async (req: AuthedRequest, res) => {
  const sandbox = await prisma.company.findFirst({ where: { name: SANDBOX_COMPANY_NAME } });
  const home = req.companyId
    ? { companyId: req.companyId, records: await prisma.record.count({ where: { companyId: req.companyId } }) }
    : null;
  if (!sandbox) {
    res.json({ sandbox: null, home });
    return;
  }
  const rows = await prisma.record.groupBy({
    by: ['tableName'],
    where: { companyId: sandbox.id },
    _count: { _all: true },
  });
  const users = await prisma.user.findMany({
    where: { companyId: sandbox.id },
    select: { email: true, role: true, onboardedAt: true, tourDoneAt: true, toursDone: true, pinHash: true },
  });
  res.json({
    sandbox,
    home,
    tables: Object.fromEntries(rows.map((r) => [r.tableName, r._count._all])),
    users: users.map((u) => ({ ...u, pinHash: Boolean(u.pinHash) })),
  });
});
