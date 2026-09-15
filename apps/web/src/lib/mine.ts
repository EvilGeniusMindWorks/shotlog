// "Unasked, you see only what you authored; everything else you go and get."
// (Matthew's invite test, 2026-09-07 — supersedes "blaster sees everything"
// as the home's default view.) ONE definition of *mine*, used by every
// field-home band and the Days list so the rule cannot drift.
//
//  · a work day is mine when I authored it (authorUserId, stamped since
//    S7d — taking over the blast log re-stamps), I hold a time card on
//    it (I worked that day, whoever runs the report), I drilled on it, or
//    I filed a rig checklist at that job that day (S17)
//  · drilling waits on me when I laid the plan (createdBy) or, with no
//    plan, the log sits on a shot of a day that is mine
//  · office, admin and the shop see everything — that is their job
//
// Availability never narrows: the company's records still sync to every
// device. Only attention does. Days from before the author stamp have no
// owner and live under Everyone only.
import { db } from '@/db';
import type { BlastDay, DrillLog, DrillPlanRecord } from '@/db/schema';
import { myHomeDashboard } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';

/** Does this person's home show only their own work? (field + driller) */
export function homeIsMineFirst(): boolean {
  const b = myHomeDashboard();
  return b === 'field' || b === 'driller';
}

/** The ids of every day that is mine: authored, or carrying my time card */
export async function myDayIds(): Promise<Set<string>> {
  const me = getSessionUser();
  const out = new Set<string>();
  if (!me) return out;
  const days = await db.blastDays.toArray();
  const byJobDate = new Map<string, string[]>();
  for (const d of days) {
    if (d.authorUserId === me.id) out.add(d.id);
    const k = `${d.jobId}|${d.date}`;
    byJobDate.set(k, [...(byJobDate.get(k) ?? []), d.id]);
  }
  // Cards are keyed by job + date (S7d); a card with blastDayId is exact,
  // otherwise every day of that job on that date counts as worked
  const cards = await db.timeCards.filter((c) => c.userId === me.id).toArray();
  for (const c of cards) {
    if (c.blastDayId) out.add(c.blastDayId);
    else for (const id of byJobDate.get(`${c.jobId}|${c.date}`) ?? []) out.add(id);
  }
  // S17 (Matthew's feedback: "I don't see Route 3 in my work days"): the
  // days I drilled on, and the days I filed a rig checklist at that job
  const logs = await db.drillLogs.filter((l) => l.drillerUserId === me.id).toArray();
  for (const l of logs) {
    if (l.blastDayId) out.add(l.blastDayId);
    else for (const id of byJobDate.get(`${l.jobId}|${l.date ?? l.createdAt.slice(0, 10)}`) ?? []) out.add(id);
  }
  const checklists = await db.drillChecklists.filter((c) => c.drillerUserId === me.id && Boolean(c.jobId)).toArray();
  for (const c of checklists) for (const id of byJobDate.get(`${c.jobId}|${c.date}`) ?? []) out.add(id);
  return out;
}

export function isMyPlan(plan: Pick<DrillPlanRecord, 'createdBy'>): boolean {
  const me = getSessionUser();
  return Boolean(me && plan.createdBy === me.id);
}

/** A finished (or open) drill log that a BLASTER should be looking at */
export async function logWaitsOnMe(
  log: Pick<DrillLog, 'drillPlanId' | 'shotId' | 'blastDayId'>,
  mine?: Set<string>,
): Promise<boolean> {
  if (log.drillPlanId) {
    const plan = await db.drillPlans.get(log.drillPlanId);
    return plan ? isMyPlan(plan) : false;
  }
  const ids = mine ?? (await myDayIds());
  if (log.blastDayId) return ids.has(log.blastDayId);
  if (log.shotId) {
    const shot = await db.shots.get(log.shotId);
    const blastLog = shot ? await db.blastLogs.get(shot.blastLogId) : undefined;
    return Boolean(blastLog && ids.has(blastLog.blastDayId));
  }
  return false;
}

export type DaysScope = 'mine' | 'all';
const SCOPE_KEY = 'shotlog-days-scope';

/** The Days list's remembered scope on this device (field homes only) */
export function getDaysScope(): DaysScope {
  if (!homeIsMineFirst()) return 'all';
  try {
    return localStorage.getItem(SCOPE_KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
}

export function setDaysScope(v: DaysScope): void {
  try {
    localStorage.setItem(SCOPE_KEY, v);
  } catch {
    /* private mode */
  }
}

/** Filter helper for lists of days */
export function onlyMine<T extends { day: Pick<BlastDay, 'id'> }>(rows: T[], ids: Set<string>): T[] {
  return rows.filter((r) => ids.has(r.day.id));
}
