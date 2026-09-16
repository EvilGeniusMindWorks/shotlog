// Checklist filing, the repair loop, and hour-meter propagation.
// The process gap this fixes: a driller notes "compressor stopped
// working" on paper, the shop never sees it, and the broken rig gets
// dispatched again. Filing here creates a visible ticket, optionally
// pulls the asset out of service, and the shop resolves with a note.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';
import type { CheckState, DrillChecklist, RepairTicket } from '@/db/schema';
import { DRILL_DAILY_CHECKS, DRILL_WEEKLY_CHECKS } from '@/db/schema';

/**
 * Monotonic hour-meter propagation: any filed reading advances the
 * registry, lower readings are ignored (typos, older paper), manual
 * registry edits always win because they're just... later writes.
 */
export async function propagateHourMeter(equipmentId: string, reading: number | null): Promise<void> {
  if (reading === null || !Number.isFinite(reading) || reading <= 0) return;
  const asset = await db.equipment.get(equipmentId);
  if (!asset) return;
  if (typeof asset.hourMeter === 'number' && asset.hourMeter >= reading) return;
  await db.equipment.update(equipmentId, { hourMeter: reading, updatedAt: nowISO() });
}

/** S19 (Matthew): the door decides the date — a checklist started from a work
 *  day is for that day; with no date handed over it is today's */
