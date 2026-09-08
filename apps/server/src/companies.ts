// Companies (Round S8c). Matthew: "Baystate Blasting (Alpha)" for his own
// testing, "(Beta)" for the testers he is about to onboard, plain "Baystate
// Blasting" at go-live. Every company carries an ENVIRONMENT; a platform
// admin switches between companies through hidden admin TWINS (one per
// company, `User.platformRootId`), creates a company from another's
// reference data, renames, moves people at go-live, and deletes test
// companies. Platform-level: gated by the platform-admin marker, never by a
// company role (docs/personas/platform-admin.md).
import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';
import { issueSession, requireAuth, requirePlatformAdmin, type AuthedRequest } from './auth.js';
import { copyCompanyData, SANDBOX_COMPANY_NAME } from './rehearsal.js';
import { seedCompanyReference } from './seed.js';
import { getRecord, parsePayloadSafe, upsertRecord } from './records.js';

export const ENVIRONMENTS = ['alpha', 'beta', 'production', 'sandbox'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const companiesRouter = Router();
companiesRouter.use(requireAuth, requirePlatformAdmin);

/** The real platform-admin account behind a session (a twin points at it) */
async function rootUserOf(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (!user.platformRootId) return user;
  return prisma.user.findUnique({ where: { id: user.platformRootId } });
}

/** Twin email: the root's address with a per-company tag — unique, routes
 *  to the same inbox, and still matches the platform-admin list once the
 *  tag is stripped (auth.ts) */
export function twinEmail(rootEmail: string, companyId: string): string {
  const [local, domain] = rootEmail.split('@');
  return `${local}+c-${companyId.slice(0, 8)}@${domain}`;
}

async function companySummary(c: { id: string; name: string; environment: string; createdAt: Date }, current: string) {
  const [people, records] = await Promise.all([
    prisma.user.count({ where: { companyId: c.id, isActive: true, platformRootId: null } }),
    prisma.record.count({ where: { companyId: c.id } }),
  ]);
  return { id: c.id, name: c.name, environment: c.environment, createdAt: c.createdAt.toISOString(), people, records, current: c.id === current };
}

companiesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ companies: await Promise.all(companies.map((c) => companySummary(c, req.companyId as string))) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  environment: z.enum(['alpha', 'beta', 'production']),
  fromCompanyId: z.string().optional(),
});

/** A new company, started from another company's reference data (the
 *  rehearsal copy: equipment, roster without logins, catalog, manufacturers,
 *  settings, custom roles) or empty (seeded catalog + manufacturers only) */
companiesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'name and environment required' });
    return;
  }
  const { name, environment, fromCompanyId } = parsed.data;
  if (await prisma.company.findFirst({ where: { name } })) {
    res.status(409).json({ error: 'a company with that name exists' });
    return;
  }
  const company = await prisma.company.create({ data: { name, environment } });
  let copied = 0;
  if (fromCompanyId) {
    if (!(await prisma.company.findUnique({ where: { id: fromCompanyId } }))) {
      res.status(404).json({ error: 'source company not found' });
      return;
    }
    copied = await copyCompanyData(fromCompanyId, company.id);
  }
  await seedCompanyReference(company.id);
  // The copied settings doc carries the source's name — the new company's own
  await setSettingsName(company.id, name);
  console.log(`[companies] ${req.userId} created "${name}" (${environment}${fromCompanyId ? `, ${copied} records from ${fromCompanyId}` : ', empty'})`);
  res.status(201).json({ company: await companySummary(company, req.companyId as string), copied });
});

/** Keep the synced companySettings doc's name in step with Company.name */
async function setSettingsName(cid: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  const id = 'companySettings-singleton';
  await prisma.$transaction(async (tx) => {
    const stored = await getRecord(tx, cid, id);
    const doc = { ...(stored?.payload ?? { id, createdAt: now, syncStatus: 'synced' }), companyName: name, updatedAt: now };
    await upsertRecord(tx, cid, id, 'companySettings', JSON.stringify(doc), now);
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  environment: z.enum(['alpha', 'beta', 'production']).optional(),
});

companiesRouter.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!parsed.success || !company) {
    res.status(company ? 400 : 404).json({ error: company ? 'nothing to change' : 'company not found' });
    return;
  }
  if (company.name === SANDBOX_COMPANY_NAME) {
    res.status(400).json({ error: 'the sandbox is managed by rehearsal' });
    return;
  }
  const updated = await prisma.company.update({ where: { id: company.id }, data: parsed.data });
  if (parsed.data.name) await setSettingsName(company.id, parsed.data.name);
  res.json({ company: await companySummary(updated, req.companyId as string) });
});

/** Become this company's hidden admin twin (created on first entry). The
 *  twin is born onboarded: no welcome, no tour; licenses and signature come
 *  along so the platform admin can sign things while testing. */
