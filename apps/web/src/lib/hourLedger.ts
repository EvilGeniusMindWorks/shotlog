// The equipment HOUR LEDGER (shop charter, 2026-08-17): every meter
// reading is a sourced entry — checklist starting hours, a daily report's
// end-of-day reading, or a shop correction — and the current meter is
// DERIVED from the ledger, newest entry wins. Corrections are append-only
// records that keep both values (what the app showed, what the meter read).
import { db } from '@/db';
import type { Equipment } from '@/db/schema';
import { matchesAsset } from '@/lib/equipmentHistory';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';

export type HourSource = 'checklist' | 'daily_report' | 'correction';

export interface HourLedgerEntry {
  key: string;
  /** ISO date the reading is about (sort key) */
  date: string;
  /** ISO datetime tiebreak */
  at: string;
  source: HourSource;
  hours: number;
  /** correction only: what the app showed before */
  previousHours?: number | null;
  who: string;
  note?: string;
}

export interface HourLedger {
  entries: HourLedgerEntry[]; // newest first
  /** Derived current meter — newest ledger entry, else the registry value */
  currentHours: number | null;
}

export async function buildHourLedger(equip: Equipment): Promise<HourLedger> {
  const entries: HourLedgerEntry[] = [];

  for (const c of await db.drillChecklists.where('equipmentId').equals(equip.id).toArray()) {
    if (c.startingHours == null) continue;
    entries.push({
      key: `chk-${c.id}`,
      date: c.date,
      at: c.createdAt,
      source: 'checklist',
      hours: c.startingHours,
      who: c.drillerName || 'checklist',
    });
  }

  // Daily-report readings: entry → dailyReport → blastDay carries the date
  // (legacy rows have no equipmentId — matchesAsset falls back to asset #)
  const usage = await db.equipmentEntries.filter((e) => matchesAsset(e, equip)).toArray();
  const withEnd = usage.filter((e) => e.hoursEnd > 0);
  if (withEnd.length > 0) {
    const reports = new Map(
      (await db.dailyReports.toArray()).map((r) => [r.id, r.blastDayId] as const),
    );
    const days = new Map((await db.blastDays.toArray()).map((d) => [d.id, d.date] as const));
    for (const e of withEnd) {
      const date = days.get(reports.get(e.dailyReportId) ?? '') ?? e.createdAt.slice(0, 10);
      entries.push({
        key: `use-${e.id}`,
        date,
        at: e.updatedAt,
        source: 'daily_report',
        hours: e.hoursEnd,
        who: 'daily report',
        note: e.hoursStart > 0 ? `${e.hoursStart} → ${e.hoursEnd}` : undefined,
      });
    }
  }

  for (const c of await db.hourCorrections.where('equipmentId').equals(equip.id).toArray()) {
    entries.push({
      key: `cor-${c.id}`,
      date: c.createdAt.slice(0, 10),
      at: c.createdAt,
      source: 'correction',
      hours: c.observedHours,
      previousHours: c.previousHours,
      who: c.correctedByName,
      note: c.note,
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  return {
    entries,
    currentHours: entries.length > 0 ? entries[0].hours : (equip.hourMeter ?? null),
  };
}

/** File a shop correction: append the ledger entry (both values kept) and
 *  stamp the registry's cached meter so every existing display agrees. */
export async function fileHourCorrection(
  equip: Equipment,
  observedHours: number,
  note: string,
): Promise<void> {
  const user = getSessionUser();
  const now = nowISO();
  await db.hourCorrections.add({
    id: generateId(),
    equipmentId: equip.id,
    observedHours,
    previousHours: equip.hourMeter ?? null,
    note: note || undefined,
    correctedByUserId: user?.id ?? '',
    correctedByName: user?.name ?? '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  });
  await db.equipment.update(equip.id, { hourMeter: observedHours, updatedAt: now });
}
