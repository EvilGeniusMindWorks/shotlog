import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, requireAdmin, type AuthedRequest } from './auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdmin);

const ROLES = ['admin', 'blaster', 'driller', 'mechanic', 'office'] as const;

/** List the company's users */
usersRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.companyId! },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ users });
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  tempPassword: z.string().min(8),
});

/** Create a user in the admin's company with a temporary password */
usersRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'email, name, role, and tempPassword (8+ chars) required' });
    return;
  }
  const { email, name, role, tempPassword } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'a user with that email already exists' });
    return;
  }
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      companyId: req.companyId!,
      passwordHash: await bcrypt.hash(tempPassword, 12),
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  res.status(201).json({ user });
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
  await prisma.user.update({ where: { id }, data: { isActive: active } });
  if (!active) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ ok: true });
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
