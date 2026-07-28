// Doc-first launcher plumbing: "start a document" and let the work-day
// container be found-or-created quietly underneath. There is NO job+date
// uniqueness anywhere in the schema, so the launcher must reuse today's day
// for the job — otherwise every tile tap would mint a duplicate day.
import type { NavigateFunction } from 'react-router-dom';
import { db } from '@/db';
import { addBlastLogToDay, createBlastDay } from '@/hooks/useBlastDay';
import { createDrillLog } from '@/hooks/useDrillLogs';
import { isBlastingWork, type BlastDay, type WorkType } from '@/db/schema';
import { todayISO } from '@/lib/utils';

export type LauncherDoc = 'blast_day' | 'daily_report' | 'drill_log' | 'drill_plan';

/** Today's work day for a job (latest if several legacy duplicates exist) */
export async function findTodaysDay(jobId: string): Promise<BlastDay | undefined> {
  const days = await db.blastDays.where('jobId').equals(jobId).toArray();
  const today = todayISO();
  return days
    .filter((d) => d.date === today)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

async function findOrCreateTodaysDay(jobId: string, typeIfNew: WorkType): Promise<string> {
  const existing = await findTodaysDay(jobId);
  if (existing) return existing.id;
  return createBlastDay(jobId, undefined, undefined, { typeOfWork: typeIfNew });
}

/** Day id that is guaranteed to carry a blast log + at least one shot */
async function ensureBlastingDay(jobId: string): Promise<{ dayId: string; shotId: string }> {
  const dayId = await findOrCreateTodaysDay(jobId, 'drill_to_blast');
  let log = await db.blastLogs.where('blastDayId').equals(dayId).first();
  if (!log) {
    // Existing non-blasting day — upgrade it (same path as the day page's
    // "Add Blasting Log" button)
    await addBlastLogToDay(dayId);
    log = await db.blastLogs.where('blastDayId').equals(dayId).first();
  }
  const shots = await db.shots.where('blastLogId').equals(log!.id).toArray();
  const first = [...shots].sort((a, b) => a.shotNumber - b.shotNumber)[0];
  return { dayId, shotId: first.id };
}

/**
 * Open (or quietly create) the container for a doc type and navigate to it.
 * blast_day → the day page · daily_report → the day's daily tab ·
 * drill_plan → straight into the shot-1 plan editor · drill_log → a
 * self-assigned drill log on today's day (claim-as-you-drill).
 */
export async function openTodaysDoc(
  kind: LauncherDoc,
  jobId: string,
  navigate: NavigateFunction,
): Promise<void> {
  switch (kind) {
    case 'blast_day': {
      const dayId = await findOrCreateTodaysDay(jobId, 'drill_to_blast');
      navigate(`/blast-day/${dayId}`);
      return;
    }
    case 'daily_report': {
      const dayId = await findOrCreateTodaysDay(jobId, 'drill_only');
      const day = await db.blastDays.get(dayId);
      navigate(
        day && isBlastingWork(day.typeOfWork)
          ? `/blast-day/${dayId}?tab=daily`
          : `/blast-day/${dayId}`,
      );
      return;
    }
    case 'drill_plan': {
      const { dayId, shotId } = await ensureBlastingDay(jobId);
      navigate(`/blast-day/${dayId}/design/${shotId}`);
      return;
    }
    case 'drill_log': {
      const { dayId, shotId } = await ensureBlastingDay(jobId);
      const shot = await db.shots.get(shotId);
      const logId = await createDrillLog(shot!, dayId, jobId);
      navigate(`/blast-day/${dayId}/drill-log/${logId}`);
      return;
    }
  }
}