companiesRouter.post('/:id/switch', async (req: AuthedRequest, res: Response) => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  const root = await rootUserOf(req.userId as string);
  if (!company || !root) {
    res.status(404).json({ error: 'company not found' });
    return;
  }
  if (company.name === SANDBOX_COMPANY_NAME) {
    res.status(400).json({ error: 'the sandbox is entered through rehearsal' });
    return;
  }
  let user = root.companyId === company.id ? root : await prisma.user.findFirst({ where: { platformRootId: root.id, companyId: company.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: twinEmail(root.email, company.id),
        name: root.name,
        role: 'admin',
        companyId: company.id,
        platformRootId: root.id,
        passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
        onboardedAt: new Date(),
        tourDoneAt: new Date(),
        toursDone: root.toursDone ?? [],
        licenses: root.licenses ?? [],
        signature: root.signature,
        pinHash: root.pinHash,
      },
    });
    await ensureRosterLink(company.id, user.id, user.name, user.role);
  }
  const session = await issueSession(user.id);
  console.log(`[companies] ${root.email} switched to "${company.name}"`);
  res.json({ ...session, company: await companySummary(company, company.id) });
});

/** A crewMembers record linked to this login in the company — the copied
 *  roster keeps ids, so a person from the reference data is re-linked by
 *  id; otherwise the source's record is copied (or a fresh one made). */
async function ensureRosterLink(cid: string, userId: string, name: string, role: string, source?: { cid: string }): Promise<void> {
  const now = new Date().toISOString();
  const rows = await prisma.record.findMany({ where: { companyId: cid, tableName: 'crewMembers' } });
  const already = rows.find((r) => parsePayloadSafe(r.payload).userId === userId);
  if (already) return;
  let base: Record<string, unknown> | null = null;
  if (source) {
    const src = (await prisma.record.findMany({ where: { companyId: source.cid, tableName: 'crewMembers' } })).find(
      (r) => parsePayloadSafe(r.payload).userId === userId,
    );
    if (src) {
      const copy = rows.find((r) => r.id === src.id);
      base = { ...parsePayloadSafe((copy ?? src).payload), id: src.id };
    }
  }
  const id = (base?.id as string | undefined) ?? randomUUID();
  const payload = {
    ...(base ?? { name, role, isActive: true, licenseNumber: '', licenseState: '', createdAt: now }),
    id,
    userId,
    isActive: true,
    updatedAt: now,
    syncStatus: 'synced',
  };
  await upsertRecord(prisma, cid, id, 'crewMembers', JSON.stringify(payload), now);
}

const moveSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(200) });

/** Go-live: move people from the caller's company to this one. The account
 *  moves whole (email, password, role, licenses, signature, PIN); the roster
 *  entry is linked in the target; their old records stay; refresh tokens
 *  are revoked so each device signs in once and downloads the new company. */
companiesRouter.post('/:id/move-people', async (req: AuthedRequest, res: Response) => {
  const parsed = moveSchema.safeParse(req.body);
  const target = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!parsed.success || !target) {
    res.status(target ? 400 : 404).json({ error: target ? 'userIds required' : 'company not found' });
    return;
  }
  const from = req.companyId as string;
  if (target.id === from) {
    res.status(400).json({ error: 'already in this company' });
    return;
  }
  const users = await prisma.user.findMany({ where: { id: { in: parsed.data.userIds }, companyId: from, platformRootId: null } });
  const roots = new Set((await prisma.user.findMany({ where: { platformRootId: { not: null } }, select: { platformRootId: true } })).map((u) => u.platformRootId));
  const movable = users.filter((u) => !roots.has(u.id) && u.id !== req.userId);
  for (const u of movable) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { companyId: target.id } });
      await tx.refreshToken.deleteMany({ where: { userId: u.id } });
    });
    await ensureRosterLink(target.id, u.id, u.name, u.role, { cid: from });
  }
  console.log(`[companies] ${req.userId} moved ${movable.length} people → "${target.name}"`);
  res.json({ moved: movable.length, skipped: parsed.data.userIds.length - movable.length });
});

/** Test companies only: never production, never the one you are in, never
 *  the sandbox (rehearsal owns it). Wipes everything the company held. */
companiesRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const company = await prisma.company.findUnique({ where: { id: String(req.params.id) } });
  if (!company) {
    res.status(404).json({ error: 'company not found' });
    return;
  }
  if (company.environment === 'production' || company.name === SANDBOX_COMPANY_NAME) {
    res.status(400).json({ error: 'only alpha or beta companies can be deleted' });
    return;
  }
  if (company.id === req.companyId) {
    res.status(400).json({ error: 'switch to another company first' });
    return;
  }
  const users = await prisma.user.findMany({ where: { companyId: company.id }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "records" WHERE "company_id" = ${company.id}`;
    await tx.auditEntry.deleteMany({ where: { companyId: company.id } });
    await tx.feedback.deleteMany({ where: { companyId: company.id } });
    await tx.inviteToken.deleteMany({ where: { companyId: company.id } });
    await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await tx.passwordReset.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { companyId: company.id } });
    await tx.company.delete({ where: { id: company.id } });
  });
  console.log(`[companies] ${req.userId} deleted "${company.name}" (${ids.length} users)`);
  res.json({ ok: true });
});
