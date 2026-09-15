// The hub (Round S14): what each paper on a day is doing, who is on the
// day and what each of them still owes, the File row, reminders, and the
// four coverage dots the office reads. Everything here is derived from the
// papers themselves — a tile never invents a state.
import { db, useLiveQuery } from '@/db';
import type {
  BlastDay,
  BlastLog,
  DailyReport,
  DayReminder,
  DrillChecklist,
  DrillLog,
  Shot,
  Submission,
  TimeCard,
  WorkDayConfirmation,
} from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { getShotPlan } from '@/hooks/useDrillLogs';
import { hhmm } from '@/lib/dayCard';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';

export type Tone = 'plain' | 'next' | 'warn' | 'done' | 'bad';
export type TileAction = 'Start' | 'Open' | 'View' | 'None';

export interface TileState {
  title: string;
  sub: string;
  action: TileAction;
  tone: Tone;
  /** a second line in amber (type-of-work mismatch, sent-back note) */
  note?: string;
}

const who = (name: string | undefined, at: string) => `${name ? `by ${name} ` : ''}${hhmm(at)}`.trim();

// ── Tiles ──────────────────────────────────────────────────────────────────

export function blastLogTile(
  day: BlastDay,
  log: BlastLog | undefined,
  shots: Shot[],
  filedAt: string | undefined,
  canStart: boolean,
): TileState | null {
  const blasting = isBlastingWork(day.typeOfWork);
  if (!log) {
    if (!blasting) return null;
    return { title: 'Not started', sub: 'the day is a blasting day', action: canStart ? 'Start' : 'None', tone: 'plain' };
  }
  const note = !blasting ? `Type of work says ${day.typeOfWork.replace(/_/g, ' ')}, but there is a blasting log — change one` : undefined;
  if (day.status === 'approved') return { title: 'Approved', sub: 'locked', action: 'View', tone: 'done', note };
  if (day.status === 'submitted') return { title: filedAt ? `Filed ${hhmm(filedAt)}` : 'Filed', sub: 'with the office', action: 'View', tone: 'done', note };
  if (day.sendBackNote) return { title: 'Sent back', sub: `Office: “${day.sendBackNote}”`, action: 'Open', tone: 'bad', note };
  // S16 (Matthew): one log, one blaster, one signature — the log's box is it
  const logSigned = Boolean(log.signatureImage) && shots.length > 0;
  if (logSigned) return { title: 'Ready to file', sub: `signed · ${shots.length} shot${shots.length === 1 ? '' : 's'}`, action: 'Open', tone: 'done', note };
  return {
    title: `Started ${who(log.blasterName || undefined, log.createdAt)}`,
    sub: shots.length === 0 ? 'no shots yet' : `${shots.length} shot${shots.length === 1 ? '' : 's'} · not signed yet`,
    action: 'Open',
    tone: 'next',
    note,
  };
}

export function dailyReportTile(
  day: BlastDay,
  report: DailyReport | undefined,
  cardsFiled: number,
  filedAt: string | undefined,
  canStart: boolean,
  readOnly: boolean,
): TileState {
  if (!report) return { title: 'Not started', sub: 'crew, hours, materials, equipment', action: canStart && !readOnly ? 'Start' : 'None', tone: 'plain' };
  if (day.status === 'approved') return { title: 'Approved', sub: 'locked', action: 'View', tone: 'done' };
  if (day.status === 'submitted') return { title: filedAt ? `Filed ${hhmm(filedAt)}` : 'Filed', sub: 'with the office', action: 'View', tone: 'done' };
  return {
    title: `Started ${hhmm(report.createdAt)}`,
    sub: `crew from cards: ${cardsFiled}`,
    action: readOnly ? 'View' : 'Open',
    tone: 'done',
  };
}

export function timeCardTile(card: TimeCard | undefined): TileState {
  if (!card) return { title: 'Not filed', sub: 'your in and out for the day', action: 'Open', tone: 'plain' };
  if (card.status === 'approved') return { title: 'Approved', sub: `${card.timeIn || '—'} to ${card.timeOut || '—'}`, action: 'View', tone: 'done' };
  if (card.status === 'filed') return { title: `Filed${card.filedAt ? ` ${hhmm(card.filedAt)}` : ''}`, sub: `${card.timeIn || '—'} to ${card.timeOut || '—'}`, action: 'View', tone: 'done' };
  return { title: `Draft · ${card.timeIn || '—'} to ${card.timeOut || '—'}`, sub: card.timeOut ? 'not filed yet' : 'out time not entered', action: 'Open', tone: 'next' };
}

