// Standalone drill-plan flows: the blaster authors a plan under a JOB,
// ahead of any blast day; drillers work it via per-driller-per-day logs;
// the blast report later imports the as-drilled result.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { formatDate, generateId, nowISO, todayISO } from '@/lib/utils';
import { materializeDrillPlan, type PlanHole, type ShotDiagram } from '@/lib/shotDiagram';
import type { DrillLog, DrillLogHole, DrillPlanRecord, Shot } from '@/db/schema';
import { aggregateDrilling, type FlaggedHole, type ShotDrilling } from './useDrillLogs';
import { findDayByDate } from '@/lib/dayCard';
import { createBlastDay } from './useBlastDay';

/** Route to a drill log's page — plan-parented logs live under the job's
 *  plan; shot-parented (legacy) logs live under the blast day. */
export function drillLogRoute(
  log: Pick<DrillLog, 'id' | 'jobId' | 'blastDayId' | 'drillPlanId'>,
): string {
  if (log.drillPlanId) return `/jobs/${log.jobId}/drill-plan/${log.drillPlanId}/log/${log.id}`;
  return `/blast-day/${log.blastDayId ?? ''}/drill-log/${log.id}`;
}

export async function createDrillPlan(jobId: string, name?: string): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const existing = await db.drillPlans.where('jobId').equals(jobId).count();
  const plan: DrillPlanRecord = {
    id,
    jobId,
    name: name?.trim() || `Drill Plan ${existing + 1}`,
    status: 'open',
    rows: 5,
    cols: 10,
    overrides: {},
    holeDiameter: 3,
    burden: 6,
    spacing: 7,
    createdBy: session?.id ?? '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillPlans.add(plan);
  return id;
}

/** A standalone plan expressed as a ShotDiagram (grid + per-hole plan) —
 *  lets the read-only pattern map and materializer work on both shapes. */
export function planToDiagram(plan: DrillPlanRecord): ShotDiagram {
  return {
    rows: plan.rows,
    cols: plan.cols,
    delays: {},
    wires: [],
    interHoleMs: 15,
    plan: {
      defaultDepth: plan.defaultDepth,
      overrides: Object.fromEntries(
        Object.entries(plan.overrides).map(([k, o]) => [
          k,
          o.noHole ? { depth: 0 } : { depth: o.depth, kick: o.kick, kickDir: o.kickDir },
        ]),
      ),
    },
  };
}

/** Materialized per-hole plan for a standalone drill plan (kick-aware) */
export function getPlanHoles(plan: DrillPlanRecord | undefined | null): PlanHole[] | null {
  if (!plan) return null;
  const holes = materializeDrillPlan(planToDiagram(plan), 0);
  return holes.length > 0 ? holes : null;
}

/** Hole numbers drilled in ANY of a plan's logs (cross-driller claim ledger) */
export async function planDrilledHoleNumbers(planId: string): Promise<Set<string>> {
  const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
  const drilled = new Set<string>();
  for (const log of logs) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    for (const h of holes) drilled.add(h.holeNumber.trim());
  }
  return drilled;
}

/** A driller's log against a plan for ONE day. `assignTo` = dispatched by
 *  the blaster; otherwise the current user starts their own. */
