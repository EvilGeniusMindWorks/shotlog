// Document-row builder shared by My Records (scope: mine) and the company
// Records "All documents" lens (scope: company). One row per live document —
// blast logs, daily reports, drill logs, rig checklists, incidents — with a
// link to the live page; filed office copies are joined separately.
//
// PERF: this sweeps five whole tables, three of which carry inline images
// (signatures, shot diagrams). Everything reads through blob-free SQL
// projections (db/projections) — reviving those blobs on every records
// visit was a Safari tab-eviction pattern.
import { db } from '@/db';
import { holeCountsByLog, projectTable } from '@/db/projections';
import { matchesPersonName, matchesWorkRow, workedRow } from '@/lib/personHistory';
import { drillLogRoute } from '@/hooks/useDrillPlans';
import type { CrewMember, DrillLog } from '@/db/schema';

export type DocKind = 'blast_log' | 'daily_report' | 'drill_log' | 'drill_checklist' | 'incident';

export interface DocRow {
  key: string;
  kind: DocKind;
  date: string;
  title: string;
  sub: string;
  status: string;
  statusVariant: 'draft' | 'submitted' | 'approved';
  to: string;
  /** id used to look up filed office copies (submissions.sourceId) */
  sourceId: string;
  jobId?: string;
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  blast_log: 'Blast Log',
  daily_report: 'Daily Report',
  drill_log: 'Drill Log',
  drill_checklist: 'Checklist',
  incident: 'Incident',
};

const DAY_STATUS_VARIANT: Record<string, 'draft' | 'submitted' | 'approved'> = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
};

