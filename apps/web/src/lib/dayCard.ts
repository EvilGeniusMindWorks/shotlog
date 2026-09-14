// A day at a job — the client half of the shared card (Round S13, Sep 14 2026;
// docs/day-at-a-job-design.md). The rules in one place:
//
//  · ONE day per job per date. New days get a name-based id from company +
//    job + date, so two phones without signal mint the SAME row. Before
//    minting, findDayByDate returns a day the device already has (legacy
//    random-id days included).
//  · The card (type of work, on-site time, conditions, label) lives on the
//    day, but after the day exists its facts are SERVER-OWNED. A phone never
//    rewrites them: a change is an edit row per fact carrying the version
//    it was based on. The server applies it (first to land sticks) or holds
//    it; held edits come back as "Needs your decision".
//  · Presence is one confirmation row per person per day. Own row only, so
//    it never conflicts.
//  · The GATE: the first opener fills the card; everyone after confirms it
//    once; a later change by someone else shows the yellow reconfirm line.
import { db, useLiveQuery } from '@/db';
import type { BlastDay, DayCardEdit, WorkDayConfirmation } from '@/db/schema';
import {
  cardValuesEqual,
  cardVersion,
  confirmationIdFor,
  dayIdFor,
  getPath,
  withPath,
  type CardPath,
} from '@shotlog/shared';
import { can } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';

export type CardValues = Partial<Record<CardPath, unknown>>;

// ── One day per job per date ────────────────────────────────────────────────

/** The day at a job on a date, if this device has one (the newest of any
 *  legacy duplicates — lifecycle.mergeDays folds those) */
