// One person's story, anchored to a CrewMember roster entry. Documents link
// to people three ways: hard user ids (drill logs, checklists, submissions),
// roster ids (workforce rows via the new crewMemberId stamp), and free-text
// names (legacy rows, blast logs, incidents) — matched normalized.
import { db } from '@/db';
import { getPowerSync } from '@/db/powersync/client';
import type { CrewMember, WorkForceEntry } from '@/db/schema';

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesPersonName(name: string | undefined, crew: { name: string }): boolean {
  if (!name) return false;
  const n = normalizeName(name);
  return n.length > 0 && n === normalizeName(crew.name);
}

/** Does a daily-report workforce row belong to this roster member? */
export function matchesWorkRow(
  row: { crewMemberId?: string; workerName: string },
  crew: { id: string; name: string },
): boolean {
  if (row.crewMemberId) return row.crewMemberId === crew.id;
  return matchesPersonName(row.workerName, crew);
}

/** Auto-populate seeds a row for EVERY roster member with empty times —
 *  a person only "worked that day" when hours were actually entered. */
export function workedRow(row: Pick<WorkForceEntry, 'timeIn' | 'timeOut' | 'straightTime'>): boolean {
  return Boolean(row.timeIn || row.timeOut || row.straightTime > 0);
}

export interface PersonJob {
  jobId: string;
  jobName: string;
  days: number;
  hours: number;
  lastDate: string;
}

export interface PersonStats {
  daysWorked: number;
  totalHours: number;
  footageDrilled: number;
  drillLogs: number;
  checklists: number;
  blastLogsSigned: number;
  incidents: number;
}

export interface PersonView {
  stats: PersonStats;
  jobs: PersonJob[];
}

export async function buildPersonView(crew: CrewMember): Promise<PersonView> {
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));

  // Days + hours from daily-report workforce rows (worked only)
  const rows = (await db.workForceEntries.toArray()).filter(
    (r) => matchesWorkRow(r, crew) && workedRow(r),
  );
  const byJob = new Map<string, PersonJob>();
  const workedDays = new Set<string>();
  let totalHours = 0;
  for (const row of rows) {
    const report = await db.dailyReports.get(row.dailyReportId);
    if (!report) continue;
    const day = await db.blastDays.get(report.blastDayId);
    if (!day) continue;
    workedDays.add(day.id);
    const hours = row.straightTime + row.overtime;
    totalHours += hours;
    const entry = byJob.get(day.jobId) ?? {
      jobId: day.jobId,
      jobName: jobs.get(day.jobId) ?? '—',
      days: 0,
      hours: 0,
      lastDate: '',
    };
    entry.days += 1;
    entry.hours += hours;
    if (day.date > entry.lastDate) entry.lastDate = day.date;
    byJob.set(day.jobId, entry);
  }

  // Documents they filed — PROJECTED reads: these tables carry signature
  // image blobs, and .toArray() scans were reviving every one of them into
  // memory just to count matches (the Safari-OOM pattern)
  const sql = getPowerSync();
  const identityRows = (table: string, userField: string, nameField: string) =>
    sql.getAll<{ id: string; userId: string | null; name: string | null }>(
      `SELECT id,
              json_extract(payload,'$.${userField}') AS userId,
              json_extract(payload,'$.${nameField}') AS name
       FROM records WHERE table_name = ?`,
      [table],
    );
  const drillLogRows = (await identityRows('drillLogs', 'drillerUserId', 'drillerName')).filter(
    (l) => (crew.userId ? l.userId === crew.userId : matchesPersonName(l.name ?? undefined, crew)),
  );
  let footageDrilled = 0;
  for (const log of drillLogRows) {
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    footageDrilled += holes.reduce((s, h) => s + h.actualDepth, 0);
  }
  const checklists = (await identityRows('drillChecklists', 'drillerUserId', 'drillerName')).filter(
    (c) => (crew.userId ? c.userId === crew.userId : matchesPersonName(c.name ?? undefined, crew)),
  ).length;
  const blastLogsSigned = (await identityRows('blastLogs', 'blasterUserId', 'blasterName')).filter(
    (b) =>
      b.userId && crew.userId
        ? b.userId === crew.userId
        : matchesPersonName(b.name ?? undefined, crew),
  ).length;
  const incidents = (await db.incidents.toArray()).filter((i) =>
    crew.userId && i.reportedByUserId
      ? i.reportedByUserId === crew.userId
      : matchesPersonName(i.reportedByName, crew),
  ).length;

  return {
    stats: {
      daysWorked: workedDays.size,
      totalHours: +totalHours.toFixed(1),
      footageDrilled: Math.round(footageDrilled),
      drillLogs: drillLogRows.length,
      checklists,
      blastLogsSigned,
      incidents,
    },
    jobs: [...byJob.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
  };
}

/** Resolve a display name (and optional user id) to a roster entry id, so
 *  call sites can render names as links only when there's a page behind them */
export async function findCrewId(opts: { userId?: string; name?: string }): Promise<string | null> {
  const roster = await db.crewMembers.toArray();
  if (opts.userId) {
    const byId = roster.find((c) => c.userId === opts.userId);
    if (byId) return byId.id;
  }
  if (opts.name) {
    const byName = roster.find((c) => matchesPersonName(opts.name, c));
    if (byName) return byName.id;
  }
  return null;
}
