// Change the date (Round S16, Matthew): a day started on the wrong date —
// Monday's work logged on Tuesday's day, or a day made early for tomorrow's
// shot — moves to the right date with every paper on it. The day keeps its
// record (and its hidden job+date name from birth; his pick A): only the
// date changes, here and on each paper that carries one. The server applies
// the same move from the `dayMoves` row, so papers this phone never saw
// (another driller's card) move too, and the mover is allowed to re-date
// other people's papers only because that row exists.
import { db } from '@/db';
import type { BlastDay, DayMove, DrillChecklist, DrillLog, TimeCard } from '@/db/schema';
import { findDayByDate } from '@/lib/dayCard';
import { deleteDayCascade } from '@/lib/lifecycle';
import { canEditApprovedDay } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { formatDate, generateId, nowISO } from '@/lib/utils';

export interface MoveRow {
  label: string;
  tone: 'ok' | 'warn';
}

export interface MovePlan {
  blocks: string[];
  rows: MoveRow[];
  /** a day this job already has on the target date */
  target?: BlastDay;
  /** …and it holds no papers, so the move absorbs it */
  targetEmpty: boolean;
  logs: DrillLog[];
  cards: TimeCard[];
  checklists: DrillChecklist[];
}

/** Whoever started the day, or a supervisor / admin (Matthew's pick) */
export function canMoveDay(day: BlastDay): boolean {
  const me = getSessionUser();
  if (!me) return false;
  if (canEditApprovedDay()) return true;
  return Boolean(day.setup?.by && day.setup.by === me.id);
}

export function whoMayMove(day: BlastDay): string {
  return `${day.setup?.byName || 'whoever started this day'} or a supervisor`;
}

async function papersOn(dayId: string): Promise<number> {
  return (
    (await db.blastLogs.where('blastDayId').equals(dayId).count()) +
    (await db.dailyReports.where('blastDayId').equals(dayId).count()) +
    (await db.drillLogs.where('blastDayId').equals(dayId).count()) +
    (await db.timeCards.where('blastDayId').equals(dayId).count())
  );
}

export async function movePlan(day: BlastDay, toDate: string): Promise<MovePlan> {
  const blocks: string[] = [];
  const rows: MoveRow[] = [];
  const from = day.date;
  if (day.status !== 'draft') blocks.push('This day is filed with the office — withdraw the filing before changing its date');
  const filed = await db.submissions.filter((s) => s.blastDayId === day.id).count();
  if (filed > 0 && day.status === 'draft') blocks.push(`${filed} office cop${filed === 1 ? 'y is' : 'ies are'} filed from this day — withdraw them before changing its date`);
  if (toDate === from) blocks.push('That is already this day’s date');

  let target: BlastDay | undefined;
  let targetEmpty = false;
  const job = await db.jobs.get(day.jobId);
  const other = await findDayByDate(day.jobId, toDate);
  if (other && other.id !== day.id) {
    target = other;
    const n = await papersOn(other.id);
    if (n > 0 || other.status !== 'draft') blocks.push(`${job?.name ?? 'This job'} already has a day on ${formatDate(toDate)} with papers — open that day instead`);
    else targetEmpty = true;
  }

  // what moves
  const facts = [day.typeOfWork.replace(/_/g, ' '), day.conditions?.weather, day.onsiteTime ? `on site ${day.onsiteTime}` : null].filter(Boolean).join(' · ');
  rows.push({ label: `The card: ${facts || 'no facts yet'}`, tone: 'ok' });
  const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
  if (log) {
    const shots = await db.shots.where('blastLogId').equals(log.id).count();
    rows.push({ label: `Blasting log${log.blasterName ? ` by ${log.blasterName}` : ''} · ${shots} shot${shots === 1 ? '' : 's'}${shots > 0 ? ' · drill plans follow their shots' : ''}`, tone: 'ok' });
  }
  const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
  if (report) rows.push({ label: 'Daily report and its rows', tone: 'ok' });
  const logs = await db.drillLogs.filter((l) => l.blastDayId === day.id || (l.jobId === day.jobId && (l.date ?? l.createdAt.slice(0, 10)) === from)).toArray();
  for (const l of logs) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(l.id).count();
    rows.push({ label: `Drill log · ${l.drillerName || 'driller'} · ${holes} hole${holes === 1 ? '' : 's'} · ${l.status}`, tone: 'ok' });
  }
  const cards = await db.timeCards.filter((c) => c.blastDayId === day.id || (c.jobId === day.jobId && c.date === from)).toArray();
  for (const c of cards) {
    const filedCard = c.status !== 'draft';
    rows.push({
      label: `Time card · ${c.personName} · ${c.status}${filedCard ? ` — moves too; ${c.personName} sees a line on their home` : ''}`,
      tone: filedCard ? 'warn' : 'ok',
    });
  }
  const confirmed = await db.workDayConfirmations.where('blastDayId').equals(day.id).toArray();
  if (confirmed.length > 0) rows.push({ label: `Confirmed the card: ${confirmed.map((c) => c.userName.split(' ')[0]).join(', ')}`, tone: 'ok' });
  const checklists = await db.drillChecklists.filter((c) => c.jobId === day.jobId && c.date === from).toArray();
  return { blocks, rows, target, targetEmpty, logs, cards, checklists };
}

