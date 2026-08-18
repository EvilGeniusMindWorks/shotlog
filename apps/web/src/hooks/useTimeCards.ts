// Per-person time cards (confirmed 2026-08-17): every crew member files
// their OWN daily card; the day aggregates them. Ownership, attribution,
// and approval are enforced server-side at the sync choke point — these
// helpers mirror those rules to hide what a device can't do.
import { db, useLiveQuery } from '@/db';
import type { BlastDay, CrewMember, TimeCard } from '@/db/schema';
import { canEditApprovedDay } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';

export function useDayTimeCards(blastDayId: string): TimeCard[] {
  return (
    useLiveQuery(
      () => db.timeCards.where('blastDayId').equals(blastDayId).sortBy('createdAt'),
      [blastDayId],
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

/** A card with no work day yet (Round 3: driller hours while drilling a
 *  plan — the day record may not exist; cards only need a job + date). */
export async function createStandaloneTimeCard(jobId: string, subject: CardSubject): Promise<string> {
  const me = getSessionUser();
  const now = nowISO();
  const id = generateId();
  await db.timeCards.add({
    id,
    date: todayISO(),
    jobId,
    personName: subject.name,
    crewMemberId: subject.crewMemberId,
    userId: subject.userId,
    straightTime: 0,
    overtime: 0,
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

export async function createTimeCard(day: BlastDay, subject: CardSubject): Promise<string> {
  const me = getSessionUser();
  const now = nowISO();
  const id = generateId();
  await db.timeCards.add({
    id,
    date: day.date,
    jobId: day.jobId,
    blastDayId: day.id,
    personName: subject.name,
    crewMemberId: subject.crewMemberId,
    userId: subject.userId,
    straightTime: 0,
    overtime: 0,
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
