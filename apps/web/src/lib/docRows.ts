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
import { holeStatsByLog, projectTable } from '@/db/projections';
import { INCIDENT_LABEL } from '@/lib/incidentDoNow';
import type { IncidentType } from '@/db/schema';
import { matchesPersonName, matchesWorkRow, workedRow } from '@/lib/personHistory';
import { drillLogRoute } from '@/hooks/useDrillPlans';
import type { CrewMember, DrillLog } from '@/db/schema';

export type DocKind =
  | 'blast_log'
  | 'daily_report'
  | 'drill_log'
  | 'drill_checklist'
  | 'incident'
  // S7b: the rest of the paper — so each home bucket's default set is
  // complete without a role mapping (time cards for drillers; tickets,
  // services and hour corrections for the shop)
  | 'time_card'
  | 'repair_ticket'
  | 'service'
  | 'hour_correction';

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
  /** Records manager facets (Round S4): who, and the hierarchy scope */
  person?: string;
  customerId?: string;
  siteId?: string;
  /** Draft day carrying an office send-back note (awaiting resubmit) */
  sentBack?: boolean;
  /** S21 (Matthew: "columns say too little"): the short head after the kind
   *  on the row's first line ("Shot 1", "R1021"), the grey particulars on
   *  the second, and the facts behind the optional columns */
  head?: string;
  particulars?: string;
  facts?: DocFacts;
  customerName?: string;
  dayId?: string;
}

export interface DocFacts {
  shots?: number;
  shotRange?: string;
  lbs?: number;
  holes?: number;
  footage?: number;
  rig?: string;
  rigs?: string[];
  startHours?: number | null;
  stopHours?: number | null;
  hours?: number;
  inOut?: string;
  crew?: number;
  /** live attachments hanging on the paper (a filed copy carries its own count) */
  clips?: number;
  approvedBy?: string;
  approvedAt?: string;
  outOfService?: boolean;
}

