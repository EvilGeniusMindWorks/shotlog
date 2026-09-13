// Crash reporting without a vendor (Round S11, Sep 13 2026 — Matthew chose
// "build on what exists" over Sentry). A crash is a Feedback row of kind
// 'crash' sent by the app itself (auto), grouped by FINGERPRINT into one
// CrashGroup per distinct problem: how many, who, first and last seen, a
// status Matthew sets. The email goes out ONCE, when a group is born.
//
// Readable traces: the web build uploads its source maps (SourceMap table,
// scripts/build-web.mjs) and a minified frame like
//   at Xk (https://app/assets/index-Ctgk7bps.js:12:3456)
// decodes back to src/pages/JobsPage.tsx:101 jobPath. The fingerprint uses
// the decoded frame when there is one, so the same bug keeps one line
// across builds even though the minified names change every deploy.
import { createHash } from 'node:crypto';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export interface StackFrame {
  fn: string;
  file: string;
  line: number;
  col: number;
  /** After decoding: the original source, line and function */
  source?: string;
  sourceLine?: number;
  sourceCol?: number;
  sourceFn?: string;
}

export interface Breadcrumb {
  at: string;
  kind: 'nav' | 'tap' | 'net' | 'sync' | 'app';
  text: string;
}

export interface CrashPayload {
  /** render (React boundary) | error (window.onerror) | rejection | server */
  kind: 'render' | 'error' | 'rejection' | 'server';
  message: string;
  stack?: string;
  componentStack?: string;
  breadcrumbs?: Breadcrumb[];
  /** Free-form device/session facts the app collects for triage */
  context?: Record<string, unknown>;
}

// ── Stack parsing ───────────────────────────────────────────────────────────

const FRAME_RE = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;
// Firefox / Safari style: fn@url:line:col
const FRAME_RE_ALT = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const out: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const m = FRAME_RE.exec(raw) ?? FRAME_RE_ALT.exec(raw);
    if (!m) continue;
    out.push({ fn: (m[1] ?? '').trim() || '<anonymous>', file: m[2], line: Number(m[3]), col: Number(m[4]) });
    if (out.length >= 30) break;
  }
  return out;
}

function basename(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  return clean.slice(clean.lastIndexOf('/') + 1);
}

// ── Source maps ─────────────────────────────────────────────────────────────

const mapCache = new Map<string, TraceMap | null>();
const CACHE_MAX = 40;

async function traceMapFor(buildId: string, file: string): Promise<TraceMap | null> {
  const key = `${buildId}/${file}`;
  if (mapCache.has(key)) return mapCache.get(key) ?? null;
  const row = await prisma.sourceMap.findUnique({ where: { id: key }, select: { map: true } }).catch(() => null);
  let tm: TraceMap | null = null;
  if (row) {
    try {
      tm = new TraceMap(row.map);
    } catch {
      tm = null;
    }
  }
  if (mapCache.size >= CACHE_MAX) mapCache.delete(mapCache.keys().next().value as string);
  mapCache.set(key, tm);
  return tm;
}

/** Forget cached maps for a build (after an upload replaces them). */
export function forgetMaps(buildId: string) {
  for (const k of [...mapCache.keys()]) if (k.startsWith(`${buildId}/`)) mapCache.delete(k);
}

export async function decodeFrames(buildId: string, frames: StackFrame[]): Promise<StackFrame[]> {
  if (!buildId) return frames;
  const out: StackFrame[] = [];
  for (const f of frames) {
    const file = basename(f.file);
    if (!file.endsWith('.js')) {
      out.push(f);
      continue;
    }
    const tm = await traceMapFor(buildId, file);
    if (!tm) {
      out.push(f);
      continue;
    }
    const pos = originalPositionFor(tm, { line: f.line, column: Math.max(0, f.col - 1) });
    if (pos.source) {
      out.push({
        ...f,
        source: pos.source.replace(/^(\.\.\/)+/, ''),
        sourceLine: pos.line ?? undefined,
        sourceCol: pos.column != null ? pos.column + 1 : undefined,
        sourceFn: pos.name ?? undefined,
      });
    } else out.push(f);
  }
  return out;
}

export function frameText(f: StackFrame): string {
  if (f.source) return `${f.sourceFn ?? f.fn} (${f.source}:${f.sourceLine}${f.sourceCol ? `:${f.sourceCol}` : ''})`;
  return `${f.fn} (${basename(f.file)}:${f.line}:${f.col})`;
}

// ── Fingerprint ─────────────────────────────────────────────────────────────

