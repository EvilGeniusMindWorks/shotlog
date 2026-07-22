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
  const jobs = useLiveQuery(() => db.jobs.where('isActive').equals(1).toArray());
  return jobs ?? [];
}

export async function createBlastDay(jobId: string, date?: string): Promise<string> {
  const now = nowISO();
  const blastDayId = generateId();
  const blastLogId = generateId();
  const dailyReportId = generateId();
  const explosiveUsageId = generateId();
  const shotId = generateId();

  const job = await db.jobs.get(jobId);

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

  const blastLog: BlastLog = {
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

  const shot: Shot = {
    id: shotId,
    blastLogId,
    shotNumber: 1,
    time: '',
    drillParams: defaultDrillParams,
    totals: defaultTotals,
    designPlan: defaultDesignPlan,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };

  const explosiveUsage: ExplosiveUsage = {
    id: explosiveUsageId,
    blastLogId,
    products: [],
    totalPoundsShot: 0,
    detonators: [],
    leadLine: 0,
    coverType: '',
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

  await db.transaction('rw', [db.blastDays, db.blastLogs, db.shots, db.explosiveUsages, db.dailyReports], async () => {
    await db.blastDays.add(blastDay);
    await db.blastLogs.add(blastLog);
    await db.shots.add(shot);
    await db.explosiveUsages.add(explosiveUsage);
    await db.dailyReports.add(dailyReport);
  });

  // Auto-fill blaster profile
  const blaster = await db.blasterProfiles.where('isCurrentUser').equals(1).first();
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
