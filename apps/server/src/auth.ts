import { createHash, randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';
import { parsePayloadSafe, upsertRecord } from './records.js';
import { APP_URL, emailEnabled, resetMail, sendEmail } from './email.js';
import { rateLimit } from './rateLimit.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

const ACCESS_TTL = '1h';
const REFRESH_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 60;
// Dev/harness only: when email is OFF, /auth/forgot may echo the reset link
// so the flow can be exercised without a mailbox. Never set in production.
const DEBUG_LINKS = process.env.AUTH_DEBUG_LINKS === '1';

/**
 * Platform admins — the software vendor (Matthew), NOT a company role.
 * Accounts whose email is listed in PLATFORM_ADMIN_EMAILS (comma-separated),
 * falling back to the bootstrap ADMIN_EMAIL. Deliberately env-based and
 * OUTSIDE the company roles/capability engine (docs/personas/platform-admin.md):
 * "admin" is the top of a company, not of the platform. First consumer:
 * feedback triage (Round S3).
 */
const PLATFORM_ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.PLATFORM_ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isPlatformAdminEmail(email: string): boolean {
  return PLATFORM_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/** A twin's email is the root's with a "+c-<id>" tag (companies.ts) — strip
 *  it ONLY for twins so an invited plus-address never gains the marker */
export function isPlatformAdminUser(user: { email: string; platformRootId?: string | null }): boolean {
  if (!user.platformRootId) return isPlatformAdminEmail(user.email);
  return isPlatformAdminEmail(user.email.replace(/\+c-[0-9a-f]+@/i, '@'));
}

export function platformAdminEmails(): string[] {
  return [...PLATFORM_ADMIN_EMAILS];
}

/** Route guard: signed-in user must be a platform admin (use after requireAuth) */
export async function requirePlatformAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId ?? '' },
    select: { email: true, isActive: true, platformRootId: true },
  });
  if (!user || !user.isActive || !isPlatformAdminUser(user)) {
    res.status(403).json({ error: 'platform admin only' });
    return;
  }
  next();
}

export interface AuthedRequest extends Request {
  userId?: string;
  companyId?: string;
  role?: string;
}

interface AccessClaims {
  sub: string;
  cid: string;
  role: string;
}

function signAccess(user: { id: string; companyId: string; role: string }): string {
  return jwt.sign({ sub: user.id, cid: user.companyId, role: user.role }, JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
    },
  });
  return token;
}

/** The user shape every session response carries (login, enroll, reset, /me) */
type SessionUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
  licenses: unknown;
  signature: string | null;
  pinHash: string | null;
  mustChangePassword: boolean;
  onboardedAt: Date | null;
  tourDoneAt: Date | null;
  toursDone: unknown;
  platformRootId?: string | null;
  company: { name: string; environment?: string };
};

function publicUser(user: SessionUserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company.name,
    companyId: user.companyId,
    // alpha | beta | production | sandbox (S8c) — the header tag
    environment: user.company.environment ?? 'production',
    licenses: user.licenses,
    signature: user.signature,
    pinHash: user.pinHash,
    mustChangePassword: user.mustChangePassword,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    tourDoneAt: user.tourDoneAt?.toISOString() ?? null,
    toursDone: Array.isArray(user.toursDone) ? (user.toursDone as string[]) : [],
    // Vendor-level marker (feedback triage) — never a company role
    platformAdmin: isPlatformAdminUser(user),
  };
}

/** Mint a full session (tokens + profile) — shared by login, enrollment
 *  and password reset so every entry path lands the user signed in. */
export async function issueSession(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
  if (!user) throw new Error('user not found');
  return {
    accessToken: signAccess(user),
    refreshToken: await issueRefreshToken(user.id),
    user: publicUser(user),
  };
}

