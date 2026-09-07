// In-app feedback + crash reports (Round S3). Platform-level data: rows live
// in their own table (never in `records`, so they never sync to devices);
// every signed-in role may POST, only PLATFORM admins read/triage. Matthew's
// call (soft-launch review Q2): feedback goes to him, not the company admin.
//
// The device mints the id and keeps an offline outbox, so a POST may arrive
// twice — the upsert makes retries idempotent and the email fires once.
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import {
  platformAdminEmails,
  requireAuth,
  requirePlatformAdmin,
  type AuthedRequest,
} from './auth.js';
import { emailEnabled, feedbackMail, sendEmail } from './email.js';
import { rateLimit } from './rateLimit.js';
import { SANDBOX_COMPANY_NAME } from './rehearsal.js';

export const feedbackRouter = Router();

/** Where reports are mailed: FEEDBACK_TO (comma-separated) or the platform admins */
function feedbackRecipients(): string[] {
  const explicit = (process.env.FEEDBACK_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return explicit.length > 0 ? explicit : platformAdminEmails();
}

const KINDS = ['bug', 'idea', 'question', 'crash'] as const;
const STATUSES = ['new', 'seen', 'done'] as const;

const postSchema = z.object({
  id: z.string().min(8).max(64),
  kind: z.enum(KINDS),
  message: z.string().trim().min(1).max(4000),
  route: z.string().max(300).default(''),
  buildId: z.string().max(64).default(''),
  userAgent: z.string().max(400).default(''),
  viewport: z.string().max(32).default(''),
  online: z.boolean().default(true),
  standalone: z.boolean().default(false),
  syncLogTail: z.array(z.unknown()).max(40).default([]),
  errorLog: z.array(z.unknown()).max(20).default([]),
  // JPEG data URL, ≤1280px wide — a few hundred KB at most
  screenshot: z.string().startsWith('data:image/').max(3_000_000).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

feedbackRouter.post('/', rateLimit, requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid feedback' });
    return;
  }
  const d = parsed.data;
  const user = await prisma.user.findUnique({
    where: { id: req.userId ?? '' },
    include: { company: true },
  });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'invalid session' });
    return;
  }
  const existing = await prisma.feedback.findUnique({ where: { id: d.id }, select: { id: true, notified: true } });
  if (existing) {
    // Offline-queue retry — already stored (and already mailed)
    res.json({ ok: true, id: existing.id, notified: existing.notified, duplicate: true });
    return;
  }
  const createdAt = d.createdAt ? new Date(d.createdAt) : new Date();
  const row = await prisma.feedback.create({
    data: {
      id: d.id,
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      kind: d.kind,
      message: d.message,
      route: d.route,
      buildId: d.buildId,
      userAgent: d.userAgent,
      viewport: d.viewport,
      online: d.online,
      standalone: d.standalone,
      syncLogTail: d.syncLogTail as Prisma.InputJsonValue,
      errorLog: d.errorLog as Prisma.InputJsonValue,
      screenshot: d.screenshot ?? null,
      createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    },
  });

  // Email hook — truthful outcome recorded on the row. Rehearsal-sandbox
  // reports are stored (Matthew reads them in Admin › Feedback) but never
  // mailed — they are his own notes to himself.
  let notified: 'sent' | 'email-off' | 'failed' | 'sandbox' = 'email-off';
  if (user.company.name === SANDBOX_COMPANY_NAME) {
    notified = 'sandbox';
  } else if (emailEnabled()) {
    const recipients = feedbackRecipients();
    let anySent = false;
    for (const to of recipients) {
      const ok = await sendEmail(
        feedbackMail({
          to,
          id: row.id,
          kind: row.kind,
          message: row.message,
          name: row.userName,
          email: row.userEmail,
          role: row.role,
          company: user.company.name,
          route: row.route,
          buildId: row.buildId,
          online: row.online,
        }),
      );
      anySent ||= ok;
    }
    notified = recipients.length === 0 ? 'email-off' : anySent ? 'sent' : 'failed';
  }
  if (notified !== row.notified) {
    await prisma.feedback.update({ where: { id: row.id }, data: { notified } });
  }
  console.log(`[feedback] ${row.kind} from ${row.userName} (${row.role}) on ${row.route || '/'} — ${notified}`);
  res.status(201).json({ ok: true, id: row.id, notified });
});

// ── Triage (platform admin only) ─────────────────────────────────────────────

const listSelect = {
  id: true,
  companyId: true,
  userId: true,
  userName: true,
  userEmail: true,
  role: true,
  kind: true,
  message: true,
  route: true,
  buildId: true,
  userAgent: true,
  viewport: true,
  online: true,
  standalone: true,
  status: true,
  replyNote: true,
  notified: true,
  createdAt: true,
  receivedAt: true,
} as const;

feedbackRouter.get('/', requireAuth, requirePlatformAdmin, async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  // Platform scope on purpose: not filtered by the caller's company —
  // single tenant today, cross-tenant listing later is a filter away
  const rows = await prisma.feedback.findMany({
    where: status && (STATUSES as readonly string[]).includes(status) ? { status } : undefined,
    orderBy: { receivedAt: 'desc' },
    take: 300,
    select: { ...listSelect, screenshot: false },
  });
  const withShot = await prisma.feedback.findMany({
    where: { id: { in: rows.map((r) => r.id) }, screenshot: { not: null } },
    select: { id: true },
  });
  const shotIds = new Set(withShot.map((r) => r.id));
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  res.json({
    feedback: rows.map((r) => ({
      ...r,
      companyName: companyName.get(r.companyId) ?? r.companyId,
      hasScreenshot: shotIds.has(r.id),
    })),
    recipients: feedbackRecipients(),
    emailEnabled: emailEnabled(),
  });
});

feedbackRouter.get('/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
  const row = await prisma.feedback.findUnique({ where: { id: String(req.params.id) } });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ feedback: row });
});

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  replyNote: z.string().max(4000).nullable().optional(),
});

feedbackRouter.patch('/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid patch' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.feedback.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const row = await prisma.feedback.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.replyNote !== undefined ? { replyNote: parsed.data.replyNote } : {}),
    },
    select: listSelect,
  });
  res.json({ feedback: row });
});

feedbackRouter.delete('/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
  const id = String(req.params.id);
  await prisma.feedback.deleteMany({ where: { id } });
  res.json({ ok: true });
});
