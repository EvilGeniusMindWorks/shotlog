// One asset's story: merged chronological events from checklists, repair
// tickets, drill logs, daily-report usage, and incidents. Daily-report
// equipment rows historically carry only a free-text asset number — match
// by id when present (new picker), else by normalized asset number.
import { db } from '@/db';
import type { Equipment } from '@/db/schema';

export interface EquipmentEvent {
  key: string;
  /** ISO date the event belongs to (sort key, newest first) */
  date: string;
  /** createdAt tiebreak within a day */
  at: string;
  kind: 'checklist' | 'ticket_open' | 'ticket_resolved' | 'drill_log' | 'daily_report' | 'incident';
  title: string;
  sub: string;
  /** Needs-attention styling (repairs noted, OOS, incident) */
  flag: boolean;
  to?: string;
}

export function normalizeAsset(s: string): string {
  return s.trim().toLowerCase();
}

/** Does a daily-report equipment row refer to this registry asset? */
export function matchesAsset(
  entry: { equipmentId?: string; assetNumber: string },
  equip: { id: string; assetNumber: string },
): boolean {
  if (entry.equipmentId) return entry.equipmentId === equip.id;
  const n = normalizeAsset(entry.assetNumber);
  return n.length > 0 && n === normalizeAsset(equip.assetNumber);
}

export async function buildEquipmentTimeline(equip: Equipment): Promise<EquipmentEvent[]> {
  const events: EquipmentEvent[] = [];
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));
  const dayLabel = async (dayId: string) => {
    const day = await db.blastDays.get(dayId);
    return { day, label: day ? day.name || jobs.get(day.jobId) || day.date : '' };
  };

  // Rig checklists
  const checklists = await db.drillChecklists.filter((c) => c.equipmentId === equip.id).toArray();
  for (const c of checklists) {
    events.push({
      key: `cl-${c.id}`,
      date: c.date,
      at: c.createdAt,
      kind: 'checklist',
      title: `Checklist — ${c.drillerName}`,
      sub: c.outOfService
        ? `OUT OF SERVICE — ${c.repairsNote || 'no note'}`
        : c.repairsNote
          ? `repairs noted: ${c.repairsNote}`
          : `all good${c.startingHours != null ? ` · ${c.startingHours} hrs` : ''}`,
      flag: c.outOfService || c.repairsNote.trim().length > 0,
      to: `/drill-checklist-print/${c.id}`,
    });
  }

  // Repair tickets (opened + resolved are separate moments)
  const tickets = await db.repairTickets.filter((t) => t.equipmentId === equip.id).toArray();
  for (const t of tickets) {
    events.push({
      key: `to-${t.id}`,
      date: t.createdAt.slice(0, 10),
      at: t.createdAt,
      kind: 'ticket_open',
      title: `Repair ticket opened — ${t.openedByName}`,
      sub: `${t.description}${t.outOfService ? ' · OUT OF SERVICE' : ''}`,
      flag: true,
    });
    if (t.status === 'resolved' && t.resolvedAt) {
      events.push({
        key: `tr-${t.id}`,
        date: t.resolvedAt.slice(0, 10),
        at: t.resolvedAt,
        kind: 'ticket_resolved',
        title: `Ticket resolved — ${t.resolvedByName ?? 'shop'}`,
        sub: t.resolutionNote || t.description,
        flag: false,
      });
    }
  }

  // Drill logs where this asset was the rig
  const logs = await db.drillLogs.filter((l) => l.drillRigEquipmentId === equip.id).toArray();
  for (const log of logs) {
    const { day, label } = await dayLabel(log.blastDayId);
    const shot = await db.shots.get(log.shotId);
    const holes = await db.drillLogHoles.where('drillLogId').equals(log.id).toArray();
    const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
    events.push({
      key: `dl-${log.id}`,
      date: day?.date ?? log.createdAt.slice(0, 10),
      at: log.createdAt,
      kind: 'drill_log',
      title: `Drill log — ${label} · Shot ${shot?.shotNumber ?? '?'}`,
      sub: `${holes.length} holes · ${footage.toFixed(0)} ft · ${log.drillerName}`,
      flag: false,
      to: `/blast-day/${log.blastDayId}/drill-log/${log.id}`,
    });
  }

  // Daily-report usage (id link when the new picker was used, else asset#)
  const entries = await db.equipmentEntries.filter((e) => matchesAsset(e, equip)).toArray();
  for (const e of entries) {
    const report = await db.dailyReports.get(e.dailyReportId);
    if (!report) continue;
    const { day, label } = await dayLabel(report.blastDayId);
    const hours = e.hoursEnd > e.hoursStart ? e.hoursEnd - e.hoursStart : 0;
    events.push({
      key: `de-${e.id}`,
      date: day?.date ?? e.createdAt.slice(0, 10),
      at: e.createdAt,
      kind: 'daily_report',
      title: `Used on ${label || 'a work day'}`,
      sub: hours > 0 ? `${+hours.toFixed(1)} hrs (${e.hoursStart} → ${e.hoursEnd})` : 'on the daily report',
      flag: false,
      to: day ? `/blast-day/${day.id}` : undefined,
    });
  }

  // Incidents involving this asset
  const incidents = await db.incidents.filter((i) => i.equipmentId === equip.id).toArray();
  for (const i of incidents) {
    events.push({
      key: `in-${i.id}`,
      date: i.date,
      at: i.createdAt,
      kind: 'incident',
      title: `${i.type} incident — ${i.status.replace('_', ' ')}`,
      sub: i.description.slice(0, 80),
      flag: true,
      to: `/incident/${i.id}`,
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
}
