// Who owns a work day's REPORT (Round S7d, Matthew's second draft):
//  · the day is a container — one per job per date; opening it grants nothing
//  · the blaster owns the report on any day with a blast log (a driller-
//    started day becomes the blaster's the moment the blast log is added)
//  · each person owns their trio (own card, own log, own checklist) anywhere
//  · supervisors/admins may edit any report (as with approved days)
// Client-side rule + audit trail; the server keeps enforcing by role table.
import { db } from '@/db';
import type { BlastDay, BlastLog } from '@/db/schema';
import { canEditApprovedDay, myHomeDashboard } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';

type Bucket = NonNullable<BlastDay['authorBucket']>;

export function myBucket(): Bucket {
  return myHomeDashboard();
}

/** The author stamp for a day I am starting or taking over */
export function authorStamp(): Pick<BlastDay, 'authorUserId' | 'authorName' | 'authorBucket'> {
  const me = getSessionUser();
  return { authorUserId: me?.id, authorName: me?.name, authorBucket: myBucket() };
}

/** Would opening this day make it mine? (no author yet and I am the kind of
 *  person who owns it, or it became a blasting day under a non-blaster) */
export function shouldClaim(day: BlastDay, blastLog: BlastLog | undefined): boolean {
  const me = getSessionUser();
  if (!me || canEditApprovedDay()) return false; // supervision never claims by opening
  const bucket = myBucket();
  if (day.authorUserId === me.id) return false;
  if (blastLog) return bucket === 'field' && day.authorBucket !== 'field';
  if (!day.authorUserId) return bucket === 'field' || bucket === 'driller';
  return false;
}

export async function claimDay(dayId: string): Promise<void> {
  await db.blastDays.update(dayId, { ...authorStamp(), updatedAt: nowISO() });
}

/** May I edit the day's shared report right now? */
export function ownsReport(day: BlastDay, blastLog: BlastLog | undefined): boolean {
  const me = getSessionUser();
  if (!me) return false;
  if (canEditApprovedDay()) return true;
  if (day.authorUserId === me.id) return true;
  return shouldClaim(day, blastLog);
}

/** "Report: Danny Baltazar (you)" / "Report: Mark Rowe" */
export function ownerLine(day: BlastDay): string {
  const me = getSessionUser();
  if (!day.authorName) return 'Report: not started';
  return `Report: ${day.authorName}${day.authorUserId === me?.id ? ' (you)' : ''}`;
}
