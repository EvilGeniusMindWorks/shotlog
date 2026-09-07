// Rehearsal mode (Round S6). The platform admin picks a role and is signed
// into the SANDBOX company as a brand-new person of that role — PIN, welcome,
// walkthrough, empty home — to judge the experience regularly without
// invites, throwaway emails or touching a customer's data. `end` wipes the
// sandbox. The sandbox is a real tenant: its own records bucket, seeded
// reference data, a roster of six rehearsal people. It is also the first
// company the platform ever creates programmatically.
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

export async function ensureSandbox(): Promise<{ id: string; name: string }> {
  const existing = await prisma.company.findFirst({ where: { name: SANDBOX_COMPANY_NAME } });
  if (existing) return existing;
  return prisma.company.create({ data: { name: SANDBOX_COMPANY_NAME } });
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
      pinHash: null,
      licenses: [],
      signature: null,
      mustChangePassword: false,
      isActive: true,
    },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
}

/** Empty the sandbox of everything a rehearsal produced, then put back the
 *  reference data and the six-person roster. */
export async function wipeSandbox(cid: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "records" WHERE "company_id" = ${cid}`;
  await prisma.auditEntry.deleteMany({ where: { companyId: cid } });
  await prisma.feedback.deleteMany({ where: { companyId: cid } });
  await prisma.inviteToken.deleteMany({ where: { companyId: cid } });
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
}

async function recordCount(cid: string, tableName: string): Promise<number> {
  return prisma.record.count({ where: { companyId: cid, tableName } });
}

export const rehearsalRouter = Router();

const startSchema = z.object({ role: z.enum(ROLES) });

/** Platform admin → fresh sandbox + a session as the chosen role */
rehearsalRouter.post('/start', requireAuth, requirePlatformAdmin, async (req: AuthedRequest, res: Response) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'role required' });
    return;
  }
  const sandbox = await ensureSandbox();
  const users = await ensureRehearsalUsers(sandbox.id);
  await wipeSandbox(sandbox.id);
  await resetFirstRun(sandbox.id);
  const user = users.find((u) => u.role === parsed.data.role)!;
  const session = await issueSession(user.id);
  console.log(`[rehearsal] ${req.userId} started as ${parsed.data.role}`);
  res.json({ ...session, sandbox, role: parsed.data.role });
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

/** One customer · site · job · rig so every role has something to work with */
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
  const now = new Date().toISOString();
  const base = { createdAt: now, updatedAt: now, syncStatus: 'synced' };
  const customerId = randomUUID();
  const siteId = randomUUID();
  const jobId = randomUUID();
  const rigId = randomUUID();
  const put = (id: string, table: string, payload: Record<string, unknown>) =>
    upsertRecord(prisma, cid, id, table, JSON.stringify({ id, ...base, ...payload }), now);
  await put(customerId, 'customers', {
    name: 'Granite Ridge Construction',
    status: 'active',
    isActive: true,
    phone: '(413) 555-0142',
    paymentTerms: 'Net 30',
  });
  await put(siteId, 'sites', {
    customerId,
    name: 'Ledgeville Pit',
    address: '410 Quarry Rd',
    city: 'Westfield',
    state: 'MA',
    zip: '01085',
    kFactor: 180,
    kFactorHistory: [],
    rockType: 'Granite',
    permits: [
      { id: randomUUID(), name: 'Blasting permit', number: 'BP-2026-114', authority: 'Westfield FD', expiresAt: '2026-11-30' },
    ],
  });
  await put(jobId, 'jobs', {
    name: 'Ledgeville Pit — Phase 1',
    jobNumber: '26-001',
    jobStatus: 'active',
    customerId,
    siteId,
    operation: 'quarry',
    typeOfRock: 'Granite',
    typeOfTerrain: 'Bench',
    defaultHazards: 'Overhead lines on the east boundary',
    defaultPrecautions: 'Mats on the east side; flagger at the gate',
    isActive: true,
    customer: 'Granite Ridge Construction',
    address: '410 Quarry Rd',
    city: 'Westfield',
    state: 'MA',
    kFactor: 180,
    kFactorHistory: [],
  });
  await put(rigId, 'equipment', {
    assetNumber: 'R-101',
    description: 'Track drill',
    category: 'rock_drill',
    isActive: true,
    status: 'active',
    make: 'Sandvik',
    model: 'DX800',
    hourMeter: 1240,
  });
  res.json({ ok: true, jobId, siteId, customerId, rigId });
});

/** Harness + curiosity: what is in the sandbox right now */
rehearsalRouter.get('/status', requireAuth, requirePlatformAdmin, async (_req, res) => {
  const sandbox = await prisma.company.findFirst({ where: { name: SANDBOX_COMPANY_NAME } });
  if (!sandbox) {
    res.json({ sandbox: null });
    return;
  }
  const rows = await prisma.record.groupBy({
    by: ['tableName'],
    where: { companyId: sandbox.id },
    _count: { _all: true },
  });
  const users = await prisma.user.findMany({
    where: { companyId: sandbox.id },
    select: { email: true, role: true, onboardedAt: true, tourDoneAt: true, pinHash: true },
  });
  res.json({
    sandbox,
    tables: Object.fromEntries(rows.map((r) => [r.tableName, r._count._all])),
    users: users.map((u) => ({ ...u, pinHash: Boolean(u.pinHash) })),
  });
});