export function emptyChecklist(equipmentId: string, jobId?: string, date?: string): DrillChecklist {
  const session = getSessionUser();
  const now = nowISO();
  const daily: Record<string, CheckState> = {};
  for (const key of DRILL_DAILY_CHECKS) daily[key] = 'ok'; // minimum-entry default
  const weekly: Record<string, CheckState> = {};
  for (const key of DRILL_WEEKLY_CHECKS) weekly[key] = 'skip';
  return {
    id: generateId(),
    equipmentId,
    jobId,
    date: date ?? todayISO(),
    startingHours: null,
    daily,
    weeklyDone: false,
    weekly,
    repairsNote: '',
    outOfService: false,
    drillerUserId: session?.id ?? '',
    drillerName: session?.name ?? '',
    signatureImage: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
}

/** File the checklist: save it, propagate hours, open a ticket if needed. */
export async function fileChecklist(checklist: DrillChecklist): Promise<{ ticketId?: string }> {
  const now = nowISO();
  await db.drillChecklists.put({ ...checklist, updatedAt: now });
  await propagateHourMeter(checklist.equipmentId, checklist.startingHours);

  const needsRepair = checklist.repairsNote.trim().length > 0 || checklist.outOfService;
  if (!needsRepair) return {};

  const ticketId = generateId();
  const ticket: RepairTicket = {
    id: ticketId,
    equipmentId: checklist.equipmentId,
    sourceType: 'drill_checklist',
    sourceId: checklist.id,
    description: checklist.repairsNote.trim() || 'Marked out of service on daily checklist',
    outOfService: checklist.outOfService,
    status: 'open',
    openedByName: checklist.drillerName,
    openedByUserId: checklist.drillerUserId,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.repairTickets.add(ticket);
  if (checklist.outOfService) {
    await db.equipment.update(checklist.equipmentId, { status: 'in_shop', updatedAt: now });
  }
  return { ticketId };
}

/** S14: the rig's stop reading for the day — its own meter, on its own
 *  checklist. Out of service records the reading at that moment and opens
 *  the shop ticket exactly as filing with the box ticked does. */
export async function stopChecklist(
  checklist: DrillChecklist,
  stopHours: number,
  opts: { outOfService?: boolean; note?: string } = {},
): Promise<{ ticketId?: string }> {
  const now = nowISO();
  await db.drillChecklists.update(checklist.id, {
    stopHours,
    stoppedAt: now,
    ...(opts.outOfService ? { stoppedOutOfService: true } : {}),
    updatedAt: now,
  });
  await propagateHourMeter(checklist.equipmentId, stopHours);
  if (!opts.outOfService) return {};
  const ticketId = generateId();
  const ticket: RepairTicket = {
    id: ticketId,
    equipmentId: checklist.equipmentId,
    sourceType: 'drill_checklist',
    sourceId: checklist.id,
    description: opts.note?.trim() || `Out of service at ${stopHours} h — marked from the day's rig list`,
    outOfService: true,
    status: 'open',
    openedByName: checklist.drillerName,
    openedByUserId: checklist.drillerUserId,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.repairTickets.add(ticket);
  await db.equipment.update(checklist.equipmentId, { status: 'in_shop', updatedAt: now });
  return { ticketId };
}

/** Shop resolves a ticket; restores the asset when it was pulled for it. */
export async function resolveTicket(ticket: RepairTicket, resolutionNote: string): Promise<void> {
  const session = getSessionUser();
  const now = nowISO();
  await db.repairTickets.update(ticket.id, {
    status: 'resolved',
    resolvedByName: session?.name ?? '',
    resolvedByUserId: session?.id ?? '',
    resolvedAt: now,
    resolutionNote: resolutionNote.trim(),
    updatedAt: now,
  });
  if (ticket.outOfService) {
    const stillOpen = (
      await db.repairTickets.where('equipmentId').equals(ticket.equipmentId).toArray()
    ).filter((t) => t.id !== ticket.id && t.status === 'open' && t.outOfService);
    if (stillOpen.length === 0) {
      await db.equipment.update(ticket.equipmentId, { status: 'active', updatedAt: now });
    }
  }
}

export function useOpenTickets() {
  return (
    useLiveQuery(() =>
      db.repairTickets
        .filter((t) => t.status === 'open')
        .toArray()
        .then((ts) => [...ts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    ) ?? []
  );
}

/** Latest checklist per rig today — powers the "not filed yet" nudges */
/** The checklists I filed today, newest first, with their rigs' asset
 *  numbers — the driller home tile and the Drilling door read this
 *  (2026-09-07: the rig is chosen on the form, the home only reports). */
export function useMyChecklistsToday(): { checklist: DrillChecklist; asset: string }[] | undefined {
  const me = getSessionUser();
  return useLiveQuery(async () => {
    const rows = (
      await db.drillChecklists.filter((c) => c.date === todayISO() && (!me?.id || c.drillerUserId === me.id)).toArray()
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out: { checklist: DrillChecklist; asset: string }[] = [];
    for (const c of rows) out.push({ checklist: c, asset: (await db.equipment.get(c.equipmentId))?.assetNumber ?? '—' });
    return out;
  }, [me?.id]);
}

/** Today's checklist for this rig AT THIS JOB (S16, Matthew: a checklist
 *  per rig per job-day — a rig that moves to a second job the same day gets
 *  a second checklist there). No job: the rig's job-less checklist today. */
export function useTodayChecklist(equipmentId: string | undefined, jobId?: string, date?: string) {
  const on = date ?? todayISO();
  return useLiveQuery(
    () =>
      equipmentId
        ? db.drillChecklists
            .where('equipmentId')
            .equals(equipmentId)
            .toArray()
            .then((cs) => cs.find((c) => c.date === on && (c.jobId ?? '') === (jobId ?? '')))
        : undefined,
    [equipmentId, jobId ?? '', on],
  );
}

/** The rig's earlier checklist today at another job — its answers carry
 *  over to the second job-day's checklist (S16) */
export function useEarlierChecklistToday(equipmentId: string | undefined, jobId?: string, date?: string) {
  const on = date ?? todayISO();
  return useLiveQuery(
    () =>
      equipmentId
        ? db.drillChecklists
            .where('equipmentId')
            .equals(equipmentId)
            .toArray()
            .then((cs) => cs.filter((c) => c.date === on && (c.jobId ?? '') !== (jobId ?? '')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0])
        : undefined,
    [equipmentId, jobId ?? '', on],
  );
}
