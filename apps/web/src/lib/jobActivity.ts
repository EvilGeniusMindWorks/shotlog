// Per-job activity summary for list rows (Round S4, jobs study): when was
// this job last worked and how many days does it carry. Lifted out of the
// job detail page so every lens (jobs · customers · sites) reads one
// blob-free projection instead of each computing its own.
import { useLiveQuery } from '@/db';
import { projectTable } from '@/db/projections';
import { formatDate, todayISO } from '@/lib/utils';

export interface JobActivity {
  /** ISO date of the most recent work day (undefined = never worked) */
  lastWorked?: string;
  days: number;
}

export type JobActivityMap = Map<string, JobActivity>;

export async function loadJobActivity(): Promise<JobActivityMap> {
  const rows = await projectTable<{ jobId: string; date: string }>('blastDays', {
    jobId: 'jobId',
    date: 'date',
  });
  const map: JobActivityMap = new Map();
  for (const r of rows) {
    const cur = map.get(r.jobId) ?? { days: 0 };
    cur.days += 1;
    if (!cur.lastWorked || r.date > cur.lastWorked) cur.lastWorked = r.date;
    map.set(r.jobId, cur);
  }
  return map;
}

export function useJobActivity(): JobActivityMap | undefined {
  return useLiveQuery(loadJobActivity, []);
}

/** Roll job activity up to a parent (customer or site): latest date, total days */
export function rollUp(activity: JobActivityMap | undefined, jobIds: string[]): JobActivity {
  const out: JobActivity = { days: 0 };
  for (const id of jobIds) {
    const a = activity?.get(id);
    if (!a) continue;
    out.days += a.days;
    if (a.lastWorked && (!out.lastWorked || a.lastWorked > out.lastWorked)) out.lastWorked = a.lastWorked;
  }
  return out;
}

/** "Today" · "Yesterday" · "3 d ago" · "Aug 16" — the scan-friendly form */
export function relativeDay(iso: string | undefined): string {
  if (!iso) return '—';
  const today = todayISO();
  if (iso === today) return 'Today';
  const diff = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} d ago`;
  return formatDate(iso);
}

/** Days from today to an ISO date (negative = past) */
export function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso) - Date.parse(todayISO())) / 86_400_000);
}