export function drillLogTile(log: DrillLog | undefined, holes: number, planned: number, plannedInfo: string, canStart: boolean): TileState {
  if (!log) return { title: 'Not started', sub: plannedInfo, action: canStart ? 'Start' : 'None', tone: 'plain' };
  if (log.status === 'accepted') return { title: 'Accepted', sub: `by ${log.acceptedBy || 'the blaster'}${log.acceptedAt ? ` ${hhmm(log.acceptedAt)}` : ''}`, action: 'View', tone: 'done' };
  if (log.status === 'complete') return { title: 'Signed complete', sub: `${holes}${planned ? ` of ${planned}` : ''} holes · waiting on the blaster`, action: 'Open', tone: 'done' };
  return { title: `${holes}${planned ? ` of ${planned}` : ''} holes`, sub: log.reopenNote ? `sent back: “${log.reopenNote}”` : 'drilling', action: 'Open', tone: log.reopenNote ? 'bad' : 'next' };
}

// ── The File row ───────────────────────────────────────────────────────────

export interface FileState {
  kind: 'none' | 'blocked' | 'ready' | 'filed' | 'closed';
  label: string;
  note?: string;
}

export function fileState(day: BlastDay, log: BlastLog | undefined, shots: Shot[], report: DailyReport | undefined, drillLogs: number): FileState {
  if (day.closed) return { kind: 'closed', label: `Closed · ${day.closed.reason || 'nothing to file'}`, note: `${day.closed.byName} · ${hhmm(day.closed.at)}` };
  if (day.status === 'submitted') return { kind: 'filed', label: 'Filed with the office' };
  if (day.status === 'approved') return { kind: 'filed', label: 'Approved' };
  const blasting = isBlastingWork(day.typeOfWork) || Boolean(log);
  if (blasting) {
    if (!log) return { kind: 'none', label: '' };
    // S16: the log's signature is the one signature
    if (shots.length === 0) return { kind: 'blocked', label: 'No shots on the blasting log yet' };
    if (!log.signatureImage) return { kind: 'blocked', label: 'The blasting log is not signed — sign it to file' };
    return { kind: 'ready', label: 'File this day', note: report ? undefined : 'files with the note “No daily report”' };
  }
  if (!report && drillLogs === 0) return { kind: 'none', label: '' };
  return { kind: 'ready', label: 'File this day', note: report ? undefined : 'files the drill logs with the note “No daily report”' };
}

// ── The crew on a day ──────────────────────────────────────────────────────

export interface CrewPerson {
  key: string;
  userId?: string;
  name: string;
  role?: string;
  onSiteAt?: string;
  checklists: { checklist: DrillChecklist; asset: string }[];
  logs: DrillLog[];
  holesByLog: Map<string, number>;
  card?: TimeCard;
  /** the blaster can act: a log signed complete (Accept) or a missing card (Remind) */
  waitingOnBlaster: boolean;
  needs: boolean;
  reminded?: DayReminder;
}

export interface CrewModel {
  people: CrewPerson[];
  cardsFiled: number;
  openLogs: number;
  waiting: number;
}

export async function dayDrillLogsFor(day: BlastDay): Promise<DrillLog[]> {
  const byDay = await db.drillLogs.where('blastDayId').equals(day.id).toArray();
  const seen = new Set(byDay.map((l) => l.id));
  const byJob = (await db.drillLogs.where('jobId').equals(day.jobId).toArray()).filter(
    (l) => !seen.has(l.id) && (l.date ?? l.createdAt.slice(0, 10)) === day.date,
  );
  return [...byDay, ...byJob];
}

export async function dayChecklistsFor(day: BlastDay, logs: DrillLog[]): Promise<{ checklist: DrillChecklist; asset: string }[]> {
  const all = (await db.drillChecklists.filter((c) => c.date === day.date).toArray()).filter(
    (c) => c.jobId === day.jobId || logs.some((l) => l.drillRigEquipmentId === c.equipmentId || l.drillerUserId === c.drillerUserId),
  );
  const out: { checklist: DrillChecklist; asset: string }[] = [];
  for (const c of all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    out.push({ checklist: c, asset: (await db.equipment.get(c.equipmentId))?.assetNumber ?? '—' });
  }
  return out;
}

export async function dayCardsFor(day: BlastDay): Promise<TimeCard[]> {
  return db.timeCards.filter((c) => c.blastDayId === day.id || (c.jobId === day.jobId && c.date === day.date)).toArray();
}