export async function createDrillPlanLog(
  plan: DrillPlanRecord,
  assignTo?: { userId: string; name: string },
  date?: string,
): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const log: DrillLog = {
    id,
    jobId: plan.jobId,
    drillPlanId: plan.id,
    date: date ?? todayISO(),
    status: 'open',
    holeDiameter: plan.holeDiameter,
    burden: plan.burden,
    spacing: plan.spacing,
    faceHeight: plan.defaultDepth ?? 0,
    gps: '',
    locationNote: '',
    drillerUserId: assignTo?.userId ?? session?.id ?? '',
    drillerName: assignTo?.name ?? session?.name ?? '',
    signatureImage: null,
    ...(assignTo ? { assignedBy: session?.name ?? '', assignedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.drillLogs.add(log);
  return id;
}

/** All of a plan's logs, newest day first */
export async function planLogs(planId: string): Promise<DrillLog[]> {
  return (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).sort(
    (a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt),
  );
}

/** Aggregate drilling across ALL of a plan's logs (live) — the cross-log
 *  hole-claim ledger and progress source for both blaster and drillers. */
export function usePlanDrilling(planId: string | undefined): ShotDrilling | undefined {
  return useLiveQuery(async () => {
    if (!planId) return undefined;
    const plan = await db.drillPlans.get(planId);
    const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
    return aggregateDrilling(logs, getPlanHoles(plan));
  }, [planId]);
}

// ── S23 — Drilling over days (Sep 18 2026, plan artifact LT4fS1Wi3tQoKm8mqEGpsk v3) ──
// The pattern is a paper of the job with a state read from the facts; its
// drill log is ONE log the drillers Continue over days (Mark's C) — stored
// as one DrillLog row per driller PART so two devices never patch the same
// signature, with every hole carrying its driller, rig, date and time.

export type PlanWord = 'Draft' | 'Sent' | 'Drilling' | 'Drilled' | 'Shot';

export interface PlanPart {
  log: DrillLog;
  holes: number;
  footage: number;
  rigs: string[];
  /** the day the part first drilled, the day it last drilled */
  from?: string;
  to?: string;
}

export interface PlanPace {
  perDay: number;
  remaining: number;
  daysLeft: number;
  /** ISO date the pattern should be drilled at this pace */
  expected: string;
  /** "Thursday" · "today" · "Sep 24" */
  expectedWord: string;
}

export interface PlanProgress {
  plan: DrillPlanRecord;
  planned: number;
  drilling: ShotDrilling;
  parts: PlanPart[];
  /** "you 20 · Dinis 11" material: by driller, most holes first */
  byDriller: { userId: string; name: string; holes: number; footage: number }[];
  days: { date: string; holes: number }[];
  lastHoleAt?: string;
  word: PlanWord;
  pace: PlanPace | null;
  wet: number;
  offPlan: number;
  flagged: FlaggedHole[];
  notDrilled: number;
  shotCount: number;
  /** the pattern is locked for editing: a hole is drilled and no change is open */
  locked: boolean;
  /** the parts signed complete and waiting for the blaster */
  waiting: number;
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addWorkDays(fromISO: string, n: number): string {
  const d = new Date(`${fromISO}T12:00:00`);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** "Thursday" within the week, "today", else the date */
export function expectedWord(iso: string): string {
  const today = todayISO();
  if (iso <= today) return 'today';
  const days = Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  if (days === 1) return 'tomorrow';
  if (days < 7) return WEEKDAY[new Date(`${iso}T12:00:00`).getDay()];
  return formatDate(iso);
}

/** The word the crew reads for a plan, from the facts */
export function planWord(plan: DrillPlanRecord, facts: { drilled: number; parts: number; shotCount: number }): PlanWord {
  if (facts.shotCount > 0) return 'Shot';
  if (plan.status === 'complete') return 'Drilled';
  if (facts.drilled > 0) return 'Drilling';
  if (plan.sentAt || facts.parts > 0) return 'Sent';
  return 'Draft';
}

export async function planProgress(planId: string): Promise<PlanProgress | undefined> {
  const plan = await db.drillPlans.get(planId);
  if (!plan) return undefined;
  const planHoles = getPlanHoles(plan);
  const logs = (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const drilling = await aggregateDrilling(logs, planHoles);
  const parts: PlanPart[] = [];
  const byDriller = new Map<string, { userId: string; name: string; holes: number; footage: number }>();
  const byDay = new Map<string, number>();
  let lastHoleAt: string | undefined;
  const rigNames = new Map<string, string>();
  for (const log of logs) {
    const holes = (await db.drillLogHoles.where('drillLogId').equals(log.id).toArray()).filter((h) => !h.skipped);
    const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
    const dates = holes.map((h) => h.date).sort();
    // the rigs in the order they were used: the holes' rigs first (drilled order), then the current one
    const rigIds = [...new Set([...[...holes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((h) => h.rigEquipmentId), log.drillRigEquipmentId].filter((x): x is string => Boolean(x)))];
    const rigs: string[] = [];
    for (const id of rigIds) {
      if (!rigNames.has(id)) rigNames.set(id, (await db.equipment.get(id))?.assetNumber ?? '');
      const n = rigNames.get(id);
      if (n) rigs.push(n);
    }
    parts.push({ log, holes: holes.length, footage, rigs, from: dates[0], to: dates[dates.length - 1] });
    const key = log.drillerUserId || log.drillerName || log.id;
    const d = byDriller.get(key) ?? { userId: log.drillerUserId, name: log.drillerName || 'Unknown', holes: 0, footage: 0 };
    d.holes += holes.length;
    d.footage += footage;
    byDriller.set(key, d);
    for (const h of holes) {
      byDay.set(h.date, (byDay.get(h.date) ?? 0) + 1);
      if (!lastHoleAt || h.createdAt > lastHoleAt) lastHoleAt = h.createdAt;
    }
  }
  const planned = planHoles?.length ?? 0;
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, holes]) => ({ date, holes }));
  const drilled = drilling.totalHoles;
  const notDrilled = drilling.undrilled.length;
  const shotCount = await db.shots.filter((s) => s.drillPlanId === planId).count();
  const word = planWord(plan, { drilled, parts: logs.length, shotCount });
  // the pace: holes per drilling day so far, the remainder at that pace on
  // work days after the last drilling day
  let pace: PlanPace | null = null;
  if (word === 'Drilling' && days.length > 0 && drilled > 0) {
    const remaining = Math.max(0, planned - drilled - drilling.skipped.length);
    const perDay = drilled / days.length;
    const daysLeft = remaining === 0 ? 0 : Math.max(1, Math.ceil(remaining / perDay));
    const expected = remaining === 0 ? days[days.length - 1].date : addWorkDays(days[days.length - 1].date, daysLeft);
    pace = { perDay, remaining, daysLeft, expected, expectedWord: expectedWord(expected) };
  }
  return {
    plan,
    planned,
    drilling,
    parts,
    byDriller: [...byDriller.values()].sort((a, b) => b.holes - a.holes),
    days,
    lastHoleAt,
    word,
    pace,
    wet: drilling.wetHoles,
    offPlan: drilling.extras.length,
    flagged: drilling.flagged,
    notDrilled,
    shotCount,
    locked: drilled > 0 && !plan.changingSince,
    waiting: logs.filter((l) => l.status === 'complete').length,
  };
}

export function usePlanProgress(planId: string | undefined): PlanProgress | undefined {
  return useLiveQuery(async () => (planId ? planProgress(planId) : undefined), [planId]);
}

/** "31 of 44 · you 20 · Dinis 11" — the count line every screen shares */
export function progressLine(p: PlanProgress, meId?: string): string {
  const who = p.byDriller
    .map((d) => `${d.userId && d.userId === meId ? 'you' : d.name.split(/\s+/)[0]} ${d.holes}`)
    .join(' · ');
  return `${p.drilling.totalHoles} of ${p.planned}${who ? ` · ${who}` : ''}`;
}

/** Send the pattern to named drillers: each gets the same drill log (one
 *  PART each), and the plan records when and to whom */
export async function sendPlan(plan: DrillPlanRecord, drillers: { userId: string; name: string }[]): Promise<void> {
  const me = getSessionUser();
  const now = nowISO();
  const existing = await db.drillLogs.filter((l) => l.drillPlanId === plan.id).toArray();
  for (const d of drillers) {
    if (existing.some((l) => l.drillerUserId === d.userId && l.status === 'open')) continue;
    await createDrillPlanLog(plan, d);
  }
  const sentTo = [...(plan.sentTo ?? [])];
  for (const d of drillers) if (!sentTo.some((x) => x.userId === d.userId)) sentTo.push(d);
  await db.drillPlans.update(plan.id, { sentAt: plan.sentAt ?? now, sentBy: me?.name ?? plan.sentBy, sentTo, updatedAt: now });
}

/** A driller's own job-day for the pattern's job today — created drill-only
 *  when nobody started it, so his checklist, time card and home card have a
 *  day to live on (the drillers' days are unchanged by S23) */
export async function ensureDrillingDay(jobId: string): Promise<string> {
  const today = todayISO();
  const existing = await findDayByDate(jobId, today);
  if (existing) return existing.id;
  return createBlastDay(jobId, today, undefined, { typeOfWork: 'drill_only' });
}

/** Continue: my open part of the pattern's log, or a new part — never a
 *  second open one. Returns the part's id. */
export async function continuePart(plan: DrillPlanRecord): Promise<string> {
  const me = getSessionUser();
  const mine = (await db.drillLogs.filter((l) => l.drillPlanId === plan.id && l.drillerUserId === (me?.id ?? '')).toArray()).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
  const open = mine.find((l) => l.status === 'open');
  await ensureDrillingDay(plan.jobId).catch(() => undefined);
  if (open) return open.id;
  return createDrillPlanLog(plan);
}

/** The pattern turns Drilled by itself at the full count — drilled holes
 *  plus the ones a driller marked not drilled with a reason */
export async function autoDrilled(planId: string): Promise<boolean> {
  const plan = await db.drillPlans.get(planId);
  if (!plan || plan.status !== 'open') return false;
  const holes = getPlanHoles(plan);
  if (!holes || holes.length === 0) return false;
  const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
  const drilling = await aggregateDrilling(logs, holes);
  if (drilling.totalHoles + drilling.skipped.length < holes.length || drilling.undrilled.length > 0) return false;
  const now = nowISO();
  await db.drillPlans.update(planId, { status: 'complete', drilledAt: now, updatedAt: now });
  return true;
}

/** The last driller closes the pattern short — the holes left count as not
 *  drilled, for the reason he gives */
export async function closePlanShort(plan: DrillPlanRecord, reason: string): Promise<void> {
  const me = getSessionUser();
  const now = nowISO();
  await db.drillPlans.update(plan.id, {
    status: 'complete',
    drilledAt: now,
    closedShort: { by: me?.id ?? '', byName: me?.name ?? '', at: now, reason: reason.trim() },
    updatedAt: now,
  });
}

export async function reopenPlan(plan: DrillPlanRecord): Promise<void> {
  await db.drillPlans.update(plan.id, { status: 'open', drilledAt: undefined, closedShort: undefined, updatedAt: nowISO() });
}

/** Changing a pattern that is already being drilled: a new version with a
 *  note the drillers see; the grid unlocks until the change is finished */
export async function startPlanChange(plan: DrillPlanRecord, note: string): Promise<void> {
  const me = getSessionUser();
  const now = nowISO();
  const version = (plan.version ?? 1) + 1;
  await db.drillPlans.update(plan.id, {
    version,
    changingSince: now,
    revisions: [...(plan.revisions ?? []), { version, at: now, byName: me?.name ?? '', note: note.trim() }],
    updatedAt: now,
  });
}

export async function finishPlanChange(plan: DrillPlanRecord): Promise<void> {
  await db.drillPlans.update(plan.id, { changingSince: undefined, updatedAt: nowISO() });
}

/** Accepting a part FILES it — the office copy is the paper — then marks
 *  it accepted (the same as the archive route, without the screen) */
export async function acceptPart(log: DrillLog): Promise<void> {
  const { buildDrillLogPdf } = await import('@/pdfdocs');
  const { fileSubmission } = await import('@/lib/archive');
  const pdf = await buildDrillLogPdf(log.id);
  const job = await db.jobs.get(log.jobId);
  const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
  await fileSubmission({
    type: 'drill_log',
    sourceId: log.id,
    blastDayId: log.blastDayId,
    jobId: log.jobId,
    title: `Drill Log — ${job?.name ?? ''} · ${plan?.name ?? 'pattern'} · ${log.drillerName}`,
    date: log.date ?? log.createdAt.slice(0, 10),
    pdf,
    meta: { jobName: job?.name, driller: log.drillerName, pattern: plan?.name, planVersion: plan?.version ?? 1 },
  });
  const now = nowISO();
  await db.drillLogs.update(log.id, { status: 'accepted', acceptedBy: getSessionUser()?.name ?? '', acceptedAt: now, updatedAt: now });
}

/** Accept the drill log: every part signed complete, in one tap — one office
 *  copy per pattern (push 2; push 1 filed a copy per part) */
export async function acceptPlanDrilling(planId: string): Promise<number> {
  return acceptPatternLog(planId);
}

/** Plan parts that were on a job-day: a hole dated that day, or (today) an open part */
export async function planPartsOnDay(jobId: string, date: string): Promise<DrillLog[]> {
  const parts = await db.drillLogs.filter((l) => l.jobId === jobId && Boolean(l.drillPlanId)).toArray();
  const out: DrillLog[] = [];
  for (const p of parts) {
    if ((p.date ?? p.createdAt.slice(0, 10)) === date) {
      out.push(p);
      continue;
    }
    const holes = await db.drillLogHoles.where('drillLogId').equals(p.id).toArray();
    if (holes.some((h) => h.date === date) || (p.status === 'open' && date === todayISO())) out.push(p);
  }
  return out;
}

/** The holes of one part, as the paper lists them: number order */
export async function partHoles(logId: string): Promise<DrillLogHole[]> {
  return (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
    a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
  );
}

// ── S23 push 2 — the shot from the drilled pattern ─────────────────────────

export interface ShotCandidate {
  plan: DrillPlanRecord;
  progress: PlanProgress;
  /** drilled and every part accepted — one pattern, one shot */
  ready: boolean;
  why: string;
}

/** The job's patterns a shot could be made from, ready ones first. A pattern
 *  already shot is not listed (one pattern, one shot — Matthew's d5). */
export async function shotCandidates(jobId: string): Promise<ShotCandidate[]> {
  const plans = (await db.drillPlans.where('jobId').equals(jobId).toArray()).filter((p) => !p.archivedAt);
  const out: ShotCandidate[] = [];
  for (const plan of plans) {
    const progress = await planProgress(plan.id);
    if (!progress || progress.word === 'Shot') continue;
    const parts = progress.parts;
    const allAccepted = parts.length > 0 && parts.every((p) => p.log.status === 'accepted');
    const ready = progress.word === 'Drilled' && allAccepted;
    const why =
      progress.word === 'Drilled'
        ? allAccepted
          ? `accepted · ${progress.drilling.totalHoles} holes · ${Math.round(progress.drilling.totalFootage)} ft`
          : `drilled · accept the drill log first (${progress.waiting} part${progress.waiting === 1 ? '' : 's'} signed)`
        : progress.word === 'Drilling'
          ? `still drilling · ${progress.drilling.totalHoles} of ${progress.planned}`
          : progress.word === 'Sent'
            ? 'sent · not drilled yet'
            : 'draft · not sent';
    out.push({ plan, progress, ready, why });
  }
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || b.plan.updatedAt.localeCompare(a.plan.updatedAt));
}

/** Lay the drilled pattern onto a shot: the pattern's layout as the shot's
 *  diagram (timing cleared), the header numbers from the plan, the totals
 *  from the accepted drilling. */
export async function applyPlanToShot(shotId: string, planId: string): Promise<void> {
  const [shot, plan] = await Promise.all([db.shots.get(shotId), db.drillPlans.get(planId)]);
  if (!shot || !plan) throw new Error('shot or pattern not found');
  const parts = (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).filter((l) => l.status === 'accepted');
  const agg = await aggregateDrilling(parts, getPlanHoles(plan));
  const { seedDiagramFromPlan } = await import('@/lib/shotDiagram');
  const { recalcShotTotals } = await import('@/lib/shotTotals');
  const drillParams = {
    ...shot.drillParams,
    holeDiameter: plan.holeDiameter || shot.drillParams.holeDiameter,
    burden: plan.burden || shot.drillParams.burden,
    spacing: plan.spacing || shot.drillParams.spacing,
  };
  const figures = { numHoles: agg.totalHoles, totalDrillFootage: +agg.totalFootage.toFixed(1), avgDrillDepth: agg.totalHoles > 0 ? +(agg.totalFootage / agg.totalHoles).toFixed(1) : 0 };
  const totals = recalcShotTotals(drillParams, { ...shot.totals, ...figures });
  await db.shots.update(shotId, {
    drillPlanId: planId,
    drillParams,
    totals,
    totalsSource: 'drilling',
    designPlan: { ...shot.designPlan, shotDiagramData: seedDiagramFromPlan(plan) },
    updatedAt: nowISO(),
  });
}

/** A shot on the blasting log from a drilled pattern — an empty first shot
 *  (the one a new blasting log starts with) is used rather than left blank
 *  beside the pattern's; otherwise a new shot is added */
export async function makeShotFromPlan(blastLogId: string, planId: string, kFactor = 180): Promise<string> {
  const { addShot } = await import('./useBlastDay');
  const { hasDrillPlan, parseDiagram } = await import('@/lib/shotDiagram');
  const shots = (await db.shots.where('blastLogId').equals(blastLogId).toArray()).sort((a, b) => a.shotNumber - b.shotNumber);
  const empty = shots.find((s) => !s.drillPlanId && !(s.totals.numHoles > 0) && !s.signatureImage && !hasDrillPlan(parseDiagram(s.designPlan.shotDiagramData)) && !(s.designPlan.shotDiagramData ?? '').includes('"start"'));
  const id = empty?.id ?? (await addShot(blastLogId, kFactor));
  await applyPlanToShot(id, planId);
  return id;
}

export interface PatternFacts {
  planId: string;
  name: string;
  version: number;
  word: PlanWord;
  planned: number;
  holes: number;
  footage: number;
  from?: string;
  to?: string;
  parts: { name: string; rigs: string[]; signedAt?: string; status: DrillLog['status'] }[];
  offPlan: number;
  wet: number;
  voids: number;
  notDrilled: number;
  acceptedBy?: string;
  acceptedAt?: string;
}

/** What the shot's drilling card and the printed blasting log say about the pattern */
export async function patternFacts(planId: string): Promise<PatternFacts | undefined> {
  const p = await planProgress(planId);
  if (!p) return undefined;
  const accepted = p.parts.filter((x) => x.log.status === 'accepted').map((x) => x.log);
  const last = accepted.sort((a, b) => (b.acceptedAt ?? '').localeCompare(a.acceptedAt ?? ''))[0];
  const dates = p.days.map((d) => d.date);
  return {
    planId,
    name: p.plan.name,
    version: p.plan.version ?? 1,
    word: p.word,
    planned: p.planned,
    holes: p.drilling.totalHoles,
    footage: p.drilling.totalFootage,
    from: dates[0],
    to: dates[dates.length - 1],
    parts: p.parts.map((x) => ({ name: x.log.drillerName || 'unassigned', rigs: x.rigs, signedAt: x.log.completedAt, status: x.log.status })),
    offPlan: p.offPlan,
    wet: p.wet,
    voids: p.drilling.voidHoles,
    notDrilled: p.notDrilled,
    acceptedBy: last?.acceptedBy,
    acceptedAt: last?.acceptedAt,
  };
}

export function usePatternFacts(planId: string | undefined): PatternFacts | undefined {
  return useLiveQuery(async () => (planId ? patternFacts(planId) : undefined), [planId]);
}

/** The blasting log's printed drilling lines, one value per shot — a shot
 *  made from a pattern names it; an older shot prints a dash */
export interface PatternLine {
  label: string;
  values: Record<string, string>;
}

export async function patternLinesForShots(shots: Pick<Shot, 'id' | 'drillPlanId'>[]): Promise<PatternLine[]> {
  const facts = new Map<string, PatternFacts>();
  for (const s of shots) {
    if (!s.drillPlanId) continue;
    const f = await patternFacts(s.drillPlanId);
    if (f) facts.set(s.id, f);
  }
  if (facts.size === 0) return [];
  const line = (label: string, get: (f: PatternFacts) => string): PatternLine => ({
    label,
    values: Object.fromEntries(shots.map((s) => [s.id, facts.has(s.id) ? get(facts.get(s.id)!) : '—'])),
  });
  const short = (iso?: string) => (iso ? formatDate(iso.slice(0, 10)) : '—');
  return [
    line('Drill plan:', (f) => `${f.name}${f.version > 1 ? ` v${f.version}` : ''}`),
    line('Drilled:', (f) => (f.from ? (f.to && f.to !== f.from ? `${short(f.from)} – ${short(f.to)}` : short(f.from)) : '—')),
    line('Drill log:', (f) => f.parts.map((x) => `${x.name}${x.rigs.length ? ` (${x.rigs.join(', ')})` : ''}${x.signedAt ? ` signed ${short(x.signedAt)}` : ''}`).join(' · ') || '—'),
    line('Holes drilled:', (f) => `${f.holes} of ${f.planned} · ${Math.round(f.footage)}'`),
    line('Off-plan / water:', (f) => `${f.offPlan} off-plan · ${f.wet} wet${f.voids ? ` · ${f.voids} void` : ''}${f.notDrilled ? ` · ${f.notDrilled} not drilled` : ''}`),
    line('Drilling accepted:', (f) => (f.acceptedBy ? `${f.acceptedBy} ${short(f.acceptedAt)}` : '—')),
  ];
}

/** Accept the drill log: every part signed complete is accepted, and ONE
 *  office copy — the pattern's sheet, every part's holes and signatures —
 *  files under the pattern's first part (Q2/Q3: the log files with the
 *  pattern when the blaster accepts; one sheet per pattern). */
export async function acceptPatternLog(planId: string): Promise<number> {
  const all = (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const signed = all.filter((l) => l.status === 'complete');
  if (signed.length === 0) return 0;
  const me = getSessionUser();
  const now = nowISO();
  for (const p of signed) await db.drillLogs.update(p.id, { status: 'accepted', acceptedBy: me?.name ?? '', acceptedAt: now, updatedAt: now });
  const primary = all[0];
  const { buildDrillLogPdf } = await import('@/pdfdocs');
  const { fileSubmission } = await import('@/lib/archive');
  const plan = await db.drillPlans.get(planId);
  const job = await db.jobs.get(primary.jobId);
  const pdf = await buildDrillLogPdf(primary.id);
  await fileSubmission({
    type: 'drill_log',
    sourceId: primary.id,
    jobId: primary.jobId,
    title: `Drill Log — ${job?.name ?? ''} · ${plan?.name ?? 'pattern'}`,
    date: plan?.drilledAt?.slice(0, 10) ?? todayISO(),
    pdf,
    meta: { jobName: job?.name, pattern: plan?.name, planVersion: plan?.version ?? 1, drillers: all.map((l) => l.drillerName).filter(Boolean), parts: all.length },
  });
  return signed.length;
}

/** The pattern's whole drill log for the sheet: every part with its holes,
 *  in hole order, the rigs, and each part's signature */
export async function patternSheet(planId: string): Promise<{ plan: DrillPlanRecord; parts: DrillLog[]; holes: (DrillLogHole & { partId: string })[]; rigs: Map<string, string> } | undefined> {
  const plan = await db.drillPlans.get(planId);
  if (!plan) return undefined;
  const parts = (await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const holes: (DrillLogHole & { partId: string })[] = [];
  const rigs = new Map<string, string>();
  for (const p of parts) {
    for (const h of await db.drillLogHoles.where('drillLogId').equals(p.id).toArray()) holes.push({ ...h, partId: p.id });
    for (const id of [p.drillRigEquipmentId, ...(p.rigChanges ?? []).map((c) => c.toRigId)]) {
      if (id && !rigs.has(id)) rigs.set(id, (await db.equipment.get(id))?.assetNumber ?? '');
    }
  }
  for (const h of holes) if (h.rigEquipmentId && !rigs.has(h.rigEquipmentId)) rigs.set(h.rigEquipmentId, h.rigAsset ?? (await db.equipment.get(h.rigEquipmentId))?.assetNumber ?? '');
  holes.sort((a, b) => a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }));
  return { plan, parts, holes, rigs };
}
