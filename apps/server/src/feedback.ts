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
import { crashMail, emailEnabled, feedbackMail, sendEmail } from './email.js';
import { rateLimit } from './rateLimit.js';
import { SANDBOX_COMPANY_NAME } from './rehearsal.js';
import { crashBundle, forgetMaps, recordCrash, reportCodeFromId, type CrashPayload } from './crash.js';

// S11: crash reports sent by the app itself. Same table, own tab, own email.
const crashSchema = z.object({
  kind: z.enum(['render', 'error', 'rejection', 'server']),
  message: z.string().max(2000),
  stack: z.string().max(20_000).optional(),
  componentStack: z.string().max(20_000).optional(),
  breadcrumbs: z
    .array(z.object({ at: z.string().max(40), kind: z.enum(['nav', 'tap', 'net', 'sync', 'app']), text: z.string().max(200) }))
    .max(60)
    .default([]),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const GROUP_STATUSES = ['new', 'seen', 'fixed'] as const;

/** Send the "new problem" email once per crash group (or on a regression). */
async function notifyCrashGroup(opts: { title: string; fingerprint: string; reportCode: string; name: string; company: string; route: string; buildId: string; side: string }): Promise<'sent' | 'email-off' | 'failed'> {
  if (!emailEnabled()) return 'email-off';
  const recipients = feedbackRecipients();
  let anySent = false;
  for (const to of recipients) anySent ||= await sendEmail(crashMail({ to, ...opts }));
  if (anySent) await prisma.crashGroup.update({ where: { fingerprint: opts.fingerprint }, data: { notifiedAt: new Date() } }).catch(() => undefined);
  return recipients.length === 0 ? 'email-off' : anySent ? 'sent' : 'failed';
}

/** Server-side failures (the Express error handler, process hooks) land in
 *  the same inbox. Never throws — a crash reporter that crashes is worse. */
export async function recordServerCrash(err: unknown, req?: { method?: string; originalUrl?: string; userId?: string }): Promise<string | null> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const id = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    let user: { id: string; name: string; email: string; role: string; companyId: string; company: { name: string } } | null = null;
    if (req?.userId) user = await prisma.user.findUnique({ where: { id: req.userId }, include: { company: true } }).catch(() => null);
    const rec = await recordCrash({
      id,
      companyId: user?.companyId ?? '',
      userId: user?.id ?? '',
      userName: user?.name ?? 'server',
      userEmail: user?.email ?? '',
      role: user?.role ?? 'server',
      payload: { kind: 'server', message: `${e.name}: ${e.message}`, stack: e.stack, context: { method: req?.method ?? '', node: process.version } },
      route: req?.originalUrl ?? '',
      buildId: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? '',
      userAgent: 'server',
      viewport: '',
      online: true,
      standalone: false,
      syncLogTail: [],
      errorLog: [],
      createdAt: new Date(),
    });
    if (rec.isNewGroup && user?.company.name !== SANDBOX_COMPANY_NAME) {
      await notifyCrashGroup({ title: rec.title, fingerprint: rec.fingerprint, reportCode: rec.reportCode, name: user?.name ?? 'the server', company: user?.company.name ?? 'ShotLog', route: req?.originalUrl ?? '', buildId: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev', side: 'server' });
    }
    console.error(`[crash] server ${rec.reportCode} ${rec.title}`);
    return rec.reportCode;
  } catch (inner) {
    console.error('[crash] could not record a server crash', inner, err);
    return null;
  }
}

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

// S18: the paper a report is about — a print screen or a filed copy
const paperSchema = z.object({
  label: z.string().max(240),
  kind: z.string().max(40).optional(),
  submissionId: z.string().max(64).optional(),
  recordId: z.string().max(64).optional(),
});

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
  // S11 crash fields
  auto: z.boolean().default(false),
  crash: crashSchema.optional(),
  reportCode: z.string().max(12).optional(),
  parentId: z.string().max(64).optional(),
  commit: z.string().max(64).default(''),
  paper: paperSchema.optional(),
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
  const existing = await prisma.feedback.findUnique({ where: { id: d.id }, select: { id: true, notified: true, reportCode: true } });
  if (existing) {
    // Offline-queue retry — already stored (and already mailed)
    res.json({ ok: true, id: existing.id, notified: existing.notified, duplicate: true, reportCode: existing.reportCode });
    return;
  }
  const createdAt = d.createdAt ? new Date(d.createdAt) : new Date();
  const when = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

  // S11: an automatic crash report — grouped, emailed once per problem
  if (d.auto && d.kind === 'crash' && d.crash) {
    const rec = await recordCrash({
      id: d.id,
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      payload: d.crash as CrashPayload,
      route: d.route,
      buildId: d.buildId,
      commit: d.commit,
      userAgent: d.userAgent,
      viewport: d.viewport,
      online: d.online,
      standalone: d.standalone,
      syncLogTail: d.syncLogTail,
      errorLog: d.errorLog,
      createdAt: when,
      reportCode: d.reportCode,
    });
    let notified: 'sent' | 'email-off' | 'failed' | 'sandbox' | 'grouped' = 'grouped';
    if (rec.isNewGroup) {
      notified =
        user.company.name === SANDBOX_COMPANY_NAME
          ? 'sandbox'
          : await notifyCrashGroup({ title: rec.title, fingerprint: rec.fingerprint, reportCode: rec.reportCode, name: user.name, company: user.company.name, route: d.route, buildId: d.buildId, side: 'web' });
    }
    await prisma.feedback.update({ where: { id: d.id }, data: { notified } });
    console.log(`[crash] ${rec.reportCode} ${rec.isNewGroup ? 'NEW' : 'again'} — ${rec.title} (${user.name}) — ${notified}`);
    res.status(201).json({ ok: true, id: d.id, notified, reportCode: rec.reportCode, fingerprint: rec.fingerprint });
    return;
  }
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
      paper: d.paper ? (d.paper as Prisma.InputJsonValue) : undefined,
      createdAt: when,
      commit: d.commit,
      // A person's words about an automatic crash attach to that crash
      ...(d.parentId ? { parentId: d.parentId, reportCode: reportCodeFromId(d.parentId) } : {}),
    },
  });
  if (d.parentId) {
    const parent = await prisma.feedback.findUnique({ where: { id: d.parentId }, select: { fingerprint: true } });
    if (parent?.fingerprint) await prisma.feedback.update({ where: { id: row.id }, data: { fingerprint: parent.fingerprint } });
  }

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
  paper: true,
} as const;