/** Everyone with a paper or a confirmation on the day, except me */
export async function crewModel(day: BlastDay): Promise<CrewModel> {
  const me = getSessionUser();
  const confirmations = await db.workDayConfirmations.where('blastDayId').equals(day.id).toArray();
  const logs = await dayDrillLogsFor(day);
  const checklists = await dayChecklistsFor(day, logs);
  const cards = await dayCardsFor(day);
  const reminders = (await db.dayReminders.where('blastDayId').equals(day.id).toArray()).filter((r) => !r.clearedAt);
  const holesByLog = new Map<string, number>();
  for (const l of logs) holesByLog.set(l.id, (await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()).filter((h) => !h.skipped).length);

  const people = new Map<string, CrewPerson>();
  const keyOf = (userId: string | undefined, name: string) => userId || `name:${name.trim().toLowerCase()}`;
  const get = (userId: string | undefined, name: string): CrewPerson => {
    const k = keyOf(userId, name);
    let p = people.get(k);
    if (!p) {
      p = { key: k, userId, name, checklists: [], logs: [], holesByLog, waitingOnBlaster: false, needs: false };
      people.set(k, p);
    }
    if (!p.userId && userId) p.userId = userId;
    return p;
  };
  for (const c of confirmations) get(c.userId, c.userName).onSiteAt = c.confirmedAt;
  for (const x of checklists) get(x.checklist.drillerUserId || undefined, x.checklist.drillerName).checklists.push(x);
  for (const l of logs) get(l.drillerUserId || undefined, l.drillerName).logs.push(l);
  for (const c of cards) get(c.userId, c.personName).card = c;
  for (const r of reminders) {
    const p = people.get(r.toUserId);
    if (p) p.reminded = r;
  }
  const rows = [...people.values()].filter((p) => !(me && p.userId === me.id));
  for (const p of rows) {
    const cardMissing = !p.card || p.card.status === 'draft';
    const complete = p.logs.some((l) => l.status === 'complete');
    p.waitingOnBlaster = complete;
    p.needs = cardMissing || complete;
  }
  rows.sort((a, b) => Number(b.needs) - Number(a.needs) || a.name.localeCompare(b.name));
  const filed = cards.filter((c) => c.status !== 'draft');
  return {
    people: rows,
    cardsFiled: filed.length,
    openLogs: logs.filter((l) => l.status === 'open').length,
    waiting: rows.filter((p) => p.waitingOnBlaster).length,
  };
}

export function useCrew(day: BlastDay | undefined): CrewModel | undefined {
  return useLiveQuery(async () => (day ? crewModel(day) : undefined), [day?.id, day?.jobId, day?.date]);
}

/** The blaster accepts a drill log signed complete — the same transition
 *  as the review screen's Accept all */
export async function acceptDrillLog(log: DrillLog): Promise<void> {
  const me = getSessionUser();
  const now = nowISO();
  await db.drillLogs.update(log.id, { status: 'accepted', acceptedBy: me?.name ?? '', acceptedAt: now, updatedAt: now });
}

// ── Reminders ──────────────────────────────────────────────────────────────

