// S21 — the approval process (Matthew, Sep 16 2026: an approval matrix, a
// review screen for the whole day, approve or send back with notes, a print
// pack). The matrix is a view over the roles' capabilities: each kind of
// paper maps to one capability, and ticking Office × Time cards grants the
// office role that capability. The server enforces the same map.
import { authedFetch } from '@/lib/session';
import { hasCap } from '@/lib/perms';
import type { BlastDay, PaperReview } from '@/db/schema';

export type PaperKind = 'blast_log' | 'daily_report' | 'drill_log' | 'drill_checklist' | 'time_card' | 'incident' | 'repair_ticket';

/** paper → the capability that approves it (the matrix's rows) */
export const PAPER_CAP: Record<PaperKind, string> = {
  blast_log: 'approve_days',
  daily_report: 'approve_days',
  drill_log: 'approve_drill_logs',
  drill_checklist: 'approve_checklists',
  time_card: 'approve_time_cards',
  incident: 'process_incidents',
  repair_ticket: 'resolve_repairs',
};

export const PAPER_LABEL: Record<PaperKind, string> = {
  blast_log: 'Blasting log',
  daily_report: 'Daily report',
  drill_log: 'Drill log',
  drill_checklist: 'Rig checklist',
  time_card: 'Time card',
  incident: 'Incident',
  repair_ticket: 'Repair ticket',
};

/** The matrix's rows, in order, with what a tick means in plain words */
export const MATRIX_ROWS: { kind: PaperKind; label: string; hint: string }[] = [
  { kind: 'blast_log', label: 'Blasting log', hint: 'approved with the day — the same tick as the daily report' },
  { kind: 'daily_report', label: 'Daily report', hint: 'approved with the day' },
  { kind: 'drill_log', label: 'Drill log', hint: 'the office sign-off; accepting the pattern stays with the blaster' },
  { kind: 'drill_checklist', label: 'Rig checklist', hint: '' },
  { kind: 'time_card', label: 'Time cards', hint: 'approve, or send one back to the person' },
  { kind: 'incident', label: 'Incident', hint: 'processed on the Incidents page' },
  { kind: 'repair_ticket', label: 'Repair ticket', hint: 'resolved by the shop' },
];

/** Every capability the matrix can grant */
export const APPROVAL_CAPS = [...new Set(Object.values(PAPER_CAP))];

export function canApprovePaper(kind: PaperKind): boolean {
  return hasCap(PAPER_CAP[kind]);
}

/** Does the signed-in role approve anything at all? (the Approvals tab, the Mine filter) */
export function approvesAnything(): boolean {
  return APPROVAL_CAPS.some((c) => hasCap(c));
}

export function paperKey(kind: PaperKind, recordId?: string): string {
  return kind === 'blast_log' || kind === 'daily_report' ? kind : `${kind}:${recordId}`;
}

/** The office's decisions on a day, newest first */
export function paperReviewsOf(day: Pick<BlastDay, 'paperReviews'> | undefined): { key: string; review: PaperReview }[] {
  return Object.entries(day?.paperReviews ?? {})
    .map(([key, review]) => ({ key, review }))
    .sort((a, b) => b.review.at.localeCompare(a.review.at));
}

export function sentBackPapers(day: Pick<BlastDay, 'paperReviews'> | undefined): { key: string; review: PaperReview }[] {
  return paperReviewsOf(day).filter((p) => p.review.status === 'sent_back');
}

/** Approve or send back ONE paper of a day (server-applied; the note rides to the filer) */
export async function reviewPaper(opts: { dayId: string; kind: PaperKind; recordId?: string; to: 'approved' | 'sent_back'; note?: string; label: string }): Promise<void> {
  const res = await authedFetch(`/admin/blast-days/${opts.dayId}/papers`, {
    method: 'POST',
    body: JSON.stringify({ paper: opts.kind, recordId: opts.recordId, to: opts.to, note: opts.note, label: opts.label }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'the review did not save');
}

/** Approve the day, or send the whole day back with a note */
export async function setDayStatus(dayId: string, to: 'approved' | 'draft' | 'submitted', note?: string): Promise<void> {
  const res = await authedFetch(`/admin/blast-days/${dayId}/status`, {
    method: 'POST',
    body: JSON.stringify({ to, note }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'action failed');
}

export const fmtWhen = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
