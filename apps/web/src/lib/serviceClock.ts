// The ADVISORY 50-hour clock (Round 3, driller study §3): the paper form's
// "every 50 hours or 1 time per week" made honest — the app knows starting
// hours every day, so it computes hours-since-last-service instead of
// trusting memory. Amber, never blocking (approved call). This same due
// state later feeds the Shop's PM queue (Round 4).
import { db } from '@/db';
import type { Equipment } from '@/db/schema';
import { buildHourLedger } from '@/lib/hourLedger';

export const SERVICE_INTERVAL_HOURS = 50;
const DUE_SOON_WINDOW = 10;

export interface ServiceClock {
  /** Latest meter value from the hour ledger */
  currentHours: number | null;
  /** The last checklist that ticked "50-hour / weekly service done" */
  lastDoneDate?: string;
  lastDoneHours?: number | null;
  /** Hours run since the last service (null when either side is unknown) */
  sinceHours: number | null;
  state: 'ok' | 'due-soon' | 'due' | 'unknown';
  /** "42/50" · "due in 8 h" · "due — 12 h over" */
  label: string;
}

export async function buildServiceClock(equip: Equipment): Promise<ServiceClock> {
  const { currentHours } = await buildHourLedger(equip);
  const done = (
    await db.drillChecklists
      .where('equipmentId')
      .equals(equip.id)
      .filter((c) => c.weeklyDone)
      .toArray()
  ).sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!done || currentHours == null || done.startingHours == null) {
    return {
      currentHours,
      lastDoneDate: done?.date,
      lastDoneHours: done?.startingHours ?? null,
      sinceHours: null,
      state: 'unknown',
      label: done ? `last done ${done.date}` : 'no service recorded yet',
    };
  }

  const since = Math.max(0, currentHours - done.startingHours);
  const remaining = SERVICE_INTERVAL_HOURS - since;
  const state = remaining <= 0 ? 'due' : remaining <= DUE_SOON_WINDOW ? 'due-soon' : 'ok';
  const label =
    state === 'due'
      ? `due — ${Math.round(-remaining)} h over`
      : state === 'due-soon'
        ? `due in ${Math.round(remaining)} h`
        : `${Math.round(since)}/${SERVICE_INTERVAL_HOURS} h`;
  return {
    currentHours,
    lastDoneDate: done.date,
    lastDoneHours: done.startingHours,
    sinceHours: since,
    state,
    label,
  };
}
