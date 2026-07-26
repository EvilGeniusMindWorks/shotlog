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

export function emptyChecklist(equipmentId: string, jobId?: string): DrillChecklist {
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
    date: todayISO(),
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

/** Shop resolves a ticket; restores the asset when it was pulled for it. */
export async function resolveTicket(ticket: RepairTicket, resolutionNote: string): Promise<void> {
  const session = getSessionUser();
  const now = nowISO();
  await db.repairTickets.update(ticket.id, {
    status: 'resolved',
    resolvedByName: session?.name ?? '',
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
export function useTodayChecklist(equipmentId: string | undefined) {
  return useLiveQuery(
    () =>
      equipmentId
        ? db.drillChecklists
            .where('equipmentId')
            .equals(equipmentId)
            .toArray()
            .then((cs) => cs.find((c) => c.date === todayISO()))
        : undefined,
    [equipmentId],
  );
}