export async function findDayByDate(jobId: string, date: string): Promise<BlastDay | undefined> {
  const days = await db.blastDays.where('jobId').equals(jobId).toArray();
  return days
    .filter((d) => d.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** The id every device computes for this job + date in this company */
export function newDayId(jobId: string, date: string): Promise<string> {
  const companyId = getSessionUser()?.companyId ?? 'local';
  return dayIdFor(companyId, jobId, date);
}

// ── Card edits ──────────────────────────────────────────────────────────────

/** The first opener's stamp */
export function setupStamp(): NonNullable<BlastDay['setup']> {
  const me = getSessionUser();
  return { by: me?.id ?? '', byName: me?.name ?? '', at: nowISO() };
}

/**
 * Change card facts: one edit row per fact that differs from what the day
 * (with my pending edits) already says. Never touches the day record — the
 * server applies the edit and streams the day back. `force` re-sends a
 * held edit over whatever is current ("use mine").
 */
export async function setCardFacts(
  dayId: string,
  changes: CardValues,
  opts: { force?: boolean } = {},
): Promise<number> {
  const day = await db.blastDays.get(dayId);
  if (!day) return 0;
  const me = getSessionUser();
  const seen = overlayCard(day, await myPendingEdits(dayId));
  const now = nowISO();
  let n = 0;
  for (const [path, value] of Object.entries(changes) as [CardPath, unknown][]) {
    if (!opts.force && cardValuesEqual(getPath(seen as unknown as Record<string, unknown>, path), value)) continue;
    const edit: DayCardEdit = {
      id: generateId(),
      blastDayId: dayId,
      path,
      value,
      baseVersion: cardVersion(day.cardSets, path),
      by: me?.id ?? '',
      byName: me?.name ?? '',
      at: now,
      ...(opts.force ? { force: true } : {}),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await db.dayCardEdits.add(edit);
    n++;
  }
  return n;
}

async function myPendingEdits(dayId: string): Promise<DayCardEdit[]> {
  const me = getSessionUser()?.id;
  return (await db.dayCardEdits.where('blastDayId').equals(dayId).toArray()).filter(
    (e) => e.status === 'pending' && e.by === me,
  );
}

/** The day as this phone sees it: pending (not yet applied) edits of mine
 *  laid over the shared record, oldest first */
export function overlayCard(day: BlastDay, edits: DayCardEdit[]): BlastDay {
  const me = getSessionUser()?.id;
  let out = day as unknown as Record<string, unknown>;
  for (const e of [...edits]
    .filter((x) => x.status === 'pending' && x.by === me)
    .sort((a, b) => a.at.localeCompare(b.at))) {
    out = withPath(out, e.path, e.value);
  }
  return out as unknown as BlastDay;
}

/** Live: the day with my pending edits overlaid (immediate UI while the
 *  server catches up) */
export function useDayCard(day: BlastDay | undefined): BlastDay | undefined {
  const edits =
    useLiveQuery(
      () => (day?.id ? db.dayCardEdits.where('blastDayId').equals(day.id).toArray() : []),
      [day?.id],
    ) ?? [];
  return day ? overlayCard(day, edits) : undefined;
}

/** Live: my held edits across every day — the "Needs your decision" list */
export function useHeldEdits(): DayCardEdit[] {
  const me = getSessionUser()?.id;
  return (
    useLiveQuery(
      async () =>
        (await db.dayCardEdits.filter((e) => e.status === 'held' && e.by === me).toArray()).sort((a, b) =>
          b.heldAt && a.heldAt ? b.heldAt.localeCompare(a.heldAt) : 0,
        ),
      [me],
    ) ?? []
  );
}

/** Resolve a held edit: "theirs" just closes it; "mine" re-sends my value
 *  over whatever is current, then closes it */
export async function resolveEdit(edit: DayCardEdit, choice: 'theirs' | 'mine'): Promise<void> {
  const now = nowISO();
  if (choice === 'mine') {
    await setCardFacts(edit.blastDayId, { [edit.path]: edit.value } as CardValues, { force: true });
  }
  await db.dayCardEdits.update(edit.id, { status: 'resolved', resolution: choice, resolvedAt: now, updatedAt: now });
}

// ── Presence (confirmations) ────────────────────────────────────────────────

/** Write (or refresh) MY confirmation row for the day — nothing else */
export async function confirmDay(dayId: string, didEdit: boolean): Promise<void> {
  const me = getSessionUser();
  if (!me) return;
  const id = await confirmationIdFor(dayId, me.id);
  const now = nowISO();
  const existing = await db.workDayConfirmations.get(id);
  if (existing) {
    await db.workDayConfirmations.update(id, {
      confirmedAt: now,
      didEdit: existing.didEdit || didEdit,
      updatedAt: now,
    });
    return;
  }
  const row: WorkDayConfirmation = {
    id,
    blastDayId: dayId,
    userId: me.id,
    userName: me.name,
    confirmedAt: now,
    didEdit,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.workDayConfirmations.add(row);
}

export async function myConfirmation(dayId: string): Promise<WorkDayConfirmation | undefined> {
  const me = getSessionUser();
  if (!me) return undefined;
  return db.workDayConfirmations.get(await confirmationIdFor(dayId, me.id));
}

/** Live: who has confirmed the day, earliest first */
export function useDayConfirmations(dayId: string | undefined): WorkDayConfirmation[] {
  return (
    useLiveQuery(
      async () =>
        dayId
          ? (await db.workDayConfirmations.where('blastDayId').equals(dayId).toArray()).sort((a, b) =>
              a.confirmedAt.localeCompare(b.confirmedAt),
            )
          : [],
      [dayId],
    ) ?? []
  );
}

// ── The gate ────────────────────────────────────────────────────────────────

export type GateState = 'form' | 'confirm' | 'reconfirm' | 'none';

/** Days created before S13 went live carry documents but no setup stamp —
 *  they are treated as set up; nobody is asked (scenario 8) */
export const S13_CUTOVER = '2026-09-14T04:00:00.000Z';

/** Anything started on the day: a blasting log, daily report, drill log
 *  or time card */
export async function dayHasDocuments(dayId: string): Promise<boolean> {
  if ((await db.blastLogs.where('blastDayId').equals(dayId).count()) > 0) return true;
  if ((await db.dailyReports.where('blastDayId').equals(dayId).count()) > 0) return true;
  if ((await db.drillLogs.where('blastDayId').equals(dayId).count()) > 0) return true;
  return (await db.timeCards.where('blastDayId').equals(dayId).count()) > 0;
}

/** Did someone ELSE set a card fact after I last confirmed? */
export function updatedSinceConfirm(day: BlastDay, mine: WorkDayConfirmation | undefined, meId: string): boolean {
  if (!mine) return false;
  return Object.values(day.cardSets ?? {}).some((s) => s.by !== meId && s.at > mine.confirmedAt);
}

/**
 * What the day asks of me right now:
 *  form      — nobody has set the card up and nothing is started (first opener)
 *  confirm   — the card is set up; I have not said it looks right yet
 *  reconfirm — I confirmed, then someone else changed a fact (the yellow line)
 *  none      — filed days, legacy days with documents, or nothing to ask
 */
export async function dayGate(day: BlastDay): Promise<GateState> {
  if (day.status !== 'draft') return 'none';
  const me = getSessionUser();
  if (!me) return 'none';
  // Readers (the office) are never asked — they cannot write a confirmation
  if (!can('workDayConfirmations', 'PUT')) return 'none';
  const mine = await myConfirmation(day.id);
  if (!day.setup) {
    if (mine) return 'none';
    // Legacy day (documents, no setup, from before S13): treated as set
    // up, nobody is asked. A NEW day someone started papers on without
    // the card (a driller's first log) still asks its next opener.
    if (day.createdAt < S13_CUTOVER && (await dayHasDocuments(day.id))) return 'none';
    return 'form';
  }
  if (!mine) return 'confirm';
  return updatedSinceConfirm(day, mine, me.id) ? 'reconfirm' : 'none';
}

/** Live gate state for a day (undefined while deciding) */
export function useDayGate(day: BlastDay | undefined): GateState | undefined {
  const me = getSessionUser()?.id;
  return useLiveQuery(
    async () => {
      if (!day) return undefined;
      try {
        return await dayGate(day);
      } catch (err) {
        console.error('[dayGate]', err);
        return 'none';
      }
    },
    [day?.id, day?.setup?.at, day?.status, JSON.stringify(day?.cardSets ?? null), me],
  );
}

/** The route that asks (form or confirm), returning to `next` after */
export function setupPath(dayId: string, next: string): string {
  return `/blast-day/${dayId}/setup?next=${encodeURIComponent(next)}`;
}

/** "On site: Joe (6:30), Mark (7:10)" */
export function onSiteLine(rows: WorkDayConfirmation[]): string {
  if (rows.length === 0) return '';
  return `On site: ${rows.map((r) => `${r.userName} (${hhmm(r.confirmedAt)})`).join(', ')}`;
}

/** "On site 1:56 am" — the day's on-site time, else the first confirmation's */
export function onSiteWhen(onsiteTime: string | undefined, rows: WorkDayConfirmation[]): string | null {
  if (onsiteTime) return `On site ${clockLabel(onsiteTime)}`;
  const first = [...rows].sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt))[0];
  return first ? `On site ${hhmm(first.confirmedAt)}` : null;
}

/** "07:05" (a time input) → "7:05 am"; anything else passes through */
export function clockLabel(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
