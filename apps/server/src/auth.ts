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
}

function signAccess(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TTL });
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
  await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Bootstrap user created: ${email}`);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'missing token' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
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
  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-shape response for bad email vs bad password
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({
    accessToken: signAccess(user.id),
    refreshToken: await issueRefreshToken(user.id),
    user: { id: user.id, email: user.email, name: user.name },
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
  // Rotate: revoke the old token, issue a new pair
  await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
  res.json({
    accessToken: signAccess(stored.userId),
    refreshToken: await issueRefreshToken(stored.userId),
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

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
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
