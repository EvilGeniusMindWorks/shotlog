// Document-row builder shared by My Records (scope: mine) and the company
// Records "All documents" lens (scope: company). One row per live document —
// blast logs, daily reports, drill logs, rig checklists, incidents — with a
// link to the live page; filed office copies are joined separately.
import { db } from '@/db';
import { matchesPersonName, matchesWorkRow, workedRow } from '@/lib/personHistory';
import { drillLogRoute } from '@/hooks/useDrillPlans';
import type { CrewMember } from '@/db/schema';

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

const DAY_STATUS_VARIANT = { draft: 'draft', submitted: 'submitted', approved: 'approved' } as const;

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
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));

  // Drill logs
  const logs = (await db.drillLogs
    .filter((l) => company || !meId || l.drillerUserId === meId)
    .toArray()
  ).filter((l) =>
    !person
      ? true
      : person.userId
        ? l.drillerUserId === person.userId
        : matchesPersonName(l.drillerName, person),
  );
  for (const log of logs) {
    const day = log.blastDayId ? await db.blastDays.get(log.blastDayId) : undefined;
    const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
    const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).count();
    const context = plan ? plan.name : `Shot ${shot?.shotNumber ?? '?'}`;
    out.push({
      key: `dl-${log.id}`,
      kind: 'drill_log',
      date: log.date ?? day?.date ?? log.createdAt.slice(0, 10),
      title: `${day?.name || jobs.get(log.jobId) || '—'} · ${context}${company ? ` · ${log.drillerName || 'unassigned'}` : ''}`,
      sub: `${holes} holes`,
      status: log.status,
      statusVariant: log.status === 'accepted' ? 'approved' : log.status === 'complete' ? 'submitted' : 'draft',
      to: drillLogRoute(log),
      sourceId: log.id,
      jobId: log.jobId,
    });
  }

  // Rig checklists — mechanics always see the whole fleet's filings
  const seeAllChecklists = company || role === 'mechanic';
  const checklists = (await db.drillChecklists
    .filter((c) => seeAllChecklists || !meId || c.drillerUserId === meId)
    .toArray()
  ).filter((c) =>
    !person
      ? true
      : person.userId
        ? c.drillerUserId === person.userId
        : matchesPersonName(c.drillerName, person),
  );
  for (const c of checklists) {
    const rig = await db.equipment.get(c.equipmentId);
    out.push({
      key: `cl-${c.id}`,
      kind: 'drill_checklist',
      date: c.date,
      title: `Rig checklist — ${rig?.assetNumber ?? c.equipmentId}${seeAllChecklists ? ` · ${c.drillerName}` : ''}`,
      sub: c.outOfService ? 'OUT OF SERVICE' : c.repairsNote ? 'repairs noted' : 'all good',
      status: 'filed',
      statusVariant: 'approved',
      to: `/drill-checklist-print/${c.id}`,
      sourceId: c.id,
      jobId: c.jobId,
    });
  }

  // Incidents (matched by reporter name in 'mine' — incidents predate user ids)
  const incidents = (await db.incidents
    .filter((i) => company || !meName || i.reportedByName === meName)
    .toArray()
  ).filter((i) => !person || matchesPersonName(i.reportedByName, person));
  for (const i of incidents) {
    out.push({
      key: `in-${i.id}`,
      kind: 'incident',
      date: i.date,
      title: `${i.type} incident — ${i.jobId ? jobs.get(i.jobId) ?? '' : ''}`,
      sub: i.description.slice(0, 60),
      status: i.status.replace('_', ' '),
      statusVariant: i.status === 'closed' ? 'approved' : i.status === 'office_review' ? 'submitted' : 'draft',
      to: `/incident/${i.id}`,
      sourceId: i.id,
      jobId: i.jobId,
    });
  }

  // Blast logs + daily reports by day: company scope always; 'mine' scope
  // for blaster-and-up (they file them) — drillers/mechanics skip
  if (company || (role !== 'driller' && role !== 'mechanic')) {
    const days = await db.blastDays.toArray();
    for (const day of days) {
      const label = day.name || jobs.get(day.jobId) || day.date;
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      const report = await db.dailyReports.where('blastDayId').equals(day.id).first();
      // Person filter: blast log by signer; daily report by a worked row
      const blastMatches =
        !person ||
        (log &&
          (log.blasterUserId && person.userId
            ? log.blasterUserId === person.userId
            : matchesPersonName(log.blasterName, person)));
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
          statusVariant: DAY_STATUS_VARIANT[day.status],
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
          statusVariant: DAY_STATUS_VARIANT[day.status],
          to: `/blast-day/${day.id}`,
          sourceId: report?.id ?? day.id,
          jobId: day.jobId,
        });
      }
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}