const fmtN = (n: number, digits = 0) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtMeter = (n: number | null | undefined) => (n == null ? undefined : fmtN(Number(n), 1));
/** "07:00" → "7:00 am" */
const fmt12 = (hhmm: string | null | undefined): string | undefined => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return undefined;
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
};
const shotRangeOf = (nums: number[]): string | undefined => {
  const s = [...new Set(nums.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  if (s.length === 0) return undefined;
  if (s.length === 1) return `Shot ${s[0]}`;
  const contiguous = s.every((n, i) => i === 0 || n === s[i - 1] + 1);
  return contiguous ? `Shots ${s[0]}–${s[s.length - 1]}` : `Shots ${s.join(', ')}`;
};

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  blast_log: 'Blasting Log',
  daily_report: 'Daily Report',
  drill_log: 'Drill Log',
  drill_checklist: 'Rig Checklist',
  incident: 'Incident',
  time_card: 'Time Card',
  repair_ticket: 'Repair Ticket',
  service: 'Service',
  hour_correction: 'Hour Correction',
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

  const jobRows = await projectTable<{
    name: string | null;
    customerId: string | null;
    siteId: string | null;
  }>('jobs', { name: 'name', customerId: 'customerId', siteId: 'siteId' });
  const jobs = new Map(jobRows.map((j) => [j.id, j.name ?? '']));
  const scopeOf = (jobId: string | null | undefined) => {
    const j = jobId ? jobRows.find((x) => x.id === jobId) : undefined;
    return { customerId: j?.customerId ?? undefined, siteId: j?.siteId ?? undefined };
  };
  const days = await projectTable<{
    name: string | null;
    date: string;
    jobId: string;
    status: string;
    sendBackNote: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
  }>('blastDays', { name: 'name', date: 'date', jobId: 'jobId', status: 'status', sendBackNote: 'sendBackNote', approvedByName: 'approvedByName', approvedAt: 'approvedAt' });
  const dayById = new Map(days.map((d) => [d.id, d]));

  // ── S21: the particulars, from blob-free projections — one query per table, never per row ──
  const customerNames = new Map(
    (await projectTable<{ name: string | null }>('customers', { name: 'name' })).map((c) => [c.id, c.name ?? '']),
  );
  const customerOf = (jobId: string | null | undefined): string | undefined => {
    const j = jobId ? jobRows.find((x) => x.id === jobId) : undefined;
    return j?.customerId ? customerNames.get(j.customerId) : undefined;
  };
  const shotRows = await projectTable<{ blastLogId: string; shotNumber: number | null; numHoles: number | null }>('shots', {
    blastLogId: 'blastLogId',
    shotNumber: 'shotNumber',
    numHoles: 'totals.numHoles',
  });
  const shotsByLog = new Map<string, typeof shotRows>();
  for (const s of shotRows) shotsByLog.set(s.blastLogId, [...(shotsByLog.get(s.blastLogId) ?? []), s]);
  const usageRows = await projectTable<{ blastLogId: string; totalPoundsShot: number | null; products: string | null }>('explosiveUsages', {
    blastLogId: 'blastLogId',
    totalPoundsShot: 'totalPoundsShot',
    products: 'products',
  });
  const lbsByLog = new Map<string, number>();
  for (const u of usageRows) {
    let lbs = Number(u.totalPoundsShot ?? 0);
    if (!lbs && u.products) {
      try {
        lbs = (JSON.parse(u.products) as { totalWeight?: number }[]).reduce((a, p) => a + (Number(p.totalWeight) || 0), 0);
      } catch {
        /* keep 0 */
      }
    }
    lbsByLog.set(u.blastLogId, lbs);
  }
  const attRows = await projectTable<{ parentId: string }>('attachments', { parentId: 'parentId' });
  const clipsByParent = new Map<string, number>();
  for (const a of attRows) clipsByParent.set(a.parentId, (clipsByParent.get(a.parentId) ?? 0) + 1);
  const readingRows = await projectTable<{ shotId: string }>('seismoReadings', { shotId: 'shotId' });
  const readingsByShot = new Map<string, string[]>();
  for (const r of readingRows) readingsByShot.set(r.shotId, [...(readingsByShot.get(r.shotId) ?? []), r.id]);
  const clipsUnder = (ids: string[]) => ids.reduce((n, id) => n + (clipsByParent.get(id) ?? 0), 0);
  const wfRows = await projectTable<{ dailyReportId: string; timeIn: string | null; timeOut: string | null; straightTime: number | null }>('workForceEntries', {
    dailyReportId: 'dailyReportId',
    timeIn: 'timeIn',
    timeOut: 'timeOut',
    straightTime: 'straightTime',
  });
  const crewByReport = new Map<string, number>();
  for (const w of wfRows) if (w.timeIn || w.timeOut || Number(w.straightTime ?? 0) > 0) crewByReport.set(w.dailyReportId, (crewByReport.get(w.dailyReportId) ?? 0) + 1);

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
    rigId: string | null;
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
    rigId: 'drillRigEquipmentId',
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
  const holeStats = await holeStatsByLog();
  const holeCounts = new Map([...holeStats].map(([k, v]) => [k, v.n]));
  // Rig checklists — projected once here, used by the drill logs (the rig), the checklists
  // themselves and the daily report's "2 rigs"
  const assetNumbersEarly = new Map(
    (await projectTable<{ assetNumber: string | null }>('equipment', { assetNumber: 'assetNumber' })).map((e) => [e.id, e.assetNumber]),
  );

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
    const hs = holeStats.get(log.id);
    const rig = log.rigId ? (assetNumbersEarly.get(log.rigId) ?? undefined) : undefined;
    out.push({
      key: `dl-${log.id}`,
      kind: 'drill_log',
      date,
      title: `${day?.name || jobs.get(log.jobId) || '—'} · ${context}${company ? ` · ${log.drillerName || 'unassigned'}` : ''}`,
      sub: `${holeCounts.get(log.id) ?? 0} holes`,
      head: context,
      particulars: [`${hs?.n ?? 0} holes`, hs?.ft ? `${fmtN(Math.round(hs.ft))}′` : null, rig ?? null].filter(Boolean).join(' · '),
      facts: { holes: hs?.n ?? 0, footage: hs?.ft, rig, clips: clipsUnder([log.id]) },
      customerName: customerOf(log.jobId),
      dayId: log.blastDayId ?? undefined,
      status: log.status,
      statusVariant:
        log.status === 'accepted' ? 'approved' : log.status === 'complete' ? 'submitted' : 'draft',
      to: drillLogRoute(log as unknown as DrillLog),
      sourceId: log.id,
      jobId: log.jobId,
      person: log.drillerName ?? undefined,
      ...scopeOf(log.jobId),
    });
  }

  // Rig checklists — mechanics always see the whole fleet's filings
  const assetNumbers = new Map(
    (await projectTable<{ assetNumber: string | null }>('equipment', { assetNumber: 'assetNumber' })).map(
      (e) => [e.id, e.assetNumber],
    ),
  );
  const seeAllChecklists = company || role === 'mechanic';
  const checklistsAll = (
    await projectTable<{
      equipmentId: string;
      jobId: string | null;
      date: string;
      drillerUserId: string | null;
      drillerName: string | null;
      outOfService: number | null;
      repairsNote: string | null;
      startingHours: number | null;
      stopHours: number | null;
    }>('drillChecklists', {
      equipmentId: 'equipmentId',
      jobId: 'jobId',
      date: 'date',
      drillerUserId: 'drillerUserId',
      drillerName: 'drillerName',
      outOfService: 'outOfService',
      repairsNote: 'repairsNote',
      startingHours: 'startingHours',
      stopHours: 'stopHours',
    })
  );
  // the rigs on a job-day (for the daily report's "2 rigs")
  const rigsByJobDay = new Map<string, string[]>();
  for (const c of checklistsAll) {
    if (!c.jobId) continue;
    const k = `${c.jobId}|${c.date}`;
    const asset = assetNumbers.get(c.equipmentId) ?? c.equipmentId;
    if (!(rigsByJobDay.get(k) ?? []).includes(asset)) rigsByJobDay.set(k, [...(rigsByJobDay.get(k) ?? []), asset]);
  }
  const checklists = checklistsAll
    .filter((c) => seeAllChecklists || !meId || c.drillerUserId === meId)
    .filter((c) =>
      !person
        ? true
        : person.userId
          ? c.drillerUserId === person.userId
          : matchesPersonName(c.drillerName ?? '', person),
    );
  for (const c of checklists) {
    const asset = assetNumbers.get(c.equipmentId) ?? c.equipmentId;
    const start = c.startingHours == null ? null : Number(c.startingHours);
    const stop = c.stopHours == null ? null : Number(c.stopHours);
    const used = start != null && stop != null && stop >= start ? stop - start : undefined;
    out.push({
      key: `cl-${c.id}`,
      kind: 'drill_checklist',
      date: c.date,
      title: `Rig checklist — ${asset}${seeAllChecklists ? ` · ${c.drillerName ?? ''}` : ''}`,
      sub: c.outOfService ? 'OUT OF SERVICE' : c.repairsNote ? 'repairs noted' : 'all good',
      head: asset,
      particulars: [
        start != null ? `${fmtMeter(start)} → ${stop != null ? fmtMeter(stop) : 'stop hours missing'}` : 'no hours yet',
        used != null ? `${fmtN(used, 1)} h` : null,
        c.outOfService ? 'OUT OF SERVICE' : c.repairsNote ? 'repairs noted' : null,
      ].filter(Boolean).join(' · '),
      facts: { rig: asset, startHours: start, stopHours: stop, hours: used, outOfService: Boolean(c.outOfService) },
      customerName: customerOf(c.jobId),
      status: 'filed',
      statusVariant: 'approved',
      to: `/drill-checklist-print/${c.id}`,
      sourceId: c.id,
      jobId: c.jobId ?? undefined,
      person: c.drillerName ?? undefined,
      ...scopeOf(c.jobId),
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
    const kindName = INCIDENT_LABEL[i.type as IncidentType] ?? i.type;
    out.push({
      key: `in-${i.id}`,
      kind: 'incident',
      date: i.date,
      title: `${i.type} incident — ${i.jobId ? (jobs.get(i.jobId) ?? '') : ''}`,
      sub: (i.description ?? '').slice(0, 60),
      head: kindName,
      particulars: (i.description ?? '').slice(0, 80) || 'no description yet',
      facts: { clips: clipsUnder([i.id]) },
      customerName: customerOf(i.jobId),
      status: i.status.replace('_', ' '),
      statusVariant:
        i.status === 'closed' ? 'approved' : i.status === 'office_review' ? 'submitted' : 'draft',
      to: `/incident/${i.id}`,
      sourceId: i.id,
      jobId: i.jobId ?? undefined,
      person: i.reportedByName ?? undefined,
      ...scopeOf(i.jobId),
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
      const shotsOnLog = log ? (shotsByLog.get(log.id) ?? []) : [];
      const holesOnLog = shotsOnLog.reduce((a, s) => a + Number(s.numHoles ?? 0), 0);
      const lbsOnLog = log ? (lbsByLog.get(log.id) ?? 0) : 0;
      const dayFacts = { approvedBy: day.approvedByName ?? undefined, approvedAt: day.approvedAt ?? undefined };
      if (log && blastMatches) {
        const shotRange = shotRangeOf(shotsOnLog.map((s) => Number(s.shotNumber)));
        out.push({
          key: `bl-${log.id}`,
          kind: 'blast_log',
          date: day.date,
          title: `Blast Log — ${label}`,
          sub: jobs.get(day.jobId) ?? '',
          particulars: shotsOnLog.length === 0 ? 'no shots yet' : [shotRange, lbsOnLog ? `${fmtN(lbsOnLog, 1)} lbs` : null, holesOnLog ? `${fmtN(holesOnLog)} holes` : null].filter(Boolean).join(' · '),
          facts: {
            ...dayFacts,
            shots: shotsOnLog.length,
            shotRange,
            lbs: lbsOnLog || undefined,
            holes: holesOnLog || undefined,
            rigs: rigsByJobDay.get(`${day.jobId}|${day.date}`),
            clips: clipsUnder([log.id, ...shotsOnLog.map((s) => s.id), ...shotsOnLog.flatMap((s) => readingsByShot.get(s.id) ?? [])]),
          },
          customerName: customerOf(day.jobId),
          dayId: day.id,
          status: day.status,
          statusVariant: DAY_STATUS_VARIANT[day.status] ?? 'draft',
          to: `/blast-day/${day.id}`,
          sourceId: log.id,
          jobId: day.jobId,
          person: log.blasterName ?? undefined,
          sentBack: Boolean(day.sendBackNote),
          ...scopeOf(day.jobId),
        });
      }
      if (reportMatches) {
        const crew = report ? (crewByReport.get(report.id) ?? 0) : 0;
        const rigs = rigsByJobDay.get(`${day.jobId}|${day.date}`) ?? [];
        out.push({
          key: `dr-${day.id}`,
          kind: 'daily_report',
          date: day.date,
          title: `Daily Report — ${label}`,
          sub: jobs.get(day.jobId) ?? '',
          particulars: !report ? 'not started' : [crew ? `crew ${crew}` : 'no crew yet', rigs.length ? `${rigs.length} rig${rigs.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · '),
          facts: { ...dayFacts, crew, rigs, rig: rigs.join(', ') || undefined, clips: clipsUnder([report?.id ?? '', day.id]) },
          customerName: customerOf(day.jobId),
          dayId: day.id,
          status: day.status,
          statusVariant: DAY_STATUS_VARIANT[day.status] ?? 'draft',
          to: `/blast-day/${day.id}`,
          sourceId: report?.id ?? day.id,
          jobId: day.jobId,
          person: log?.blasterName ?? undefined,
          sentBack: Boolean(day.sendBackNote),
          ...scopeOf(day.jobId),
        });
      }
    }
  }

  // ── S7b kinds: time cards · repair tickets · services · hour corrections ──
  const assetRows = await projectTable<{ assetNumber: string | null; services: string | null }>('equipment', {
    assetNumber: 'assetNumber',
    services: 'services',
  });
  const asset = new Map(assetRows.map((e) => [e.id, e.assetNumber ?? '—']));
  const personMatch = (userId: string | null | undefined, name: string | null | undefined) =>
    !person
      ? true
      : person.userId && userId
        ? userId === person.userId
        : matchesPersonName(name ?? '', person);

  const cards = await projectTable<{
    date: string;
    jobId: string;
    blastDayId: string | null;
    personName: string | null;
    userId: string | null;
    enteredByUserId: string | null;
    status: string;
    straightTime: number | null;
    overtime: number | null;
    timeIn: string | null;
    timeOut: string | null;
    approvedByName: string | null;
    approvedAt: string | null;
  }>('timeCards', {
    date: 'date',
    jobId: 'jobId',
    blastDayId: 'blastDayId',
    personName: 'personName',
    userId: 'userId',
    enteredByUserId: 'enteredByUserId',
    status: 'status',
    straightTime: 'straightTime',
    overtime: 'overtime',
    timeIn: 'timeIn',
    timeOut: 'timeOut',
    approvedByName: 'approvedByName',
    approvedAt: 'approvedAt',
  });
  for (const c of cards) {
    if (!company && meId && c.userId !== meId && c.enteredByUserId !== meId) continue;
    if (!personMatch(c.userId, c.personName)) continue;
    const tcHours = +(c.straightTime ?? 0) + +(c.overtime ?? 0);
    const inOut = fmt12(c.timeIn) && fmt12(c.timeOut) ? `${fmt12(c.timeIn)} – ${fmt12(c.timeOut)}` : undefined;
    out.push({
      key: `tc-${c.id}`,
      kind: 'time_card',
      date: c.date,
      title: `Time Card — ${c.personName ?? '—'}`,
      sub: `${jobs.get(c.jobId) ?? ''} · ${(+(c.straightTime ?? 0)).toFixed(1)} ST / ${(+(c.overtime ?? 0)).toFixed(1)} OT`,
      head: c.personName ?? undefined,
      particulars: [inOut, `${fmtN(tcHours, 1)} h`, +(c.overtime ?? 0) > 0 ? `${fmtN(+(c.overtime ?? 0), 1)} OT` : null].filter(Boolean).join(' · '),
      facts: { hours: tcHours, inOut, approvedBy: c.approvedByName ?? undefined, approvedAt: c.approvedAt ?? undefined },
      customerName: customerOf(c.jobId),
      dayId: c.blastDayId ?? undefined,
      status: c.status,
      statusVariant: c.status === 'approved' ? 'approved' : c.status === 'filed' ? 'submitted' : 'draft',
      to: c.blastDayId ? `/blast-day/${c.blastDayId}?view=daily-report` : `/jobs/${c.jobId}`,
      sourceId: c.id,
      jobId: c.jobId,
      person: c.personName ?? undefined,
      ...scopeOf(c.jobId),
    });
  }

  const tickets = await projectTable<{
    equipmentId: string;
    description: string | null;
    status: string;
    openedByName: string | null;
    openedByUserId: string | null;
    createdAt: string;
  }>('repairTickets', {
    equipmentId: 'equipmentId',
    description: 'description',
    status: 'status',
    openedByName: 'openedByName',
    openedByUserId: 'openedByUserId',
    createdAt: 'createdAt',
  });
  for (const t of tickets) {
    if (!company && meId && t.openedByUserId !== meId) continue;
    if (!personMatch(t.openedByUserId, t.openedByName)) continue;
    out.push({
      key: `rt-${t.id}`,
      kind: 'repair_ticket',
      date: t.createdAt.slice(0, 10),
      title: `Repair — ${asset.get(t.equipmentId) ?? '—'}`,
      sub: (t.description ?? '').slice(0, 60),
      status: t.status,
      statusVariant: t.status === 'resolved' ? 'approved' : 'draft',
      to: `/equipment/${t.equipmentId}`,
      sourceId: t.id,
      person: t.openedByName ?? undefined,
    });
  }

  for (const e of assetRows) {
    let services: { id: string; type: string; atHours: number; date: string; byName: string; note?: string }[] = [];
    try {
      services = e.services ? (JSON.parse(e.services) as typeof services) : [];
    } catch {
      services = [];
    }
    for (const s of services) {
      if (!company && meName && s.byName !== meName) continue;
      if (person && !matchesPersonName(s.byName ?? '', person)) continue;
      out.push({
        key: `sv-${s.id}`,
        kind: 'service',
        date: s.date,
        title: `${s.type.charAt(0).toUpperCase()}${s.type.slice(1)} service — ${e.assetNumber ?? '—'}`,
        sub: `${s.atHours} h${s.note ? ` · ${s.note}` : ''}`,
        status: 'logged',
        statusVariant: 'approved',
        to: `/equipment/${e.id}`,
        sourceId: s.id,
        person: s.byName,
      });
    }
  }

  const corrections = await projectTable<{
    equipmentId: string;
    observedHours: number | null;
    previousHours: number | null;
    correctedByName: string | null;
    correctedByUserId: string | null;
    createdAt: string;
  }>('hourCorrections', {
    equipmentId: 'equipmentId',
    observedHours: 'observedHours',
    previousHours: 'previousHours',
    correctedByName: 'correctedByName',
    correctedByUserId: 'correctedByUserId',
    createdAt: 'createdAt',
  });
  for (const h of corrections) {
    if (!company && meId && h.correctedByUserId !== meId) continue;
    if (!personMatch(h.correctedByUserId, h.correctedByName)) continue;
    out.push({
      key: `hc-${h.id}`,
      kind: 'hour_correction',
      date: h.createdAt.slice(0, 10),
      title: `Hour correction — ${asset.get(h.equipmentId) ?? '—'}`,
      sub: `${h.previousHours ?? '—'} → ${h.observedHours ?? '—'} h`,
      status: 'logged',
      statusVariant: 'approved',
      to: `/equipment/${h.equipmentId}`,
      sourceId: h.id,
      person: h.correctedByName ?? undefined,
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}
