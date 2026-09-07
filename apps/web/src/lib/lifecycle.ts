// Record lifecycle actions (docs/deletion-pattern.md): Archive is the
// everyday verb — logical, reversible, nothing destroyed. Delete is the
// created-in-error verb — draft/never-used only. The SERVER enforces both
// at the sync choke point; these helpers just do the writes and compute
// the consequence facts the sheets show.
import { LIFECYCLE_CHILDREN } from '@shotlog/shared';
import { db, deleteWithTombstone } from '@/db';
import type { Archivable, BlastDay } from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';

export interface ChildCount {
  table: string;
  count: number;
}

/** How many child records point at this one — drives the consequence
 *  sheet and whether Delete is offered (never-used rule). */
export async function countLifecycleChildren(table: string, id: string): Promise<ChildCount[]> {
  const children = LIFECYCLE_CHILDREN[table] ?? [];
  const out: ChildCount[] = [];
  for (const child of children) {
    const count = await db
      .table(child.table)
      .where(child.field)
      .equals(id)
      .count();
    out.push({ table: child.table, count });
  }
  return out;
}

export function everUsed(counts: ChildCount[]): boolean {
  return counts.some((c) => c.count > 0);
}

type LifecycleRecord = { id: string } & Archivable;

/** Archive: leaves default lists/pickers, restorable anytime. Mirrors
 *  isActive=false for legacy readers where the record carries it. */
export async function archiveRecord(table: string, record: LifecycleRecord): Promise<void> {
  const user = getSessionUser();
  const changes: Record<string, unknown> = {
    archivedAt: nowISO(),
    archivedBy: user?.id ?? '',
    archivedByName: user?.name ?? '',
    updatedAt: nowISO(),
  };
  if ('isActive' in record) changes.isActive = false;
  await db.table(table).update(record.id, changes);
}

export async function restoreRecord(table: string, record: LifecycleRecord): Promise<void> {
  const changes: Record<string, unknown> = {
    archivedAt: undefined,
    archivedBy: undefined,
    archivedByName: undefined,
    updatedAt: nowISO(),
  };
  if ('isActive' in record) changes.isActive = true;
  await db.table(table).update(record.id, changes);
}

/** Plain delete for never-used records (server re-checks the never-used
 *  rule — a stale device can't delete something another device used). */
export async function deleteRecordPlain(table: string, id: string): Promise<void> {
  await deleteWithTombstone(table, id);
}

/** "This day never happened": cascades the day's own records. Draft time
 *  cards for the day go with it; filed/approved cards are the PERSON's
 *  record — they detach and survive. Server allows only draft days. */
export async function deleteDayCascade(day: BlastDay): Promise<void> {
  const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
  if (log) {
    for (const shot of await db.shots.where('blastLogId').equals(log.id).toArray()) {
      for (const r of await db.seismoReadings.where('shotId').equals(shot.id).toArray())
        await deleteWithTombstone('seismoReadings', r.id);
      for (const c of await db.typicalColumns.where('shotId').equals(shot.id).toArray())
        await deleteWithTombstone('typicalColumns', c.id);
      await deleteWithTombstone('shots', shot.id);
    }
    for (const u of await db.explosiveUsages.where('blastLogId').equals(log.id).toArray())
      await deleteWithTombstone('explosiveUsages', u.id);
    await deleteWithTombstone('blastLogs', log.id);
  }
  const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
  if (report) {
    for (const table of [
      'workForceEntries',
      'equipmentEntries',
      'materialEntries',
      'subcontractorEntries',
    ] as const) {
      for (const e of await db.table(table).where('dailyReportId').equals(report.id).toArray())
        await deleteWithTombstone(table, e.id);
    }
    await deleteWithTombstone('dailyReports', report.id);
  }
  for (const dl of await db.drillLogs.where('blastDayId').equals(day.id).toArray()) {
    for (const h of await db.drillLogHoles.where('drillLogId').equals(dl.id).toArray())
      await deleteWithTombstone('drillLogHoles', h.id);
    await deleteWithTombstone('drillLogs', dl.id);
  }
  for (const card of await db.timeCards.where('blastDayId').equals(day.id).toArray()) {
    if (card.status === 'draft') await deleteWithTombstone('timeCards', card.id);
    else await db.timeCards.update(card.id, { blastDayId: undefined, updatedAt: nowISO() });
  }
  for (const a of await db.attachments.filter((x) => x.parentId === day.id).toArray())
    await deleteWithTombstone('attachments', a.id);
  await deleteWithTombstone('blastDays', day.id);
}

