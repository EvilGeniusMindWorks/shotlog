import { createHash, randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

const ACCESS_TTL = '1h';
const REFRESH_TTL_DAYS = 30;

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
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company.name,
      licenses: user.licenses,
      signature: user.signature,
    },
  });
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
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
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
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company.name,
      licenses: user.licenses,
      signature: user.signature,
    },
  });
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
  await prisma.user.update({ where: { id: req.userId! }, data: { licenses: parsed.data } });
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