/** Strip the parts that differ between two hits of the same bug */
export function normalizeMessage(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/g, 'URL')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID')
    .replace(/\b[0-9a-f]{16,}\b/gi, 'HEX')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** The first frame that is OUR code (decoded), else the first frame at all */
export function topFrame(frames: StackFrame[]): StackFrame | undefined {
  return frames.find((f) => f.source && !/node_modules/.test(f.source)) ?? frames[0];
}

export function fingerprintFor(kind: string, message: string, frames: StackFrame[]): string {
  const top = topFrame(frames);
  const anchor = top?.source
    ? `${top.source}:${top.sourceLine}:${top.sourceFn ?? ''}`
    : top
      ? `${top.fn}` // minified names change per build; the message carries the rest
      : '';
  return createHash('sha1').update(`${kind}|${normalizeMessage(message)}|${anchor}`).digest('hex').slice(0, 16);
}

export function titleFor(kind: string, message: string, frames: StackFrame[]): string {
  const top = topFrame(frames);
  const where = top?.source ? ` · ${top.source.split('/').pop()}:${top.sourceLine}` : '';
  const head = kind === 'server' ? 'Server: ' : kind === 'render' ? 'Screen stopped: ' : '';
  return `${head}${message.replace(/\s+/g, ' ').slice(0, 120)}${where}`;
}

/** Six characters a person can read out on the phone */
export function reportCodeFromId(id: string): string {
  const h = createHash('sha1').update(id).digest();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[h[i] % alphabet.length];
  return out;
}

// ── Recording ───────────────────────────────────────────────────────────────

export interface RecordedCrash {
  id: string;
  reportCode: string;
  fingerprint: string;
  isNewGroup: boolean;
  title: string;
}

export async function recordCrash(opts: {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  payload: CrashPayload;
  route: string;
  buildId: string;
  commit: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  standalone: boolean;
  syncLogTail: unknown[];
  errorLog: unknown[];
  createdAt: Date;
  reportCode?: string;
}): Promise<RecordedCrash> {
  const p = opts.payload;
  const rawFrames = parseStack(p.stack);
  const frames = await decodeFrames(opts.buildId, rawFrames);
  const fingerprint = fingerprintFor(p.kind, p.message, frames);
  const title = titleFor(p.kind, p.message, frames);
  const reportCode = opts.reportCode || reportCodeFromId(opts.id);
  const crash = {
    kind: p.kind,
    message: p.message,
    stack: p.stack ?? '',
    componentStack: p.componentStack ?? '',
    frames,
    decoded: frames.some((f) => f.source),
    breadcrumbs: (p.breadcrumbs ?? []).slice(-40),
    context: p.context ?? {},
  };
  await prisma.feedback.create({
    data: {
      id: opts.id,
      companyId: opts.companyId,
      userId: opts.userId,
      userName: opts.userName,
      userEmail: opts.userEmail,
      role: opts.role,
      kind: 'crash',
      message: p.message.slice(0, 4000),
      route: opts.route,
      buildId: opts.buildId,
      commit: opts.commit,
      userAgent: opts.userAgent,
      viewport: opts.viewport,
      online: opts.online,
      standalone: opts.standalone,
      syncLogTail: opts.syncLogTail as Prisma.InputJsonValue,
      errorLog: opts.errorLog as Prisma.InputJsonValue,
      auto: true,
      reportCode,
      fingerprint,
      crash: crash as unknown as Prisma.InputJsonValue,
      createdAt: opts.createdAt,
    },
  });
  const existing = await prisma.crashGroup.findUnique({ where: { fingerprint } });
  let isNewGroup = false;
  if (!existing) {
    isNewGroup = true;
    await prisma.crashGroup.create({
      data: {
        fingerprint,
        title,
        side: p.kind === 'server' ? 'server' : 'web',
        count: 1,
        people: opts.userId ? [{ id: opts.userId, name: opts.userName }] : [],
        lastBuild: opts.buildId,
        sampleId: opts.id,
      },
    });
  } else {
    const people = (existing.people as { id: string; name: string }[]) ?? [];
    if (opts.userId && !people.some((x) => x.id === opts.userId)) people.push({ id: opts.userId, name: opts.userName });
    // A problem marked fixed that comes back in a NEWER build is a regression:
    // reopen it so it is not buried under "fixed" (queued item, done cheaply here)
    const regressed = existing.status === 'fixed' && existing.fixedInBuild && opts.buildId && opts.buildId > existing.fixedInBuild;
    await prisma.crashGroup.update({
      where: { fingerprint },
      data: {
        count: { increment: 1 },
        people: people as unknown as Prisma.InputJsonValue,
        lastSeen: new Date(),
        lastBuild: opts.buildId || existing.lastBuild,
        // keep a decoded sample when the old one was not
        ...(crash.decoded ? { sampleId: opts.id } : {}),
        ...(regressed ? { status: 'new', note: `${existing.note ? `${existing.note}\n` : ''}Came back in build ${opts.buildId} after being marked fixed in ${existing.fixedInBuild}.` } : {}),
      },
    });
    if (regressed) isNewGroup = true; // email again — it is news
  }
  return { id: opts.id, reportCode, fingerprint, isNewGroup, title };
}

