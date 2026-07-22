import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { BlastDay, BlastLog, Shot, DailyReport, ExplosiveUsage, Job } from '@/db/schema';
import { generateId, nowISO, todayISO } from '@/lib/utils';

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
  const job = useLiveQuery(
    () => (blastDay?.jobId ? db.jobs.get(blastDay.jobId) : undefined),
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
  const jobs = useLiveQuery(() => db.jobs.filter((j) => j.isActive).toArray());
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

export async function createBlastDay(
  jobId: string,
  date?: string,
  copy?: CopyFromPrevious,
): Promise<string> {
  const now = nowISO();
  const blastDayId = generateId();
  const blastLogId = generateId();
  const dailyReportId = generateId();
  const explosiveUsageId = generateId();
  const shotId = generateId();

  const job = await db.jobs.get(jobId);

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
    date: date ?? todayISO(),
    jobId,
    status: 'draft',
    conditions: {
      temperatureRange: 'mod',
      weather: 'sunny',
      windDirection: '',
      groundConditions: 'normal',
      weatherNotes: '',
    },
    typeOfWork: 'drill_to_blast',
    fireDetail: false,
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
    scaledDistance: 0, predictedPPV: 0, kFactor: job?.kFactor ?? 180,
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

  // Crew & equipment: carry rosters forward with times/hours cleared
  const crewRows =
    copy?.crewEquipment && sourceReport
      ? (await db.workForceEntries.where('dailyReportId').equals(sourceReport.id).toArray()).map(
          (w) => ({
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
          }),
        )
      : [];
  const equipRows =
    copy?.crewEquipment && sourceReport
      ? (await db.equipmentEntries.where('dailyReportId').equals(sourceReport.id).toArray()).map(
          (e) => ({
            ...e,
            id: generateId(),
            dailyReportId,
            hoursStart: 0,
            hoursEnd: 0,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'local' as const,
          }),
        )
      : [];

  await db.transaction(
    'rw',
    [db.blastDays, db.blastLogs, db.shots, db.explosiveUsages, db.dailyReports, db.workForceEntries, db.equipmentEntries],
    async () => {
      await db.blastDays.add(blastDay);
      await db.blastLogs.add(blastLog);
      await db.shots.bulkAdd(shots);
      await db.explosiveUsages.add(explosiveUsage);
      await db.dailyReports.add(dailyReport);
      if (crewRows.length) await db.workForceEntries.bulkAdd(crewRows);
      if (equipRows.length) await db.equipmentEntries.bulkAdd(equipRows);
    },
  );

  // Auto-fill blaster profile (filter, not where — boolean fields aren't indexable)
  const blaster = await db.blasterProfiles.filter((b) => b.isCurrentUser).first();
  if (blaster && job) {
    const license = blaster.licenses.find((l) => l.state === job.state && l.isActive);
    if (license) {
      await db.blastLogs.update(blastLogId, {
        blasterName: blaster.name,
        licenseNumber: license.licenseNumber,
        licenseState: license.state,
        updatedAt: nowISO(),
      });
    }
  }

  return blastDayId;
}

export async function createJob(data: Partial<Job> & { name: string; customer: string }): Promise<string> {
  const now = nowISO();
  const id = generateId();
  const job: Job = {
    id,
    name: data.name,
    customer: data.customer,
    address: data.address ?? '',
    city: data.city ?? '',
    state: data.state ?? '',
    operation: data.operation ?? 'construction',
    typeOfRock: data.typeOfRock ?? '',
    typeOfTerrain: data.typeOfTerrain ?? '',
    defaultHazards: data.defaultHazards ?? '',
    defaultPrecautions: data.defaultPrecautions ?? '',
    kFactor: data.kFactor ?? 180,
    kFactorHistory: [],
    isActive: true,
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
  await db.shots.delete(shotId);
  // Renumber remaining shots
  const remaining = await db.shots.where('blastLogId').equals(blastLogId).sortBy('shotNumber');
  for (let i = 0; i < remaining.length; i++) {
    await db.shots.update(remaining[i].id, { shotNumber: i + 1, updatedAt: nowISO() });
  }
}