export async function buildDocRows(opts: {
  scope: 'mine' | 'company';
  meId?: string;
  meName?: string;
  role: string;
  /** Restrict every doc type to this roster member (person-hub view) */
  person?: CrewMember;
}): Promise<DocRow[]> {
  const { scope, meId, meName, role, person } = opts;
  const company = scope === 'company';
  const out: DocRow[] = [];

  const jobs = new Map(
    (await projectTable<{ name: string | null }>('jobs', { name: 'name' })).map((j) => [
      j.id,
      j.name ?? '',
    ]),
  );
  const days = await projectTable<{
    name: string | null;
    date: string;
    jobId: string;
    status: string;
  }>('blastDays', { name: 'name', date: 'date', jobId: 'jobId', status: 'status' });
  const dayById = new Map(days.map((d) => [d.id, d]));

  // Drill logs — projected (signature blobs stay in the store)
  const allLogs = await projectTable<{
    drillerUserId: string | null;
    drillerName: string | null;
    blastDayId: string | null;
    shotId: string | null;
    drillPlanId: string | null;
    jobId: string;
    logDate: string | null;
    createdAt: string;
    status: string;
  }>('drillLogs', {
    drillerUserId: 'drillerUserId',
    drillerName: 'drillerName',
    blastDayId: 'blastDayId',
    shotId: 'shotId',
    drillPlanId: 'drillPlanId',
    jobId: 'jobId',
    logDate: 'date',
    createdAt: 'createdAt',
    status: 'status',
  });
  const shotNumbers = new Map(
    (await projectTable<{ n: number | null }>('shots', { n: 'shotNumber' })).map((s) => [s.id, s.n]),
  );
  const planNames = new Map(
    (await projectTable<{ name: string | null }>('drillPlans', { name: 'name' })).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const holeCounts = await holeCountsByLog();

  const logs = allLogs
    .filter((l) => company || !meId || l.drillerUserId === meId)
    .filter((l) =>
      !person
        ? true
        : person.userId
          ? l.drillerUserId === person.userId
          : matchesPersonName(l.drillerName ?? '', person),
    );
  for (const log of logs) {
    const day = log.blastDayId ? dayById.get(log.blastDayId) : undefined;
    const context = log.drillPlanId
      ? (planNames.get(log.drillPlanId) ?? 'Plan')
      : `Shot ${log.shotId ? (shotNumbers.get(log.shotId) ?? '?') : '?'}`;
    const date = log.logDate ?? day?.date ?? log.createdAt.slice(0, 10);
    out.push({
      key: `dl-${log.id}`,
      kind: 'drill_log',
      date,
      title: `${day?.name || jobs.get(log.jobId) || '—'} · ${context}${company ? ` · ${log.drillerName || 'unassigned'}` : ''}`,
      sub: `${holeCounts.get(log.id) ?? 0} holes`,
      status: log.status,
      statusVariant:
        log.status === 'accepted' ? 'approved' : log.status === 'complete' ? 'submitted' : 'draft',
      to: drillLogRoute(log as unknown as DrillLog),
      sourceId: log.id,
      jobId: log.jobId,
    });
  }

  // Rig checklists — mechanics always see the whole fleet's filings
  const assetNumbers = new Map(
    (await projectTable<{ assetNumber: string | null }>('equipment', { assetNumber: 'assetNumber' })).map(
      (e) => [e.id, e.assetNumber],
    ),
  );
  const seeAllChecklists = company || role === 'mechanic';
  const checklists = (
    await projectTable<{
      equipmentId: string;
      jobId: string | null;
      date: string;
      drillerUserId: string | null;
      drillerName: string | null;
      outOfService: number | null;
      repairsNote: string | null;
    }>('drillChecklists', {
      equipmentId: 'equipmentId',
      jobId: 'jobId',
      date: 'date',
      drillerUserId: 'drillerUserId',
      drillerName: 'drillerName',
      outOfService: 'outOfService',
      repairsNote: 'repairsNote',
    })
  )
    .filter((c) => seeAllChecklists || !meId || c.drillerUserId === meId)
    .filter((c) =>
      !person
        ? true
        : person.userId
          ? c.drillerUserId === person.userId
          : matchesPersonName(c.drillerName ?? '', person),
    );
  for (const c of checklists) {
    out.push({
      key: `cl-${c.id}`,
      kind: 'drill_checklist',
      date: c.date,
      title: `Rig checklist — ${assetNumbers.get(c.equipmentId) ?? c.equipmentId}${seeAllChecklists ? ` · ${c.drillerName ?? ''}` : ''}`,
      sub: c.outOfService ? 'OUT OF SERVICE' : c.repairsNote ? 'repairs noted' : 'all good',
      status: 'filed',
      statusVariant: 'approved',
      to: `/drill-checklist-print/${c.id}`,
      sourceId: c.id,
      jobId: c.jobId ?? undefined,
    });
  }

  // Incidents (matched by reporter name in 'mine' — incidents predate user ids)
  const incidents = (
    await projectTable<{
      type: string;
      status: string;
      date: string;
      description: string | null;
      jobId: string | null;
      reportedByUserId: string | null;
      reportedByName: string | null;
    }>('incidents', {
      type: 'type',
      status: 'status',
      date: 'date',
      description: 'description',
      jobId: 'jobId',
      reportedByUserId: 'reportedByUserId',
      reportedByName: 'reportedByName',
    })
  )
    .filter((i) =>
      company ||
      (meId && i.reportedByUserId
        ? i.reportedByUserId === meId
        : !meName || matchesPersonName(i.reportedByName ?? '', { name: meName })),
    )
    .filter((i) =>
      !person
        ? true
        : person.userId && i.reportedByUserId
          ? i.reportedByUserId === person.userId
          : matchesPersonName(i.reportedByName ?? '', person),
    );
  for (const i of incidents) {
    out.push({
      key: `in-${i.id}`,
      kind: 'incident',
      date: i.date,
      title: `${i.type} incident — ${i.jobId ? (jobs.get(i.jobId) ?? '') : ''}`,
      sub: (i.description ?? '').slice(0, 60),
      status: i.status.replace('_', ' '),
      statusVariant:
        i.status === 'closed' ? 'approved' : i.status === 'office_review' ? 'submitted' : 'draft',
      to: `/incident/${i.id}`,
      sourceId: i.id,
      jobId: i.jobId ?? undefined,
    });
  }

  // Blast logs + daily reports by day: company scope always; 'mine' scope
  // for blaster-and-up (they file them) — drillers/mechanics skip
  if (company || (role !== 'driller' && role !== 'mechanic')) {
    const blastLogs = await projectTable<{
      blastDayId: string;
      blasterUserId: string | null;
      blasterName: string | null;
    }>('blastLogs', {
      blastDayId: 'blastDayId',
      blasterUserId: 'blasterUserId',
      blasterName: 'blasterName',
    });
    const logByDay = new Map(blastLogs.map((l) => [l.blastDayId, l]));
    const reports = await projectTable<{ blastDayId: string }>('dailyReports', {
      blastDayId: 'blastDayId',
    });
    const reportByDay = new Map(reports.map((r) => [r.blastDayId, r]));

    for (const day of days) {
      const label = day.name || jobs.get(day.jobId) || day.date;
      const log = logByDay.get(day.id);
      const report = reportByDay.get(day.id);
      // Person filter: blast log by signer; daily report by a worked row
      const blastMatches =
        !person ||
        (log &&
          (log.blasterUserId && person.userId
            ? log.blasterUserId === person.userId
            : matchesPersonName(log.blasterName ?? '', person)));
      let reportMatches = !person;
      if (person && report) {
        const crewRows = await db.workForceEntries
          .where('dailyReportId')
          .equals(report.id)
          .toArray();
        reportMatches = crewRows.some((r) => matchesWorkRow(r, person) && workedRow(r));
      }
      if (log && blastMatches) {
        out.push({
          key: `bl-${log.id}`,
          kind: 'blast_log',
          date: day.date,
          title: `Blast Log — ${label}`,
          sub: jobs.get(day.jobId) ?? '',
          status: day.status,
          statusVariant: DAY_STATUS_VARIANT[day.status] ?? 'draft',
          to: `/blast-day/${day.id}`,
          sourceId: log.id,
          jobId: day.jobId,
        });
      }
      if (reportMatches) {
        out.push({
          key: `dr-${day.id}`,
          kind: 'daily_report',
          date: day.date,
          title: `Daily Report — ${label}`,
          sub: jobs.get(day.jobId) ?? '',
          status: day.status,
          statusVariant: DAY_STATUS_VARIANT[day.status] ?? 'draft',
          to: `/blast-day/${day.id}`,
          sourceId: report?.id ?? day.id,
          jobId: day.jobId,
        });
      }
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}