feedbackRouter.get('/', requireAuth, requirePlatformAdmin, async (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  // Platform scope on purpose: not filtered by the caller's company —
  // single tenant today, cross-tenant listing later is a filter away
  const rows = await prisma.feedback.findMany({
    where: {
      ...(status && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
      // S11: crashes have their own tab; a person's words about a crash sit under it
      auto: false,
      parentId: null,
    },
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

// ── S11 Crashes tab ──────────────────────────────────────────────────────────

feedbackRouter.get('/crashes', requireAuth, requirePlatformAdmin, async (_req, res) => {
  const groups = await prisma.crashGroup.findMany({ orderBy: { lastSeen: 'desc' }, take: 300 });
  const open = groups.filter((g) => g.status !== 'fixed').length;
  res.json({ groups, open, emailEnabled: emailEnabled(), recipients: feedbackRecipients() });
});

feedbackRouter.get('/crashes/:fingerprint', requireAuth, requirePlatformAdmin, async (req, res) => {
  const fingerprint = String(req.params.fingerprint);
  const group = await prisma.crashGroup.findUnique({ where: { fingerprint } });
  if (!group) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const samples = await prisma.feedback.findMany({
    where: { fingerprint, auto: true },
    orderBy: { receivedAt: 'desc' },
    take: 8,
  });
  const words = await prisma.feedback.findMany({
    where: { fingerprint, auto: false },
    orderBy: { receivedAt: 'desc' },
    take: 20,
    select: { id: true, userName: true, message: true, createdAt: true, parentId: true },
  });
  const sample = samples.find((s) => s.id === group.sampleId) ?? samples[0] ?? null;
  const bundle = sample ? crashBundle(sample, group, words) : '';
  res.json({ group, samples: samples.map((s) => ({ ...s, screenshot: undefined })), words, bundle });
});

const groupPatch = z.object({
  status: z.enum(GROUP_STATUSES).optional(),
  fixedInBuild: z.string().max(64).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
});

feedbackRouter.patch('/crashes/:fingerprint', requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = groupPatch.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid patch' });
    return;
  }
  const fingerprint = String(req.params.fingerprint);
  const existing = await prisma.crashGroup.findUnique({ where: { fingerprint }, select: { fingerprint: true } });
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const group = await prisma.crashGroup.update({
    where: { fingerprint },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.fixedInBuild !== undefined ? { fixedInBuild: parsed.data.fixedInBuild } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });
  res.json({ group });
});

feedbackRouter.delete('/crashes/:fingerprint', requireAuth, requirePlatformAdmin, async (req, res) => {
  const fingerprint = String(req.params.fingerprint);
  await prisma.feedback.deleteMany({ where: { fingerprint } });
  await prisma.crashGroup.deleteMany({ where: { fingerprint } });
  res.json({ ok: true });
});

/** One crash by its six-character code: the row, its group and the text
 *  bundle (scripts/crash.mjs prints this for a Claude session). */
feedbackRouter.get('/code/:code', requireAuth, requirePlatformAdmin, async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const row = await prisma.feedback.findFirst({ where: { reportCode: code, auto: true }, orderBy: { receivedAt: 'desc' } });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const group = row.fingerprint ? await prisma.crashGroup.findUnique({ where: { fingerprint: row.fingerprint } }) : null;
  const words = await prisma.feedback.findMany({
    where: { OR: [{ parentId: row.id }, ...(row.fingerprint ? [{ fingerprint: row.fingerprint, auto: false }] : [])] },
    orderBy: { receivedAt: 'desc' },
    select: { id: true, userName: true, message: true, createdAt: true, parentId: true },
  });
  const bundle = crashBundle(row, group, words);
  if (req.query.format === 'text') {
    res.type('text/plain').send(bundle);
    return;
  }
  res.json({ crash: { ...row, screenshot: undefined }, group, words, bundle });
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
