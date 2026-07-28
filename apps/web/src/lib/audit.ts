// Audit trail client: fetch helpers + plain-speech rendering of entries.
// Audit surfaces are ONLINE views of the server's append-only log — the
// history exists precisely because it is NOT editable on any device.
import { authedFetch } from '@/lib/session';

export interface AuditChangeView {
  field: string;
  old?: string;
  new?: string;
  note?: string;
}

export interface AuditEntryView {
  id: string;
  tableName: string;
  recordId: string;
  op: 'PUT' | 'PATCH' | 'DELETE' | 'DISCARD';
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  changes: AuditChangeView[];
  reason?: string | null;
}

export const TABLE_LABEL: Record<string, string> = {
  blastDays: 'Work Day',
  blastLogs: 'Blast Log',
  shots: 'Shot',
  explosiveUsages: 'Explosives',
  seismoReadings: 'Seismo Reading',
  typicalColumns: 'Typical Column',
  dailyReports: 'Daily Report',
  workForceEntries: 'Work Force',
  equipmentEntries: 'Equipment Use',
  materialEntries: 'Materials',
  subcontractorEntries: 'Subcontractors',
  drillLogs: 'Drill Log',
  drillLogHoles: 'Drill Hole',
  drillChecklists: 'Rig Checklist',
  repairTickets: 'Repair Ticket',
  incidents: 'Incident',
  attachments: 'Attachment',
  submissions: 'Office Filing',
  jobs: 'Job',
  crewMembers: 'Crew Roster',
  equipment: 'Equipment Registry',
  companySettings: 'Company Settings',
  productCatalog: 'Product Catalog',
  manufacturers: 'Manufacturer',
  blasterProfiles: 'Profile',
};

export function tableLabel(t: string): string {
  return TABLE_LABEL[t] ?? t;
}

/** camelCase → "Camel case" */
export function fieldLabel(f: string): string {
  if (f === '*') return '';
  const words = f.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shortVal(v: string | undefined): string {
  if (v === undefined) return '—';
  const plain = v.replace(/^"|"$/g, '');
  return plain.length > 60 ? `${plain.slice(0, 60)}…` : plain === '' ? '(empty)' : plain;
}

/** One change → a human sentence fragment */
export function describeChange(c: AuditChangeView): string {
  if (c.note === 'created') return 'created';
  if (c.note === 'deleted') return 'deleted';
  if (c.note === 'updated') return `${fieldLabel(c.field)} updated`;
  return `${fieldLabel(c.field)}: ${shortVal(c.old)} → ${shortVal(c.new)}`;
}

export function describeEntry(e: AuditEntryView): string {
  if (e.op === 'DISCARD') return `write rejected — ${e.reason ?? 'not allowed'}`;
  return e.changes.map(describeChange).join(' · ') || e.op.toLowerCase();
}

// ── Fetchers ──────────────────────────────────────────────────────────────

export async function fetchRecordAudit(ids: string[]): Promise<AuditEntryView[]> {
  const res = await authedFetch('/audit/records', {
    method: 'POST',
    body: JSON.stringify({ ids: ids.slice(0, 300) }),
  });
  if (!res.ok) throw new Error(`audit fetch failed (${res.status})`);
  return ((await res.json()) as { entries: AuditEntryView[] }).entries;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  actorId?: string;
  tableName?: string;
  cursor?: string;
  take?: number;
}

export async function fetchAudit(
  q: AuditQuery,
): Promise<{ entries: AuditEntryView[]; nextCursor?: string }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params.set(k, String(v));
  const res = await authedFetch(`/audit?${params.toString()}`);
  if (!res.ok) throw new Error(`audit fetch failed (${res.status})`);
  return (await res.json()) as { entries: AuditEntryView[]; nextCursor?: string };
}

export async function fetchAuditActors(): Promise<{ id: string; name: string }[]> {
  const res = await authedFetch('/audit/actors');
  if (!res.ok) return [];
  return ((await res.json()) as { actors: { id: string; name: string }[] }).actors;
}

/** Every audit entry in a date range (pages until exhausted) — binder export */
export async function fetchAuditRange(from: string, to: string): Promise<AuditEntryView[]> {
  const all: AuditEntryView[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 100; i++) {
    const page = await fetchAudit({ from, to, cursor, take: 200 });
    all.push(...page.entries);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}
