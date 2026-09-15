// What the daily report's paper shows (Sep 15 2026, Matthew: "why aren't the
// details of the daily report showing on the prints?"). Since S7d the work
// force IS the day's time cards and the drills' hours are the rigs' own
// records (checklist start → stop), but the print and the PDF still read
// only the legacy tables. One builder, used by the print page, the PDF and
// the form, so the paper says what the screen says.
import { db } from '@/db';
import type { BlastDay, EquipmentEntry, TimeCard, WorkForceEntry } from '@/db/schema';

/** Every time card on this day: the day's own, plus the job's cards dated that day */
export async function dayTimeCards(day: BlastDay): Promise<TimeCard[]> {
  return (await db.timeCards.filter((c) => c.blastDayId === day.id || (c.jobId === day.jobId && c.date === day.date)).toArray()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/** The work-force rows for the paper: legacy rows first, then one row per
 *  time card whose person has no legacy row */
export async function workForceRows(day: BlastDay, dailyReportId: string): Promise<WorkForceEntry[]> {
  const legacy = (await db.workForceEntries.where('dailyReportId').equals(dailyReportId).toArray()).sort((a, b) => a.rowNumber - b.rowNumber);
  const seen = new Set(legacy.map((e) => e.workerName.trim().toLowerCase()));
  const rows = [...legacy];
  for (const c of await dayTimeCards(day)) {
    const key = c.personName.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: `card:${c.id}`,
      dailyReportId,
      rowNumber: rows.length + 1,
      workerName: c.personName,
      crewMemberId: c.crewMemberId,
      timeIn: c.timeIn ?? '',
      timeOut: c.timeOut ?? '',
      straightTime: c.straightTime,
      overtime: c.overtime,
      truckHours: 0,
      travelHours: 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      syncStatus: c.syncStatus,
    });
  }
  return rows;
}

export interface DerivedRig {
  rigId: string;
  asset: string;
  start: number | null;
  end: number | null;
  who?: string;
  logId?: string;
  logOwnerId?: string;
  chkId?: string;
}

/** The drills that worked the day, with the readings from their own
 *  records: the checklist's start, the checklist's stop (a legacy drill-log
 *  end reading as fallback). The newest checklist that day wins. */
export async function derivedRigHours(day: BlastDay): Promise<DerivedRig[]> {
  const logs = await db.drillLogs
    .filter((l) => l.blastDayId === day.id || (l.jobId === day.jobId && (l.date ?? l.createdAt.slice(0, 10)) === day.date))
    .toArray();
  const rigIds = [...new Set(logs.map((l) => l.drillRigEquipmentId).filter((x): x is string => Boolean(x)))];
  // a rig with a checklist on the job that day but no log yet still worked
  for (const c of await db.drillChecklists.filter((c) => c.date === day.date && c.jobId === day.jobId).toArray()) {
    if (!rigIds.includes(c.equipmentId)) rigIds.push(c.equipmentId);
  }
  const out: DerivedRig[] = [];
  for (const rigId of rigIds) {
    const rig = await db.equipment.get(rigId);
    if (!rig) continue;
    // S16: a checklist per rig per job-day — this job's first, a job-less one as fallback
    const todays = (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === day.date).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const chk = todays.find((c) => c.jobId === day.jobId) ?? todays.find((c) => !c.jobId);
    const ends = logs
      .filter((l) => l.drillRigEquipmentId === rigId && l.endingHours != null)
      .map((l) => l.endingHours as number)
      .sort((a, b) => b - a);
    const rigLogs = logs.filter((l) => l.drillRigEquipmentId === rigId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    out.push({
      rigId,
      asset: rig.assetNumber,
      start: chk?.startingHours ?? null,
      end: chk?.stopHours ?? ends[0] ?? null,
      chkId: chk?.id,
      who: rigLogs[0]?.drillerName ?? chk?.drillerName,
      logId: rigLogs[0]?.id,
      logOwnerId: rigLogs[0]?.drillerUserId,
    });
  }
  return out;
}

/** The equipment rows for the paper: the report's own entries, with each
 *  working drill's readings filled from its records, and a row for every
 *  drill that worked but was never typed onto the report */
export async function equipmentRows(day: BlastDay, dailyReportId: string): Promise<EquipmentEntry[]> {
  const entries = await db.equipmentEntries.where('dailyReportId').equals(dailyReportId).toArray();
  const rigs = await derivedRigHours(day);
  const out: EquipmentEntry[] = entries.map((e) => {
    const rig = rigs.find((r) => r.rigId === e.equipmentId || r.asset === e.assetNumber);
    if (!rig) return e;
    return {
      ...e,
      hoursStart: e.hoursStart || rig.start || 0,
      hoursEnd: e.hoursEnd || rig.end || 0,
    };
  });
  for (const r of rigs) {
    if (out.some((e) => e.equipmentId === r.rigId || e.assetNumber === r.asset)) continue;
    out.push({
      id: `rig:${r.rigId}`,
      dailyReportId,
      category: 'equip_drill',
      assetNumber: r.asset,
      hoursStart: r.start ?? 0,
      hoursEnd: r.end ?? 0,
      equipmentId: r.rigId,
      createdAt: day.createdAt,
      updatedAt: day.updatedAt,
      syncStatus: 'synced',
    });
  }
  return out;
}
