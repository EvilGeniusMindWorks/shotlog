// Preventive maintenance on FLAGGED ASSUMPTIONS (Round 4, shop study §4):
// the SHAPE is the commitment, the numbers are not — placeholder intervals
// per machine class, stated out loud until the shop crew supplies real
// ones. Due-states derive from the hour ledger vs the last logged service.
// ADVISORY everywhere — nothing here blocks anything.
import { db } from '@/db';
import type { Equipment, EquipmentCategory } from '@/db/schema';
import { buildHourLedger } from '@/lib/hourLedger';

export interface PMInterval {
  type: string; // stable key, matched by EquipmentService.type
  label: string;
  intervalHours: number;
}

/** ⚠ ASSUMED — invented placeholders pending shop-crew verification */
export const ASSUMED_PM_INTERVALS: Partial<Record<EquipmentCategory, PMInterval[]>> = {
  rock_drill: [
    { type: 'engine', label: 'Engine service — oil, filters', intervalHours: 250 },
    { type: 'compressor', label: 'Compressor service', intervalHours: 500 },
    { type: 'hammer', label: 'Hammer rebuild', intervalHours: 1000 },
  ],
  equip_drill: [
    { type: 'engine', label: 'Engine service — oil, filters', intervalHours: 250 },
    { type: 'compressor', label: 'Compressor service', intervalHours: 500 },
    { type: 'hammer', label: 'Hammer rebuild', intervalHours: 1000 },
  ],
  excavator: [
    { type: 'engine', label: 'Engine service — oil, filters', intervalHours: 250 },
    { type: 'hydraulic', label: 'Hydraulic service', intervalHours: 500 },
  ],
  crusher: [
    { type: 'engine', label: 'Engine service — oil, filters', intervalHours: 250 },
    { type: 'wear', label: 'Wear-parts inspection', intervalHours: 500 },
  ],
  compressor: [{ type: 'engine', label: 'Engine service — oil, filters', intervalHours: 250 }],
  conveyor: [{ type: 'bearings', label: 'Bearing service', intervalHours: 500 }],
};

const DUE_SOON_FRACTION = 0.9;

export interface PMDueState {
  interval: PMInterval;
  sinceHours: number | null; // null = no baseline (no service logged)
  lastAtHours: number | null;
  lastDate?: string;
  state: 'ok' | 'due-soon' | 'due' | 'unknown';
}

export interface AssetPM {
  equipment: Equipment;
  currentHours: number | null;
  rows: PMDueState[];
}

export async function buildAssetPM(equip: Equipment): Promise<AssetPM | null> {
  const intervals = ASSUMED_PM_INTERVALS[equip.category];
  if (!intervals || intervals.length === 0) return null;
  const { currentHours } = await buildHourLedger(equip);
  const rows: PMDueState[] = intervals.map((interval) => {
    const done = (equip.services ?? [])
      .filter((s) => s.type === interval.type)
      .sort((a, b) => b.atHours - a.atHours)[0];
    if (!done || currentHours == null) {
      return { interval, sinceHours: null, lastAtHours: done?.atHours ?? null, lastDate: done?.date, state: 'unknown' };
    }
    const since = Math.max(0, currentHours - done.atHours);
    const state =
      since >= interval.intervalHours
        ? 'due'
        : since >= interval.intervalHours * DUE_SOON_FRACTION
          ? 'due-soon'
          : 'ok';
    return { interval, sinceHours: since, lastAtHours: done.atHours, lastDate: done.date, state };
  });
  return { equipment: equip, currentHours, rows };
}

/** Fleet-wide due/due-soon services — feeds the trio tile + the worklist */
export async function buildDueServices(): Promise<
  { equipment: Equipment; due: PMDueState }[]
> {
  const fleet = await db.equipment
    .filter((e) => e.isActive && e.status !== 'retired')
    .toArray();
  const out: { equipment: Equipment; due: PMDueState }[] = [];
  for (const equip of fleet) {
    const pm = await buildAssetPM(equip);
    if (!pm) continue;
    for (const row of pm.rows) {
      if (row.state === 'due' || row.state === 'due-soon') out.push({ equipment: equip, due: row });
    }
  }
  return out;
}