/** Create the bootstrap admin user from env on first boot */
export async function ensureAdminUser(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Blaster';
  if (!email || !password) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — no bootstrap user created');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;
  const companyName = process.env.COMPANY_NAME ?? 'Baystate Blasting, Inc.';
  let company = await prisma.company.findFirst({ where: { name: companyName } });
  company ??= await prisma.company.create({ data: { name: companyName } });
  await prisma.user.create({
    data: {
      email,
      name,
      role: 'admin',
      companyId: company.id,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Bootstrap admin created: ${email} (${companyName})`);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'missing token' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AccessClaims;
    req.userId = payload.sub;
    req.companyId = payload.cid;
    req.role = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (req.role !== 'admin') {
    res.status(403).json({ error: 'admin only' });
    return;
  }
  next();
}

/** Route guard for a specific set of roles, e.g. requireRole('admin', 'supervisor') */
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.role ?? '')) {
      res.status(403).json({ error: 'insufficient role' });
      return;
    }
    next();
  };
}

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
  // Constant-shape response for bad email / bad password / deactivated
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({
    accessToken: signAccess(user),
    refreshToken: await issueRefreshToken(user.id),
    user: publicUser(user),
  });
});

// ── Forgot / reset password (public, rate-limited) ──────────────────────────
// Always answers 200 for a well-formed email so the endpoint can't be used
// to enumerate accounts. `emailConfigured` is a SERVER fact (not a user
// fact) and lets the client say "email isn't set up — ask your admin".

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot', rateLimit, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email required' });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
    include: { company: true },
  });
  let debugLink: string | undefined;
  if (user) {
    // One live reset per user — a new request supersedes the old link
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
    const raw = randomBytes(48).toString('base64url');
    await prisma.passwordReset.create({
      data: {
        tokenHash: hashToken(raw),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });
    const link = `${APP_URL}/reset/${raw}`;
    await sendEmail(
      resetMail({ to: user.email, name: user.name, company: user.company.name, link, ttlMinutes: RESET_TTL_MINUTES }),
    );
    if (DEBUG_LINKS && !emailEnabled()) debugLink = link;
  }
  res.json({ ok: true, emailConfigured: emailEnabled(), ...(debugLink ? { debugLink } : {}) });
});

async function findValidReset(rawToken: string) {
  const reset = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!reset || !reset.user.isActive) return { error: 'This reset link is not valid.' as const };
  if (reset.usedAt) return { error: 'This reset link was already used — sign in with your new password.' as const };
  if (reset.expiresAt < new Date())
    return { error: 'This reset link has expired — request a new one from the sign-in screen.' as const };
  return { reset };
}

authRouter.get('/reset/:token', rateLimit, async (req, res) => {
  const token = req.params.token;
  if (typeof token !== 'string' || token.length < 32) {
    res.status(400).json({ error: 'This reset link is not valid.' });
    return;
  }
  const found = await findValidReset(token);
  if ('error' in found) {
    res.status(410).json({ error: found.error });
    return;
  }
  res.json({ name: found.reset.user.name, email: found.reset.user.email });
});

const resetSchema = z.object({ password: z.string().min(8) });

authRouter.post('/reset/:token', rateLimit, async (req, res) => {
  const token = req.params.token;
  const parsed = resetSchema.safeParse(req.body);
  if (typeof token !== 'string' || !parsed.success) {
    res.status(400).json({ error: 'password of 8+ characters required' });
    return;
  }
  const found = await findValidReset(token);
  if ('error' in found) {
    res.status(410).json({ error: found.error });
    return;
  }
  const { reset } = found;
  try {
    await prisma.$transaction(async (tx) => {
      // Claim first with a guard — two racing submits can't both win
      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error('already used');
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: await bcrypt.hash(parsed.data.password, 12), mustChangePassword: false },
      });
      // Every other device must sign in again with the new password
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'already used') {
      res.status(410).json({ error: 'This reset link was already used — sign in with your new password.' });
      return;
    }
    throw err;
  }
  // …and THIS device lands signed in
  res.json(await issueSession(reset.userId));
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'refreshToken required' });
    return;
  }
  const tokenHash = hashToken(parsed.data.refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.status(401).json({ error: 'invalid refresh token' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'invalid refresh token' });
    return;
  }
  // Rotate: revoke the old token, issue a new pair
  await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
  res.json({
    accessToken: signAccess(user),
    refreshToken: await issueRefreshToken(user.id),
  });
});

authRouter.post('/logout', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(parsed.data.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(401).json({ error: 'current password incorrect' });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false },
  });
  // Revoke all refresh tokens — sessions must re-authenticate
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.json({ ok: true });
});

// ── Self-service: current user + personal licenses ─────────────────────────

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { company: true },
  });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'invalid session' });
    return;
  }
  res.json({ user: publicUser(user) });
});

/** First-run welcome acknowledged — per ACCOUNT, so no device repeats it */
authRouter.put('/me/onboarded', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { onboardedAt: new Date() },
    select: { onboardedAt: true },
  });
  res.json({ ok: true, onboardedAt: user.onboardedAt?.toISOString() ?? null });
});

/** Walkthrough finished/skipped once — per ACCOUNT (Round S2). Only stops
 *  the auto-run; the tour stays re-runnable from Help. */
authRouter.put('/me/tour-done', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { tourDoneAt: new Date() },
    select: { tourDoneAt: true },
  });
  res.json({ ok: true, tourDoneAt: user.tourDoneAt?.toISOString() ?? null });
});

/** A screen tour finished or skipped — per ACCOUNT, per screen (Round S7c).
 *  Append-only set; re-running from Help never clears it. */
const screenTourSchema = z.object({ screen: z.string().min(1).max(40) });
authRouter.put('/me/tours-done', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = screenTourSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'screen required' });
    return;
  }
  const current = await prisma.user.findUnique({ where: { id: req.userId! }, select: { toursDone: true } });
  const list = Array.isArray(current?.toursDone) ? (current!.toursDone as string[]) : [];
  const next = list.includes(parsed.data.screen) ? list : [...list, parsed.data.screen];
  await prisma.user.update({ where: { id: req.userId! }, data: { toursDone: next } });
  res.json({ ok: true, toursDone: next });
});

const licenseSchema = z
  .array(
    z.object({
      state: z.string().length(2).toUpperCase(),
      licenseNumber: z.string().min(1).max(64),
      expirationDate: z.string().max(10).optional().default(''),
    }),
  )
  .max(60)
  .refine(
    (arr) => new Set(arr.map((l) => l.state)).size === arr.length,
    'one license per state',
  );

authRouter.put('/me/licenses', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = licenseSchema.safeParse((req.body as { licenses?: unknown })?.licenses);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid licenses — one per 2-letter state' });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: req.userId! }, data: { licenses: parsed.data } });
    // Single source of truth: the roster record mirrors the primary license
    // so the crew page never shows a stale number (audit finding: the two
    // stores drifted with no sync path).
    const rows = await tx.$queryRaw<{ id: string; payload: string }[]>`
      SELECT "id", "payload" FROM "records"
      WHERE "company_id" = ${req.companyId} AND "table_name" = 'crewMembers'`;
    const crew = rows
      .map((r) => ({ id: r.id, payload: parsePayloadSafe(r.payload) }))
      .find((c) => c.payload.userId === req.userId);
    if (crew) {
      const primary = parsed.data[0];
      const now = new Date().toISOString();
      await upsertRecord(
        tx,
        req.companyId!,
        crew.id,
        'crewMembers',
        JSON.stringify({
          ...crew.payload,
          licenseNumber: primary?.licenseNumber ?? '',
          licenseState: primary?.state ?? '',
          updatedAt: now,
        }),
        now,
      );
    }
  });
  res.json({ ok: true, licenses: parsed.data });
});

// Signature on file: PNG/JPEG data URL, or null to clear. ~300KB cap keeps
// a hand-drawn PNG comfortably while rejecting arbitrary uploads.
const signatureSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
  .max(300_000)
  .nullable();

authRouter.put('/me/signature', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = signatureSchema.safeParse((req.body as { signature?: unknown })?.signature);
  if (!parsed.success) {
    res.status(400).json({ error: 'signature must be a PNG/JPEG data URL under 300KB, or null' });
    return;
  }
  await prisma.user.update({ where: { id: req.userId! }, data: { signature: parsed.data } });
  res.json({ ok: true, signature: parsed.data });
});

// Offline unlock PIN (already hashed client-side) — follows the account
const pinSchema = z.string().regex(/^[0-9a-f]{64}$/);

authRouter.put('/me/pin', requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = pinSchema.safeParse((req.body as { pinHash?: unknown })?.pinHash);
  if (!parsed.success) {
    res.status(400).json({ error: 'pinHash must be a sha-256 hex digest' });
    return;
  }
  await prisma.user.update({ where: { id: req.userId! }, data: { pinHash: parsed.data } });
  res.json({ ok: true });
});
