import { useLiveQuery, db, deleteWithTombstone } from '@/db';
import type {
  BlastDay,
  BlastLog,
  Shot,
  DailyReport,
  ExplosiveUsage,
  Job,
  WorkForceEntry,
  EquipmentEntry,
  WorkType,
} from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { generateId, nowISO, todayISO } from '@/lib/utils';
import { getSessionUser } from '@/lib/session';
import { authorStamp, myBucket } from '@/lib/dayOwnership';
import { createSite, ensureCustomerAndSite, getJobContext, getJobView, getJobViews, nextJobNumber } from '@/lib/jobContext';
import { confirmDay, findDayByDate, newDayId, setCardFacts, setupStamp } from '@/lib/dayCard';

export function useBlastDays() {
  const blastDays = useLiveQuery(() =>
    db.blastDays.orderBy('date').reverse().toArray()
  );
  return blastDays ?? [];
}

export function useBlastDay(id: string | undefined) {
  const blastDay = useLiveQuery(
    () => (id ? db.blastDays.get(id) : undefined),
    [id]
  );
  // Hierarchy-overlaid view: customer/address/state/K resolve through the
  // linked Site/Customer (legacy fields as fallback) — one point for all
  // of the hook's consumers (day page, print pages, forms)
  const job = useLiveQuery(
    () => (blastDay?.jobId ? getJobView(blastDay.jobId) : undefined),
    [blastDay?.jobId]
  );
  const blastLog = useLiveQuery(
    () => (id ? db.blastLogs.where('blastDayId').equals(id).first() : undefined),
    [id]
  );
  const dailyReport = useLiveQuery(
    () => (id ? db.dailyReports.where('blastDayId').equals(id).first() : undefined),
    [id]
  );
  const shots = useLiveQuery(
    () => (blastLog?.id ? db.shots.where('blastLogId').equals(blastLog.id).sortBy('shotNumber') : []),
    [blastLog?.id]
  );
  const explosiveUsage = useLiveQuery(
    () => (blastLog?.id ? db.explosiveUsages.where('blastLogId').equals(blastLog.id).first() : undefined),
    [blastLog?.id]
  );

  return { blastDay, job, blastLog, dailyReport, shots: shots ?? [], explosiveUsage };
}

export function useJobs() {
  // NOTE: boolean fields can't be indexed in IndexedDB — use filter(), not where()
  const jobs = useLiveQuery(async () => getJobViews(await db.jobs.filter((j) => j.isActive).toArray()));
  return jobs ?? [];
}

/** What to carry forward from a previous blast day (Spec §11 Copy from Previous) */
export interface CopyFromPrevious {
  sourceBlastDayId: string;
  blastInfo: boolean; // operation, rock, terrain, hazards, precautions
  drillParams: boolean; // one shot per source shot with drill params (totals cleared)
  designPlan: boolean; // per-shot structure/distance/K compliance inputs
  explosives: boolean; // product lines + lead/cover (per-shot overrides cleared)
  crewEquipment: boolean; // daily report crew + equipment rows (times/hours cleared)
}

export interface CreateWorkDayOptions {
  typeOfWork?: WorkType;
  name?: string;
  /** S13: when the crew was on site (HH:mm) — a card fact */
  onsiteTime?: string;
  /** S13: also create the blasting log (blasting types) and the daily
   *  report at once — the pre-S13 shape. Papers otherwise exist only when
   *  someone STARTS them (the tile, "Start daily report"). Copy-from-
   *  previous implies it (the person asked for the blast content). */
  papers?: boolean;
}

