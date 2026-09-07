// Propose a person's in/out from their OWN records that day (Round S7d):
// in = the rig checklist they signed (else their first hole), out = the
// drill log they signed complete (else their last hole). Rounded to five
// minutes, sources named — a suggestion they confirm, never a silent fill.
import { db } from '@/db';

export interface HoursSuggestion {
  timeIn?: string;
  timeOut?: string;
  from: string;
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const sameDay = (iso: string, date: string) => {
  const d = new Date(iso);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === date;
};

export async function suggestHours(userId: string, date: string): Promise<HoursSuggestion | null> {
  const checklists = (await db.drillChecklists.filter((c) => c.drillerUserId === userId && c.date === date).toArray()).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
  const logs = await db.drillLogs.filter((l) => l.drillerUserId === userId).toArray();
  const logIds = new Set(logs.map((l) => l.id));
  const holes = (await db.drillLogHoles.filter((h) => logIds.has(h.drillLogId) && h.date === date).toArray()).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
  const signed = logs
    .filter((l) => l.completedAt && sameDay(l.completedAt, date))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];

  const from: string[] = [];
  let timeIn: string | undefined;
  let timeOut: string | undefined;
  if (checklists[0]) {
    timeIn = hhmm(checklists[0].createdAt);
    from.push(`checklist ${timeIn}`);
  } else if (holes[0]) {
    timeIn = hhmm(holes[0].createdAt);
    from.push(`first hole ${timeIn}`);
  }
  if (signed?.completedAt) {
    timeOut = hhmm(signed.completedAt);
    from.push(`log signed ${timeOut}`);
  } else if (holes.length > 0) {
    timeOut = hhmm(holes[holes.length - 1].createdAt);
    from.push(`last hole ${timeOut}`);
  }
  if (!timeIn && !timeOut) return null;
  return { timeIn, timeOut, from: from.join(' · ') };
}
