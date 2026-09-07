// Per-person time cards (confirmed 2026-08-17): every crew member files
// their OWN daily card; the day aggregates them. Ownership, attribution,
// and approval are enforced server-side at the sync choke point — these
// helpers mirror those rules to hide what a device can't do.
// S7d: cards belong to a JOB + DATE, not to a day id — a card filed before
// the day existed, or on another device, lands on the right day without
// any ordering luck. The day id is kept as a convenience link.
import { db, useLiveQuery } from '@/db';
import type { BlastDay, CrewMember, TimeCard } from '@/db/schema';
import { canEditApprovedDay } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { suggestHours } from '@/lib/timeSuggest';
import { straightTime as calcST } from '@shotlog/shared';
import { generateId, nowISO, todayISO } from '@/lib/utils';

/** Every card on this day: by day id OR by the day's job + date */
export function useDayTimeCards(day: BlastDay): TimeCard[] {
  return (
    useLiveQuery(
      async () =>
        (
          await db.timeCards
            .filter((c) => c.blastDayId === day.id || (c.jobId === day.jobId && c.date === day.date))
            .toArray()
        ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      [day.id, day.jobId, day.date],
    ) ?? []
  );
}

/** The signed-in user's card for this day, if they've added one */
export function myCard(cards: TimeCard[]): TimeCard | undefined {
  const me = getSessionUser();
  return me ? cards.find((c) => c.userId === me.id) : undefined;
}

/** May this device edit this card? Mirrors the server rule: mine, or a
 *  no-login roster person's, or I hold the approval capability. Approved
 *  cards freeze; filed cards must be pulled back first. */
export function canEditCard(card: TimeCard, roster: CrewMember[]): boolean {
  if (canEditApprovedDay()) return true;
  if (card.status !== 'draft') return false;
  const me = getSessionUser();
  if (!me) return false;
  if (card.userId) return card.userId === me.id;
  const member = card.crewMemberId ? roster.find((m) => m.id === card.crewMemberId) : undefined;
  return !member?.userId;
}

export interface CardSubject {
  name: string;
  crewMemberId?: string;
  userId?: string;
}

/** Today's day at a job, if one exists (latest if several) */
async function todaysDayId(jobId: string, date: string): Promise<string | undefined> {
  const days = await db.blastDays.where('jobId').equals(jobId).toArray();
  return days
    .filter((d) => d.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;
}

async function newCard(
  jobId: string,
  date: string,
  blastDayId: string | undefined,
  subject: CardSubject,
): Promise<string> {
  const me = getSessionUser();
  const now = nowISO();
  const id = generateId();
  // My own card starts filled in from my own records that day (S7d) —
  // a suggestion I confirm, with its sources named
  const suggestion = me && subject.userId === me.id ? await suggestHours(me.id, date) : null;
  const timeIn = suggestion?.timeIn;
  const timeOut = suggestion?.timeOut;
  await db.timeCards.add({
    id,
    date,
    jobId,
    ...(blastDayId ? { blastDayId } : {}),
    personName: subject.name,
    crewMemberId: subject.crewMemberId,
    userId: subject.userId,
    ...(timeIn ? { timeIn } : {}),
    ...(timeOut ? { timeOut } : {}),
    straightTime: timeIn && timeOut ? calcST(timeIn, timeOut, 0) : 0,
    overtime: 0,
    ...(suggestion ? { suggestedFrom: suggestion.from } : {}),
    signatureImage: null,
    status: 'draft',
    enteredByUserId: me?.id ?? '',
    enteredByName: me?.name ?? '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  });
  return id;
}

/** A card with no work day yet (Round 3: driller hours while drilling a
 *  plan — the day record may not exist; cards only need a job + date).
 *  S7d: if today's day exists at that job, the card joins it. */
export async function createStandaloneTimeCard(jobId: string, subject: CardSubject): Promise<string> {
  const date = todayISO();
  return newCard(jobId, date, await todaysDayId(jobId, date), subject);
}

export async function createTimeCard(day: BlastDay, subject: CardSubject): Promise<string> {
  return newCard(day.jobId, day.date, day.id, subject);
}

export async function fileTimeCard(card: TimeCard): Promise<void> {
  await db.timeCards.update(card.id, { status: 'filed', filedAt: nowISO(), updatedAt: nowISO() });
}

/** Pull a filed card back for fixes (owner or approver) */
export async function pullBackTimeCard(card: TimeCard): Promise<void> {
  await db.timeCards.update(card.id, {
    status: 'draft',
    filedAt: undefined,
    updatedAt: nowISO(),
  });
}

export async function approveTimeCard(card: TimeCard): Promise<void> {
  const me = getSessionUser();
  await db.timeCards.update(card.id, {
    status: 'approved',
    approvedAt: nowISO(),
    approvedByUserId: me?.id ?? '',
    approvedByName: me?.name ?? '',
    updatedAt: nowISO(),
  });
}

export async function unapproveTimeCard(card: TimeCard): Promise<void> {
  await db.timeCards.update(card.id, {
    status: 'filed',
    approvedAt: undefined,
    approvedByUserId: undefined,
    approvedByName: undefined,
    updatedAt: nowISO(),
  });
}