export async function moveDay(day: BlastDay, toDate: string, opts: { moveChecklists: boolean }): Promise<void> {
  const plan = await movePlan(day, toDate);
  if (plan.blocks.length > 0) throw new Error(plan.blocks[0]);
  const me = getSessionUser();
  const now = nowISO();
  const from = day.date;
  if (plan.target && plan.targetEmpty) await deleteDayCascade(plan.target);
  // the move row first — the server applies it, and it is what lets the
  // date-only changes below pass for papers that are not the mover's
  const move: DayMove = {
    id: generateId(),
    blastDayId: day.id,
    jobId: day.jobId,
    fromDate: from,
    toDate,
    by: me?.id ?? '',
    byName: me?.name ?? '',
    at: now,
    moveChecklists: opts.moveChecklists,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.dayMoves.add(move);
  await db.blastDays.update(day.id, {
    date: toDate,
    movedFrom: { date: from, by: me?.id ?? '', byName: me?.name ?? '', at: now },
    updatedAt: now,
  });
  for (const l of plan.logs) {
    await db.drillLogs.update(l.id, { date: toDate, blastDayId: day.id, updatedAt: now });
    for (const h of await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()) {
      if (h.date === from) await db.drillLogHoles.update(h.id, { date: toDate, updatedAt: now });
    }
  }
  for (const c of plan.cards) await db.timeCards.update(c.id, { date: toDate, blastDayId: day.id, updatedAt: now });
  for (const r of await db.dayReminders.where('blastDayId').equals(day.id).toArray()) {
    if (r.date === from) await db.dayReminders.update(r.id, { date: toDate, updatedAt: now });
  }
  if (opts.moveChecklists) {
    for (const c of plan.checklists) await db.drillChecklists.update(c.id, { date: toDate, updatedAt: now });
  }
  // the people whose cards moved hear about it on their home
  const job = await db.jobs.get(day.jobId);
  for (const c of plan.cards) {
    if (!c.userId || c.userId === me?.id) continue;
    await db.dayReminders.add({
      id: generateId(),
      blastDayId: day.id,
      jobId: day.jobId,
      date: toDate,
      toUserId: c.userId,
      toName: c.personName,
      fromUserId: me?.id ?? '',
      fromName: me?.name ?? '',
      what: 'moved',
      text: `moved ${day.name || job?.name || 'the day'} from ${formatDate(from)} to ${formatDate(toDate)} — your time card went with it`,
      at: now,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  }
}

/** Yesterday / Today / Tomorrow as ISO dates, local calendar */
export function nearbyDates(): { key: 'yesterday' | 'today' | 'tomorrow'; label: string; date: string }[] {
  const d = new Date();
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const y = new Date(d);
  y.setDate(d.getDate() - 1);
  const t = new Date(d);
  t.setDate(d.getDate() + 1);
  return [
    { key: 'yesterday', label: 'Yesterday', date: iso(y) },
    { key: 'today', label: 'Today', date: iso(d) },
    { key: 'tomorrow', label: 'Tomorrow', date: iso(t) },
  ];
}