export async function createBlastDay(
  jobId: string,
  date?: string,
  copy?: CopyFromPrevious,
  opts?: CreateWorkDayOptions,
): Promise<string> {
  const now = nowISO();
  const dayDate = date ?? todayISO();
  // S13: ONE day per job per date. A day this device already has (a legacy
  // random-id day included) is THE day; a new one gets the name-based id
  // every phone in the company computes for this job + date, so two phones
  // without signal write the same row instead of two.
  const existing = await findDayByDate(jobId, dayDate);
  if (existing) return existing.id;
  const blastDayId = await newDayId(jobId, dayDate);
  const blastLogId = generateId();
  const dailyReportId = generateId();
  const explosiveUsageId = generateId();
  const shotId = generateId();

  // Copying blast content forces a blasting-type day
  const typeOfWork: WorkType =
    copy && (copy.blastInfo || copy.drillParams || copy.designPlan || copy.explosives)
      ? (opts?.typeOfWork && isBlastingWork(opts.typeOfWork) ? opts.typeOfWork : 'drill_to_blast')
      : (opts?.typeOfWork ?? 'drill_to_blast');
  // S13: papers only when started — unless asked for (harnesses, copy)
  const copying = Boolean(
    copy && (copy.blastInfo || copy.drillParams || copy.designPlan || copy.explosives || copy.crewEquipment),
  );
  const eager = Boolean(opts?.papers) || copying;
  const withBlastLog = eager && isBlastingWork(typeOfWork);
  const withReport = eager;

  const job = await db.jobs.get(jobId);
  const jobCtx = await getJobContext(jobId);

  // Load source records when copying from a previous blast day
  const sourceLog = copy
    ? await db.blastLogs.where('blastDayId').equals(copy.sourceBlastDayId).first()
    : undefined;
  const sourceShots = sourceLog
    ? (await db.shots.where('blastLogId').equals(sourceLog.id).toArray()).sort(
        (a, b) => a.shotNumber - b.shotNumber,
      )
    : [];
  const sourceUsage = sourceLog
    ? await db.explosiveUsages.where('blastLogId').equals(sourceLog.id).first()
    : undefined;
  const sourceReport = copy
    ? await db.dailyReports.where('blastDayId').equals(copy.sourceBlastDayId).first()
    : undefined;

  const blastDay: BlastDay = {
    id: blastDayId,
    date: dayDate,
    jobId,
    ...(opts?.name?.trim() ? { name: opts.name.trim() } : {}),
    ...(opts?.onsiteTime ? { onsiteTime: opts.onsiteTime } : {}),
    // A day that starts with papers counts as set up by its creator (the
    // gate asks the first opener of an EMPTY day)
    ...(eager ? { setup: setupStamp() } : {}),
    status: 'draft',
    conditions: {
      temperatureRange: 'mod',
      weather: 'sunny',
      windDirection: '',
      groundConditions: 'normal',
      weatherNotes: '',
    },
    typeOfWork,
    fireDetail: false,
    // S7d: whoever starts the day authors its report — until a blaster
    // adds the blast log (then it is theirs)
    ...authorStamp(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };

  const copyInfo = copy?.blastInfo && sourceLog;
  const blastLog: BlastLog = {
    id: blastLogId,
    blastDayId,
    operation: copyInfo ? sourceLog.operation : (job?.operation ?? 'construction'),
    typeOfRock: copyInfo ? sourceLog.typeOfRock : (job?.typeOfRock ?? ''),
    typeOfTerrain: copyInfo ? sourceLog.typeOfTerrain : (job?.typeOfTerrain ?? ''),
    hazards: copyInfo ? sourceLog.hazards : (job?.defaultHazards ?? ''),
    precautions: copyInfo ? sourceLog.precautions : (job?.defaultPrecautions ?? ''),
    onsiteDelivery: false,
    blasterName: '',
    licenseNumber: '',
    licenseState: '',
    signatureImage: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };

  const defaultDrillParams = {
    waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0,
  };
  const defaultTotals = {
    numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0,
  };
  const defaultDesignPlan = {
    siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null,
    columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0,
    closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0,
    scaledDistance: 0, predictedPPV: 0, kFactor: jobCtx?.kFactor ?? 180,
  };

  // Shots: mirror the source shot list when copying drill params or design
  // plans, otherwise start with one blank shot. Totals and times always reset —
  // hole counts and blast times belong to the new day.
  const copyShots = (copy?.drillParams || copy?.designPlan) && sourceShots.length > 0;
  const shots: Shot[] = copyShots
    ? sourceShots.map((src, i) => ({
        id: i === 0 ? shotId : generateId(),
        blastLogId,
        shotNumber: i + 1,
        time: '',
        drillParams: copy?.drillParams ? { ...src.drillParams } : defaultDrillParams,
        totals: { ...defaultTotals },
        designPlan: copy?.designPlan
          ? { ...src.designPlan, scaledDistance: 0, predictedPPV: 0 }
          : { ...defaultDesignPlan },
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local' as const,
      }))
    : [
        {
          id: shotId,
          blastLogId,
          shotNumber: 1,
          time: '',
          drillParams: defaultDrillParams,
          totals: defaultTotals,
          designPlan: defaultDesignPlan,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local' as const,
        },
      ];

  // Explosives: carry the product list forward (per-shot overrides cleared —
  // the new day's hole counts drive a fresh auto-distribution)
  const copyUsage = copy?.explosives && sourceUsage;
  const explosiveUsage: ExplosiveUsage = {
    id: explosiveUsageId,
    blastLogId,
    products: copyUsage
      ? sourceUsage.products.map((p) => ({ ...p, shotAllocations: {} }))
      : [],
    totalPoundsShot: copyUsage ? sourceUsage.totalPoundsShot : 0,
    detonators: copyUsage ? sourceUsage.detonators.map((d) => ({ ...d })) : [],
    leadLine: copyUsage ? sourceUsage.leadLine : 0,
    coverType: copyUsage ? sourceUsage.coverType : '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };

  const dailyReport: DailyReport = {
    id: dailyReportId,
    blastDayId,
    notes: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };

  // Crew & equipment: carry the previous day's rows forward when copying
  // (times and meter hours cleared). Fresh days start EMPTY — nobody and no
  // machine is on the report unless the blaster adds them (or copies a day).
  let crewRows: WorkForceEntry[] = [];
  let equipRows: EquipmentEntry[] = [];
  if (copy?.crewEquipment && sourceReport) {
    crewRows = (
      await db.workForceEntries.where('dailyReportId').equals(sourceReport.id).toArray()
    ).map((w) => ({
      ...w,
      id: generateId(),
      dailyReportId,
      timeIn: '',
      timeOut: '',
      straightTime: 0,
      overtime: 0,
      truckHours: 0,
      travelHours: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local' as const,
    }));
    equipRows = (
      await db.equipmentEntries.where('dailyReportId').equals(sourceReport.id).toArray()
    ).map((e) => ({
      ...e,
      id: generateId(),
      dailyReportId,
      hoursStart: 0,
      hoursEnd: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local' as const,
    }));
  }

  await db.transaction(
    'rw',
    [db.blastDays, db.blastLogs, db.shots, db.explosiveUsages, db.dailyReports, db.workForceEntries, db.equipmentEntries],
    async () => {
      await db.blastDays.add(blastDay);
      if (withBlastLog) {
        await db.blastLogs.add(blastLog);
        await db.shots.bulkAdd(shots);
        await db.explosiveUsages.add(explosiveUsage);
      }
      if (withReport) await db.dailyReports.add(dailyReport);
      if (crewRows.length) await db.workForceEntries.bulkAdd(crewRows);
      if (equipRows.length) await db.equipmentEntries.bulkAdd(equipRows);
    },
  );

  if (withBlastLog) await autofillBlasterSignoff(blastLogId, jobCtx?.state);

  return blastDayId;
}

/** The pre-S13 shape: the day WITH its blasting log (blasting types) and
 *  daily report — for harnesses and callers that need the papers at once.
 *  Reuses an existing day and adds whatever is missing. */
export async function createBlastDayWithPapers(
  jobId: string,
  date?: string,
  copy?: CopyFromPrevious,
  opts?: CreateWorkDayOptions,
): Promise<string> {
  const id = await createBlastDay(jobId, date, copy, { ...opts, papers: true });
  const day = await db.blastDays.get(id);
  // An existing day at the job that day is reused (S13) — give it the
  // papers the caller asked for, a blasting log included when the caller
  // wants a blasting day
  if (day && (isBlastingWork(day.typeOfWork) || isBlastingWork(opts?.typeOfWork))) await addBlastLogToDay(id);
  await createDailyReport(id);
  // whoever starts a day with its papers is on site and has seen the card
  await confirmDay(id, true);
  return id;
}

/** S13: "Start daily report" — the day's one daily report, created when
 *  someone starts it (two phones starting it offline: first to sync wins,
 *  the other is told) */
export async function createDailyReport(blastDayId: string): Promise<string> {
  const existing = await db.dailyReports.where('blastDayId').equals(blastDayId).first();
  if (existing) return existing.id;
  const now = nowISO();
  const id = generateId();
  await db.dailyReports.add({ id, blastDayId, notes: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
  return id;
}

/** Auto-fill blaster + license from the signed-in user's account (or the
 *  legacy local profile): name always; license by matching the SITE's state */
async function autofillBlasterSignoff(blastLogId: string, siteState: string | undefined): Promise<void> {
  const session = getSessionUser();
  if (session && siteState !== undefined) {
    const license = (session.licenses ?? []).find((l) => l.state === siteState);
    await db.blastLogs.update(blastLogId, {
      blasterName: session.name,
      ...(license
        ? { licenseNumber: license.licenseNumber, licenseState: license.state }
        : {}),
      updatedAt: nowISO(),
    });
    return;
  }
  const blaster = await db.blasterProfiles.filter((b) => b.isCurrentUser).first();
  if (blaster && siteState !== undefined) {
    const license = blaster.licenses.find((l) => l.state === siteState && l.isActive);
    if (license) {
      await db.blastLogs.update(blastLogId, {
        blasterName: blaster.name,
        licenseNumber: license.licenseNumber,
        licenseState: license.state,
        updatedAt: nowISO(),
      });
    }
  }
}

/**
 * Upgrade a non-blasting work day: attach a blast log (+ first shot and
 * explosives) when the day's work turns into a blast.
 */
export async function addBlastLogToDay(blastDayId: string): Promise<string> {
  const day = await db.blastDays.get(blastDayId);
  if (!day) throw new Error('work day not found');
  const existing = await db.blastLogs.where('blastDayId').equals(blastDayId).first();
  if (existing) return existing.id;
  const job = await db.jobs.get(day.jobId);
  const jobCtx = await getJobContext(day.jobId);
  const now = nowISO();
  const blastLogId = generateId();

  await db.transaction('rw', [db.blastDays, db.blastLogs, db.shots, db.explosiveUsages], async () => {
    // S7d: a blasting day's report belongs to the blaster — the field
    // bucket adding the log takes the day over from whoever started it
    const takeOver = myBucket() === 'field' && day.authorBucket !== 'field' ? authorStamp() : {};
    // S13: the type of work is a card fact — it travels as an edit, never
    // as a rewrite of the day
    if (!isBlastingWork(day.typeOfWork)) await setCardFacts(blastDayId, { typeOfWork: 'drill_to_blast' });
    if (Object.keys(takeOver).length > 0) {
      await db.blastDays.update(blastDayId, { ...takeOver, updatedAt: now });
    }
    await db.blastLogs.add({
      id: blastLogId,
      blastDayId,
      operation: job?.operation ?? 'construction',
      typeOfRock: job?.typeOfRock ?? '',
      typeOfTerrain: job?.typeOfTerrain ?? '',
      hazards: job?.defaultHazards ?? '',
      precautions: job?.defaultPrecautions ?? '',
      onsiteDelivery: false,
      blasterName: '',
      licenseNumber: '',
      licenseState: '',
      signatureImage: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
    await db.shots.add({
      id: generateId(),
      blastLogId,
      shotNumber: 1,
      time: '',
      drillParams: { waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0 },
      totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 },
      designPlan: {
        siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null,
        columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0,
        closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0,
        scaledDistance: 0, predictedPPV: 0, kFactor: jobCtx?.kFactor ?? 180,
      },
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
    await db.explosiveUsages.add({
      id: generateId(),
      blastLogId,
      products: [],
      totalPoundsShot: 0,
      detonators: [],
      leadLine: 0,
      coverType: '',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  });

  await autofillBlasterSignoff(blastLogId, jobCtx?.state);
  return blastLogId;
}

export async function createJob(
  data: Partial<Job> & { name: string; customer: string; siteName?: string },
): Promise<string> {
  const now = nowISO();
  const id = generateId();
  // Explicit picks from the dropdowns win; otherwise one-form
  // auto-structure turns the typed customer/address into records.
  // S11 (Sep 13 2026): a job ALWAYS has a real customer and site. The old
  // code re-ran the customer+site ensure whenever only the site was missing,
  // with the form's empty legacy `customer` string — and made a customer
  // named '' and a site named '' (Mark's first Beta job). Now: a picked site
  // is used as is; a missing site is created under the picked customer from
  // the typed name/state/address; anything blank refuses.
  let customerId = data.customerId;
  let siteId = data.siteId;
  const typedSite = {
    siteName: data.siteName?.trim() ?? '',
    address: data.address?.trim() ?? '',
    city: data.city?.trim() ?? '',
    state: data.state?.trim() ?? '',
  };
  if (!siteId && (!typedSite.siteName || !typedSite.state || !typedSite.address)) {
    throw new Error('A job needs a site: pick one, or give the new site a name, state and address.');
  }
  if (!customerId) {
    if (!data.customer.trim()) throw new Error('A job needs a customer.');
    const ensured = await ensureCustomerAndSite({
      customerName: data.customer,
      ...typedSite,
      kFactor: data.kFactor,
    });
    customerId = ensured.customerId;
    siteId = siteId ?? ensured.siteId;
  } else if (!siteId) {
    siteId = await createSite(customerId, { name: typedSite.siteName, address: typedSite.address, city: typedSite.city, state: typedSite.state, kFactor: data.kFactor });
  }
  // Legacy mirror fields come from the PICKED records when selected
  const site = await db.sites.get(siteId);
  const customer = await db.customers.get(customerId);
  if (!site || !customer || site.customerId !== customer.id) {
    throw new Error('That site does not belong to that customer. Pick the site again.');
  }
  const job: Job = {
    id,
    name: data.name,
    jobNumber: data.jobNumber?.trim() || (await nextJobNumber()),
    ...(data.customerPO?.trim() ? { customerPO: data.customerPO.trim() } : {}),
    jobStatus: data.jobStatus ?? 'active',
    customerId,
    siteId,
    operation: data.operation ?? 'construction',
    ...(data.defaultTypeOfWork ? { defaultTypeOfWork: data.defaultTypeOfWork } : {}),
    typeOfRock: data.typeOfRock ?? '',
    typeOfTerrain: data.typeOfTerrain ?? '',
    defaultHazards: data.defaultHazards ?? '',
    defaultPrecautions: data.defaultPrecautions ?? '',
    isActive: true,
    // legacy mirrors (readers fall back here for un-backfilled jobs)
    customer: customer?.name ?? data.customer,
    address: site?.address ?? data.address ?? '',
    city: site?.city ?? data.city ?? '',
    state: site?.state ?? data.state ?? '',
    kFactor: site?.kFactor ?? data.kFactor ?? 180,
    kFactorHistory: [],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.jobs.add(job);
  return id;
}

export async function addShot(blastLogId: string, kFactor: number = 180): Promise<string> {
  const now = nowISO();
  const id = generateId();
  const existingShots = await db.shots.where('blastLogId').equals(blastLogId).count();
  const shot: Shot = {
    id,
    blastLogId,
    shotNumber: existingShots + 1,
    time: '',
    drillParams: { waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0 },
    totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 },
    designPlan: {
      siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null,
      columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0,
      closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0,
      scaledDistance: 0, predictedPPV: 0, kFactor,
    },
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.shots.add(shot);
  return id;
}

export async function deleteShot(shotId: string, blastLogId: string): Promise<void> {
  // Cascade the shot's OWNED children — orphaned readings/columns/media
  // pollute aggregates forever (drill logs are drillers' documents and
  // survive; their pages tolerate a missing shot)
  for (const r of await db.seismoReadings.where('shotId').equals(shotId).toArray())
    await deleteWithTombstone('seismoReadings', r.id);
  for (const c of await db.typicalColumns.where('shotId').equals(shotId).toArray())
    await deleteWithTombstone('typicalColumns', c.id);
  for (const a of await db.attachments.filter((x) => x.parentId === shotId).toArray())
    await deleteWithTombstone('attachments', a.id);
  await deleteWithTombstone('shots', shotId);
  // Renumber remaining shots
  const remaining = await db.shots.where('blastLogId').equals(blastLogId).sortBy('shotNumber');
  for (let i = 0; i < remaining.length; i++) {
    await db.shots.update(remaining[i].id, { shotNumber: i + 1, updatedAt: nowISO() });
  }
}