/**
 * S7d: two copies of the same job + date (both devices offline) → fold
 * `other` into `keep`. Logs, checklists, cards, attachments and the daily
 * report's line items move over; a blast log moves if `keep` has none,
 * otherwise its shots are appended to keep's log. Nothing filed is lost —
 * the other day is then deleted (tombstoned, audited server-side).
 */
export async function mergeDays(keep: BlastDay, other: BlastDay): Promise<void> {
  const now = nowISO();
  const keepLog = await db.blastLogs.where('blastDayId').equals(keep.id).first();
  const otherLog = await db.blastLogs.where('blastDayId').equals(other.id).first();
  if (otherLog) {
    if (!keepLog) {
      await db.blastLogs.update(otherLog.id, { blastDayId: keep.id, updatedAt: now });
      if (!isBlastingWork(keep.typeOfWork))
        await db.blastDays.update(keep.id, { typeOfWork: other.typeOfWork, updatedAt: now });
    } else {
      const keepShots = await db.shots.where('blastLogId').equals(keepLog.id).toArray();
      let n = keepShots.reduce((m, s) => Math.max(m, s.shotNumber), 0);
      for (const s of (await db.shots.where('blastLogId').equals(otherLog.id).toArray()).sort((a, b) => a.shotNumber - b.shotNumber)) {
        await db.shots.update(s.id, { blastLogId: keepLog.id, shotNumber: ++n, updatedAt: now });
      }
      for (const u of await db.explosiveUsages.where('blastLogId').equals(otherLog.id).toArray())
        await deleteWithTombstone('explosiveUsages', u.id);
      await deleteWithTombstone('blastLogs', otherLog.id);
    }
  }
  const keepReport = await db.dailyReports.where('blastDayId').equals(keep.id).first();
  const otherReport = await db.dailyReports.where('blastDayId').equals(other.id).first();
  if (otherReport) {
    if (keepReport) {
      for (const table of ['workForceEntries', 'equipmentEntries', 'materialEntries', 'subcontractorEntries'] as const) {
        for (const e of await db.table(table).where('dailyReportId').equals(otherReport.id).toArray())
          await db.table(table).update(e.id, { dailyReportId: keepReport.id, updatedAt: now });
      }
      if (otherReport.notes && !keepReport.notes)
        await db.dailyReports.update(keepReport.id, { notes: otherReport.notes, updatedAt: now });
      await deleteWithTombstone('dailyReports', otherReport.id);
    } else {
      await db.dailyReports.update(otherReport.id, { blastDayId: keep.id, updatedAt: now });
    }
  }
  for (const dl of await db.drillLogs.where('blastDayId').equals(other.id).toArray())
    await db.drillLogs.update(dl.id, { blastDayId: keep.id, updatedAt: now });
  for (const card of await db.timeCards.where('blastDayId').equals(other.id).toArray())
    await db.timeCards.update(card.id, { blastDayId: keep.id, updatedAt: now });
  for (const a of await db.attachments.filter((x) => x.parentId === other.id).toArray())
    await db.attachments.update(a.id, { parentId: keep.id, updatedAt: now });
  for (const i of await db.incidents.filter((x) => x.blastDayId === other.id).toArray())
    await db.incidents.update(i.id, { blastDayId: keep.id, updatedAt: now });
  if (!keep.name && other.name) await db.blastDays.update(keep.id, { name: other.name, updatedAt: now });
  await deleteWithTombstone('blastDays', other.id);
}

const CHILD_LABELS: Record<string, [string, string]> = {
  sites: ['site', 'sites'],
  jobs: ['job', 'jobs'],
  blastDays: ['work day', 'work days'],
  drillPlans: ['drill plan', 'drill plans'],
  drillLogs: ['drill log', 'drill logs'],
  drillChecklists: ['checklist', 'checklists'],
  submissions: ['filed document', 'filed documents'],
  incidents: ['incident', 'incidents'],
  timeCards: ['time card', 'time cards'],
  repairTickets: ['repair ticket', 'repair tickets'],
  equipmentEntries: ['usage entry', 'usage entries'],
  hourCorrections: ['hour correction', 'hour corrections'],
  workForceEntries: ['labor entry', 'labor entries'],
};

/** "Its 29 work days and 14 filed documents are untouched." */
export function describeChildren(counts: ChildCount[]): string {
  const parts = counts
    .filter((c) => c.count > 0)
    .map((c) => {
      const [one, many] = CHILD_LABELS[c.table] ?? [c.table, c.table];
      return `${c.count} ${c.count === 1 ? one : many}`;
    });
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