/** The plain-text bundle a Claude session (or Matthew) reads: everything
 *  about one crash, decoded, in the order a debugger wants it. */
export function crashBundle(row: {
  id: string;
  userId?: string;
  reportCode: string;
  fingerprint: string;
  userName: string;
  userEmail: string;
  role: string;
  companyId: string;
  route: string;
  buildId: string;
  commit: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  standalone: boolean;
  createdAt: Date;
  receivedAt: Date;
  message: string;
  crash: unknown;
  errorLog: unknown;
  syncLogTail: unknown;
}, group: { count: number; people: unknown; firstSeen: Date; lastSeen: Date; status: string; fixedInBuild: string | null } | null, words: { userName: string; message: string; createdAt: Date }[]): string {
  const c = (row.crash ?? {}) as {
    kind?: string;
    frames?: StackFrame[];
    decoded?: boolean;
    breadcrumbs?: Breadcrumb[];
    context?: Record<string, unknown>;
    componentStack?: string;
    stack?: string;
  };
  const lines: string[] = [];
  lines.push(`SHOTLOG CRASH ${row.reportCode} · fingerprint ${row.fingerprint}`);
  lines.push(`${c.kind ?? 'crash'}: ${row.message}`);
  lines.push('');
  lines.push(`Who:    ${row.userName} <${row.userEmail}> (${row.role}) · user ${row.userId ?? ''} · company ${row.companyId}`);
  lines.push(`Where:  ${row.route || '/'}`);
  lines.push(`When:   ${row.createdAt.toISOString()} on the device · received ${row.receivedAt.toISOString()}`);
  lines.push(`Build:  ${row.buildId || 'unknown'}${row.commit ? ` · commit ${row.commit}` : ''}`);
  lines.push(`Device: ${row.userAgent} · ${row.viewport} · ${row.online ? 'online' : 'OFFLINE'} · ${row.standalone ? 'installed app' : 'browser tab'}`);
  if (group) {
    const people = (group.people as { name: string }[]) ?? [];
    lines.push(`Group:  ${group.count} time(s) · ${people.length} people (${people.map((p) => p.name).join(', ')}) · first ${group.firstSeen.toISOString()} · last ${group.lastSeen.toISOString()} · status ${group.status}${group.fixedInBuild ? ` (fixed in ${group.fixedInBuild})` : ''}`);
  }
  lines.push('');
  lines.push(`TRACE${c.decoded ? ' (decoded from source maps)' : ' (minified — no source map for this build)'}`);
  for (const f of c.frames ?? []) lines.push(`  at ${frameText(f)}`);
  if (!c.frames?.length && c.stack) lines.push(c.stack);
  if (c.componentStack) {
    lines.push('');
    lines.push('COMPONENT STACK');
    lines.push(c.componentStack.trim());
  }
  if (c.breadcrumbs?.length) {
    lines.push('');
    lines.push('BREADCRUMBS (oldest first)');
    for (const b of c.breadcrumbs) lines.push(`  ${b.at.slice(11, 19)} ${b.kind.padEnd(4)} ${b.text}`);
  }
  if (c.context && Object.keys(c.context).length) {
    lines.push('');
    lines.push('CONTEXT');
    for (const [k, v] of Object.entries(c.context)) lines.push(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  const errs = (row.errorLog as { at: string; kind: string; msg: string }[]) ?? [];
  if (errs.length) {
    lines.push('');
    lines.push('EARLIER ERRORS ON THIS DEVICE');
    for (const e of errs) lines.push(`  ${e.at} ${e.kind} ${e.msg}`);
  }
  const sync = (row.syncLogTail as { at: string; msg: string }[]) ?? [];
  if (sync.length) {
    lines.push('');
    lines.push('SYNC LOG TAIL');
    for (const e of sync) lines.push(`  ${e.at} ${e.msg}`);
  }
  if (words.length) {
    lines.push('');
    lines.push('WHAT PEOPLE SAID');
    for (const w of words) lines.push(`  ${w.createdAt.toISOString()} ${w.userName}: ${w.message}`);
  }
  return lines.join('\n');
}
