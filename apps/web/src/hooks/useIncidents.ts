// S20 (Matthew, Sep 16 2026): an incident is a paper of the work day — it
// carries the day's job, customer and site like every other paper, files on
// its own the moment it is sent, and shows on the day's Incidents tile.
import { db } from '@/db';
import type { Incident, IncidentType } from '@/db/schema';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO } from '@/lib/utils';

export async function createIncident(type: IncidentType, links: Partial<Incident> = {}): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  // the day's job, customer and site ride on the paper
  const day = links.blastDayId ? await db.blastDays.get(links.blastDayId) : undefined;
  const jobId = links.jobId ?? day?.jobId;
  const job = jobId ? await db.jobs.get(jobId) : undefined;
  const incident: Incident = {
    id,
    type,
    status: 'open',
    date: day?.date ?? todayISO(),
    time: '',
    description: '',
    reportedByName: session?.name ?? '',
    reportedByUserId: session?.id ?? '',
    jobId,
    customerId: job?.customerId,
    siteId: job?.siteId,
    ...links,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.incidents.add(incident);
  return id;
}

/** The reporter's confirmation of a Do now step — the tap and its time, never the call itself */
export async function logIncidentStep(incident: Incident, key: string, label: string): Promise<void> {
  const me = getSessionUser();
  const entry = { key, label, at: nowISO(), byName: me?.name ?? '' };
  await db.incidents.update(incident.id, { callLog: [...(incident.callLog ?? []), entry], updatedAt: nowISO() });
}