export async function remindForCard(day: BlastDay, toUserId: string, toName: string): Promise<string> {
  const me = getSessionUser();
  const now = nowISO();
  const existing = (await db.dayReminders.where('blastDayId').equals(day.id).toArray()).find(
    (r) => r.toUserId === toUserId && r.what === 'timecard' && !r.clearedAt,
  );
  if (existing) return existing.id;
  const id = generateId();
  const row: DayReminder = {
    id,
    blastDayId: day.id,
    jobId: day.jobId,
    date: day.date,
    toUserId,
    toName,
    fromUserId: me?.id ?? '',
    fromName: me?.name ?? '',
    what: 'timecard',
    at: now,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.dayReminders.add(row);
  return id;
}

export async function dismissReminder(id: string): Promise<void> {
  const now = nowISO();
  await db.dayReminders.update(id, { clearedAt: now, updatedAt: now });
}

/** My open reminders, with the job name; a reminder whose card has since
 *  been filed is cleared on the way through */
export function useMyReminders(): { reminder: DayReminder; jobName: string }[] {
  const me = getSessionUser()?.id;
  return (
    useLiveQuery(async () => {
      if (!me) return [];
      const rows = (await db.dayReminders.filter((r) => r.toUserId === me && !r.clearedAt).toArray()).sort((a, b) => b.at.localeCompare(a.at));
      const out: { reminder: DayReminder; jobName: string }[] = [];
      for (const r of rows) {
        const filed = r.what === 'timecard'
          ? await db.timeCards
              .filter((c) => c.userId === me && c.jobId === r.jobId && c.date === r.date && c.status !== 'draft')
              .count()
          : 0;
        if (filed > 0) {
          await dismissReminder(r.id);
          continue;
        }
        out.push({ reminder: r, jobName: (await db.jobs.get(r.jobId))?.name ?? 'the job' });
      }
      return out;
    }, [me]) ?? []
  );
}

// ── Coverage dots (office list, Records) ───────────────────────────────────

export type Dot = 'grey' | 'amber' | 'green' | 'teal' | 'red';
export interface Coverage {
  log: Dot;
  report: Dot;
  drilling: Dot;
  cards: Dot;
  /** why the row floats up, or '' */
  attention: string;
  onSite: number;
  cardsFiled: number;
  cardsTotal: number;
}

export async function dayCoverage(day: BlastDay): Promise<Coverage> {
  const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
  const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
  const logs = await dayDrillLogsFor(day);
  const checklists = await dayChecklistsFor(day, logs);
  const cards = await dayCardsFor(day);
  const onSite = await db.workDayConfirmations.where('blastDayId').equals(day.id).count();
  const filedDay = day.status === 'submitted';
  const approved = day.status === 'approved';
  const paperDot = (exists: boolean): Dot => (!exists ? 'grey' : approved ? 'teal' : filedDay ? 'green' : day.sendBackNote ? 'red' : 'amber');
  const drilling: Dot =
    logs.length === 0 && checklists.length === 0
      ? 'grey'
      : logs.length > 0 && logs.every((l) => l.status === 'accepted')
        ? 'green'
        : 'amber';
  const cardsDot: Dot =
    cards.length === 0 ? 'grey' : cards.every((c) => c.status === 'approved') ? 'teal' : cards.every((c) => c.status !== 'draft') ? 'green' : 'amber';
  let attention = '';
  if (day.status === 'draft' && day.sendBackNote) attention = 'sent back, waiting on the field';
  else if (logs.some((l) => l.status === 'complete')) attention = 'a drill log signed complete is waiting on the blaster';
  else if (day.status === 'draft' && !log && !report && logs.length === 0 && checklists.length === 0 && day.date === todayISO() && new Date().getHours() >= 10)
    attention = `nothing started by 10:00${onSite ? ` · ${onSite} on site` : ''}`;
  return {
    log: paperDot(Boolean(log)),
    report: paperDot(Boolean(report)),
    drilling,
    cards: cardsDot,
    attention,
    onSite,
    cardsFiled: cards.filter((c) => c.status !== 'draft').length,
    cardsTotal: cards.length,
  };
}

export const DOT_CLASS: Record<Dot, string> = {
  grey: 'bg-gray-300',
  amber: 'bg-amber-400',
  green: 'bg-green-600',
  teal: 'bg-teal-600',
  red: 'bg-red-600',
};

/** DB / DO / DE / C / H on the paper forms */
export const WORK_CODE: Record<string, string> = {
  drill_to_blast: 'DB',
  blasting: 'B',
  drill_only: 'DO',
  drill_to_excavate: 'DE',
  crushing: 'C',
  hauling: 'H',
};

/** The latest filed copy's time, for "Filed 3:12 PM" */
export async function dayFiledAt(dayId: string): Promise<string | undefined> {
  const subs = (await db.submissions.filter((s) => s.blastDayId === dayId).toArray()) as Submission[];
  return subs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt;
}

/** Planned holes on a day's shots, for a driller's "Not started · plan sent · 77 holes" */
export function plannedHoles(shots: Shot[]): number {
  return shots.reduce((a, s) => a + (getShotPlan(s)?.length ?? 0), 0);
}

export type { WorkDayConfirmation };

// ── Closed, nothing to file (S15) ─────────────────────────────────────────
// A day that was started and abandoned — rained out, rescheduled, opened by
// mistake — is closed with a reason instead of sitting in the office's
// never-submitted queue for ever. Only a day with nothing to file can close;
// Reopen brings it back exactly as it was.

export const CLOSE_REASONS = [
  { value: 'Rained out', label: 'Rained out' },
  { value: 'Rescheduled', label: 'Rescheduled' },
  { value: 'Started by mistake', label: 'Started by mistake' },
  { value: 'No work today', label: 'No work today' },
];

export async function closeDay(day: BlastDay, reason: string): Promise<void> {
  const me = getSessionUser();
  await db.blastDays.update(day.id, {
    closed: { by: me?.id ?? '', byName: me?.name ?? '', at: nowISO(), reason: reason.trim() || 'nothing to file' },
    updatedAt: nowISO(),
  });
}

export async function reopenDay(day: BlastDay): Promise<void> {
  await db.blastDays.update(day.id, { closed: undefined, updatedAt: nowISO() });
}
