// Crew enrollment: admin issues invites (email and/or copyable link),
// the crew member redeems one to create their own account.
//
// /admin/invites/* are admin-authed. /enroll/* are PUBLIC — the app's only
// unauthenticated writes — so: tokens hashed at rest, single-use, 14-day
// expiry, and a light per-IP rate limit.
import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, requireAdmin, type AuthedRequest } from './auth.js';
import { getRecord, upsertRecord } from './records.js';
import { writeAudit } from './auditWrite.js';

const ROLES = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'] as const;
const INVITE_TTL_DAYS = 14;
const APP_URL = (process.env.APP_URL ?? 'https://shotlog-app.vercel.app').replace(/\/$/, '');
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const INVITE_FROM = process.env.INVITE_FROM ?? 'ShotLog <onboarding@resend.dev>';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

// ── Light per-IP rate limit for the public endpoints ───────────────────────
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (++entry.count > 20) {
    res.status(429).json({ error: 'slow down' });
    return;
  }
  next();
}

async function sendInviteEmail(
  to: string,
  name: string,
  company: string,
  link: string,
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: INVITE_FROM,
        to: [to],
        subject: `${company} — set up your ShotLog account`,
        text:
          `Hi ${name},\n\n${company} uses ShotLog for blasting logs and daily reports. ` +
          `Set up your account here:\n\n${link}\n\n` +
          `The link works once and expires in ${INVITE_TTL_DAYS} days.`,
      }),
    });
    if (!res.ok) console.error('invite email failed:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('invite email failed:', err);
    return false;
  }
}

// ── Admin side ─────────────────────────────────────────────────────────────

export const invitesRouter = Router();
invitesRouter.use(requireAuth, requireAdmin);

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(ROLES).default('blaster'),
  crewMemberId: z.string().optional(),
});

invitesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'name required; email must be valid if given' });
    return;
  }
  const { name, email, role, crewMemberId } = parsed.data;
  const cid = req.companyId as string;

  if (email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      res.status(409).json({ error: 'a user with that email already exists' });
      return;
    }
  }
  // Re-inviting someone supersedes their previous unused invites
  if (crewMemberId) {
    await prisma.inviteToken.deleteMany({
      where: { companyId: cid, crewMemberId, usedAt: null },
    });
  }
  const raw = randomBytes(48).toString('base64url');
  await prisma.inviteToken.create({
    data: {
      tokenHash: hash(raw),
      companyId: cid,
      crewMemberId: crewMemberId ?? null,
      name,
      email: email ?? null,
      role,
      createdById: req.userId as string,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    },
  });
  const link = `${APP_URL}/enroll/${raw}`;
  const company = await prisma.company.findUnique({ where: { id: cid } });
  const emailed = email
    ? await sendInviteEmail(email, name, company?.name ?? 'Your company', link)
    : false;
  res.status(201).json({ ok: true, link, emailed });
});

/** Pending + redeemed invites, for status chips */
invitesRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const invites = await prisma.inviteToken.findMany({
    where: { companyId: req.companyId! },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      crewMemberId: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ invites });
});

// ── Public side ────────────────────────────────────────────────────────────

export const enrollRouter = Router();
enrollRouter.use(rateLimit);

async function findValidInvite(rawToken: string) {
  const invite = await prisma.inviteToken.findUnique({ where: { tokenHash: hash(rawToken) } });
  if (!invite) return { error: 'This invite link is not valid.' as const };
  if (invite.usedAt) return { error: 'This invite was already used — try logging in instead.' as const };
  if (invite.expiresAt < new Date())
    return { error: 'This invite has expired — ask your admin for a new one.' as const };
  return { invite };
}

enrollRouter.get('/:token', async (req: Request, res: Response) => {
  const token = req.params.token;
  if (typeof token !== 'string' || token.length < 32) {
    res.status(400).json({ error: 'This invite link is not valid.' });
    return;
  }
  const found = await findValidInvite(token);
  if ('error' in found) {
    res.status(410).json({ error: found.error });
    return;
  }
  const company = await prisma.company.findUnique({ where: { id: found.invite.companyId } });
  res.json({
    name: found.invite.name,
    role: found.invite.role,
    email: found.invite.email,
    company: company?.name ?? 'Your company',
  });
});

const enrollSchema = z.object({
  password: z.string().min(8),
  email: z.string().email().optional(),
});

enrollRouter.post('/:token', async (req: Request, res: Response) => {
  const token = req.params.token;
  const parsed = enrollSchema.safeParse(req.body);
  if (typeof token !== 'string' || !parsed.success) {
    res.status(400).json({ error: 'password of 8+ characters required' });
    return;
  }
  const found = await findValidInvite(token);
  if ('error' in found) {
    res.status(410).json({ error: found.error });
    return;
  }
  const invite = found.invite;
  const email = invite.email ?? parsed.data.email;
  if (!email) {
    res.status(400).json({ error: 'an email address is required' });
    return;
  }
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    res.status(409).json({ error: 'a user with that email already exists — try logging in' });
    return;
  }
  try {
    const user = await prisma.$transaction(async (tx) => {
      // Mark used FIRST with a guard — two racing submits can't both win
      const claimed = await tx.inviteToken.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error('already used');
      const created = await tx.user.create({
        data: {
          email,
          name: invite.name,
          role: invite.role,
          companyId: invite.companyId,
          passwordHash: await bcrypt.hash(parsed.data.password, 12),
        },
        select: { id: true, email: true, name: true, role: true },
      });
      if (invite.crewMemberId) {
        const crew = await getRecord(tx, invite.companyId, invite.crewMemberId);
        if (crew && crew.tableName === 'crewMembers') {
          const now = new Date().toISOString();
          await upsertRecord(
            tx,
            invite.companyId,
            invite.crewMemberId,
            'crewMembers',
            // role rides along as the roster tag — the dispatch picker uses it
            JSON.stringify({ ...crew.payload, userId: created.id, role: invite.role, updatedAt: now }),
            now,
          );
          await writeAudit(tx, {
            companyId: invite.companyId, tableName: 'crewMembers', recordId: invite.crewMemberId,
            op: 'PATCH',
            actor: { actorId: created.id, actorName: created.name, actorRole: invite.role },
            changes: [{ field: 'userId', new: created.id, note: 'enrolled via invite' }],
          });
        }
      }
      return created;
    });
    res.status(201).json({ ok: true, email: user.email });
  } catch (err) {
    if (err instanceof Error && err.message === 'already used') {
      res.status(410).json({ error: 'This invite was already used — try logging in instead.' });
      return;
    }
    console.error('enrollment failed:', err);
    res.status(500).json({ error: 'enrollment failed' });
  }
});
