// S22 — the Jobsite Contact Sheet (Baystate's "Grab and Go"), a paper of
// every job. His rows exactly: Project (name, location, owner, onsite
// contact), Town (fire chief for blasting, town hall, detail, police, fire,
// hospital, urgent care), BBI Office Info (change in job scope, incident,
// injury, equipment/vehicle issues, direct contractor), Additional
// Information. Prefill: the company's rows and Direct Contractor from the
// company; the town rows, the location and the notifications from the site;
// Owner and a candidate Onsite Contact from the customer; the project name
// from the job. Override: any row, on the job only — the site keeps its
// value for the next job; a job's override never writes back unless the
// office taps "Make this the site's too". When a site row changes later, the
// jobs using that value are offered the change (decision fb4-K: ask per job).
import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import { getSessionUser } from '@/lib/session';
import type { CompanySettings, ContactSheet, ContactSheetRow, Customer, Job, JobContact, JobContactRole, SheetRowKey, SheetSource, Site } from '@/db/schema';

export type SheetGroup = 'project' | 'town' | 'office' | 'additional';

export interface SheetRowDef {
  key: SheetRowKey;
  label: string;
  group: SheetGroup;
  /** where the starting value comes from, in order */
  from: SheetSource[];
  /** the print says what it still needs when this is blank */
  required?: boolean;
  /** hospital and urgent care get a Suggest button (push 3) */
  suggest?: boolean;
  /** the site row this maps to, when the value lives in site.contacts */
  siteRole?: JobContactRole;
  /** free text rather than a name and a number */
  text?: boolean;
}

export const SHEET_GROUPS: { key: SheetGroup; label: string; hint: string }[] = [
  { key: 'project', label: 'Project', hint: '' },
  { key: 'town', label: 'Town', hint: 'from the site, every job here' },
  { key: 'office', label: 'BBI Office Info', hint: 'from the company, every sheet' },
  { key: 'additional', label: 'Additional Information', hint: '' },
];

export const SHEET_ROWS: SheetRowDef[] = [
  { key: 'project_name', label: 'Project Name', group: 'project', from: ['job'], text: true },
  { key: 'location', label: 'Location', group: 'project', from: ['site'], text: true },
  { key: 'owner', label: 'Owner', group: 'project', from: ['customer'] },
  { key: 'onsite', label: 'Onsite Contact', group: 'project', from: ['job', 'customer'] },
  { key: 'fire_chief', label: 'Fire Chief (Blasting)', group: 'town', from: ['site'], required: true, siteRole: 'fire_chief' },
  { key: 'town_hall', label: 'Town Hall (Bldg Insp.)', group: 'town', from: ['site'], siteRole: 'town_hall' },
  { key: 'detail', label: 'Detail Required', group: 'town', from: ['site'], siteRole: 'detail_dispatch' },
  { key: 'police', label: 'Police (911)', group: 'town', from: ['site'], siteRole: 'police' },
  { key: 'fire', label: 'Fire (911)', group: 'town', from: ['site'], siteRole: 'fire' },
  { key: 'hospital', label: 'Hospital (911)', group: 'town', from: ['site'], required: true, suggest: true, siteRole: 'hospital' },
  { key: 'urgent_care', label: 'Urgent Care', group: 'town', from: ['site'], required: true, suggest: true, siteRole: 'urgent_care' },
  { key: 'change_scope', label: 'Change in Job Scope', group: 'office', from: ['company'] },
  { key: 'incident', label: 'Incident', group: 'office', from: ['company'] },
  { key: 'injury', label: 'Injury', group: 'office', from: ['company'] },
  { key: 'equipment', label: 'Equipment / Vehicle Issues', group: 'office', from: ['company'] },
  { key: 'direct_contractor', label: 'Direct Contractor', group: 'office', from: ['company'] },
  { key: 'additional', label: 'Additional Information', group: 'additional', from: ['site'], text: true },
];

/** The company's fixed office rows, as Admin › Company shows them */
export const OFFICE_ROW_KEYS: SheetRowKey[] = ['change_scope', 'incident', 'injury', 'equipment', 'direct_contractor'];

export const SOURCE_LABEL: Record<SheetSource, string> = {
  job: 'job',
  site: 'from the site',
  customer: 'from the customer',
  company: 'from Baystate',
  blank: 'not set',
};

export interface RowValue {
  name: string;
  phone: string;
  notes: string;
}
const EMPTY: RowValue = { name: '', phone: '', notes: '' };
export const rowIsBlank = (v: RowValue | undefined): boolean => !v || (!v.name.trim() && !v.phone.trim() && !v.notes.trim());
export const snapshot = (v: RowValue): string => `${v.name}|${v.phone}|${v.notes}`;

function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The site's value for a row: its contact rows by role (a custom row by label), its address, its notification rules */
export function siteRowValue(site: Site | null | undefined, def: SheetRowDef): RowValue | undefined {
  if (!site) return undefined;
  if (def.key === 'location') {
    const line = [site.address, [site.city, site.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    return line ? { name: line, phone: '', notes: site.accessNotes ?? '' } : undefined;
  }
  if (def.key === 'additional') {
    const notes = [site.notificationRules, site.contactNotes, site.utilityNotes ? `Utilities: ${site.utilityNotes}` : ''].filter(Boolean).join(' · ');
    return notes ? { name: '', phone: '', notes } : undefined;
  }
  if (!def.siteRole) return undefined;
  const byRole = (site.contacts ?? []).find((c) => c.role === def.siteRole);
  const byLabel = byRole ?? (site.contacts ?? []).find((c) => c.role === 'custom' && norm(c.label).includes(norm(def.label.split(' (')[0])));
  const c = byRole ?? byLabel;
  return c ? { name: c.name ?? '', phone: c.phone ?? '', notes: c.notes ?? '' } : undefined;
}

export function customerRowValue(customer: Customer | null | undefined, def: SheetRowDef): RowValue | undefined {
  if (!customer) return undefined;
  if (def.key === 'owner') return { name: customer.name, phone: customer.phone ?? '', notes: '' };
  if (def.key === 'onsite') {
    const contacts = customer.customerContacts ?? [];
    const c = contacts.find((x) => x.isPrimary) ?? contacts.find((x) => /site|super|field|pm|project/i.test(x.role));
    return c ? { name: c.name, phone: c.phone ?? '', notes: c.role ? `${c.role} · candidate from the customer` : 'candidate from the customer' } : undefined;
  }
  return undefined;
}

const OFFICE_LABEL_RE: Record<string, RegExp> = {
  change_scope: /scope/i,
  incident: /incident/i,
  injury: /injur/i,
  equipment: /equipment|vehicle/i,
  direct_contractor: /direct contractor|contractor/i,
};
export function companyRowValue(company: CompanySettings | null | undefined, def: SheetRowDef): RowValue | undefined {
  if (!company || def.group !== 'office') return undefined;
  const rows = company.officeContacts ?? [];
  const c = rows.find((r) => r.key === def.key) ?? rows.find((r) => !r.key && OFFICE_LABEL_RE[def.key]?.test(r.label));
  return c && (c.name || c.phone) ? { name: c.name ?? '', phone: c.phone ?? '', notes: '' } : undefined;
}

export function jobRowValue(job: Job, def: SheetRowDef): RowValue | undefined {
  if (def.key === 'project_name') return { name: job.name, phone: '', notes: job.jobNumber ? `Job ${job.jobNumber}` : '' };
  if (def.key === 'onsite') {
    const c = (job.contacts ?? []).find((x) => x.role === 'onsite');
    return c ? { name: c.name, phone: c.phone, notes: c.notes ?? '' } : undefined;
  }
  return undefined;
}

export interface BuiltRow extends ContactSheetRow {
  def: SheetRowDef;
  /** the site's value now differs from what this row took — offer it */
  siteChange?: RowValue;
  /** the site has a value this row could go back to */
  siteValue?: RowValue;
}

/** The job's sheet as it stands: its saved rows, or the starting values from the site, customer and company */
export function buildSheet(input: { job: Job; site?: Site | null; customer?: Customer | null; company?: CompanySettings | null }): BuiltRow[] {
  const saved = new Map((input.job.contactSheet?.rows ?? []).map((r) => [r.key, r]));
  return SHEET_ROWS.map((def) => {
    const fromSource = (s: SheetSource): RowValue | undefined =>
      s === 'site' ? siteRowValue(input.site, def) : s === 'customer' ? customerRowValue(input.customer, def) : s === 'company' ? companyRowValue(input.company, def) : s === 'job' ? jobRowValue(input.job, def) : undefined;
    const siteValue = def.from.includes('site') ? siteRowValue(input.site, def) : undefined;
    const kept = saved.get(def.key);
    if (kept && kept.source === 'job') {
      return { ...kept, def, siteValue: siteValue && !rowIsBlank(siteValue) ? siteValue : undefined };
    }
    // the starting value, in the row's order of sources
    let value: RowValue | undefined;
    let source: SheetSource = 'blank';
    for (const s of def.from) {
      const v = fromSource(s);
      if (v && !rowIsBlank(v)) { value = v; source = s; break; }
    }
    const row: BuiltRow = { key: def.key, name: value?.name ?? '', phone: value?.phone ?? '', notes: value?.notes ?? '', source, def, takenFrom: source === 'site' && value ? snapshot(value) : undefined };
    // a row saved from the site remembers what it took; a different site value now is offered, not applied
    if (kept && kept.source === 'site' && kept.takenFrom !== undefined) {
      const now = siteValue ? snapshot(siteValue) : '';
      if (now !== kept.takenFrom) {
        return { ...kept, def, siteChange: siteValue ?? EMPTY, siteValue };
      }
    }
    return row;
  });
}

export interface SheetStats {
  filled: number;
  total: number;
  bySource: Record<SheetSource, number>;
  /** the required rows still blank, by label */
  printNeeds: string[];
  /** rows the site changed under this job */
  changes: number;
}

export function sheetStats(rows: BuiltRow[]): SheetStats {
  const bySource: Record<SheetSource, number> = { job: 0, site: 0, customer: 0, company: 0, blank: 0 };
  let filled = 0;
  for (const r of rows) {
    if (rowIsBlank(r)) { bySource.blank++; continue; }
    filled++;
    bySource[r.source]++;
  }
  return {
    filled,
    total: rows.length,
    bySource,
    printNeeds: rows.filter((r) => r.def.required && rowIsBlank(r)).map((r) => r.def.label.split(' (')[0]),
    changes: rows.filter((r) => r.siteChange).length,
  };
}

/** One line for the header: "9 of 17 rows filled · 6 from the site · 5 from Baystate · 1 from the customer · Print needs Fire chief, Hospital" */
export function sheetLine(stats: SheetStats): string {
  const parts = [`${stats.filled} of ${stats.total} rows filled`];
  if (stats.bySource.site) parts.push(`${stats.bySource.site} from the site`);
  if (stats.bySource.company) parts.push(`${stats.bySource.company} from Baystate`);
  if (stats.bySource.customer) parts.push(`${stats.bySource.customer} from the customer`);
  if (stats.bySource.job) parts.push(`${stats.bySource.job} the job's own`);
  if (stats.printNeeds.length) parts.push(`Print needs ${stats.printNeeds.join(', ')}`);
  return parts.join(' · ');
}

/** Save the sheet on the job: a new version, the rows with their sources */
export async function saveSheet(job: Job, rows: ContactSheetRow[], opts: { accept?: boolean } = {}): Promise<void> {
  const me = getSessionUser();
  const now = nowISO();
  const prev = job.contactSheet;
  const sheet: ContactSheet = {
    rows: rows.map(({ key, name, phone, notes, source, takenFrom, geo }) => ({ key, name, phone, notes, source, ...(takenFrom !== undefined ? { takenFrom } : {}), ...(geo ? { geo } : {}) })),
    version: (prev?.version ?? 0) + 1,
    updatedAt: now,
    updatedByName: me?.name ?? '',
    ...(prev?.acceptedAt ? { acceptedAt: prev.acceptedAt, acceptedByName: prev.acceptedByName } : {}),
    ...(opts.accept ? { acceptedAt: now, acceptedByName: me?.name ?? '' } : {}),
    ...(prev?.prints ? { prints: prev.prints } : {}),
  };
  await db.jobs.update(job.id, { contactSheet: sheet, updatedAt: now });
}

/** Record a print of the sheet ("Sheet v3 · Sep 16 · Evette") */
export async function recordPrint(job: Job): Promise<void> {
  if (!job.contactSheet) return;
  const me = getSessionUser();
  const now = nowISO();
  await db.jobs.update(job.id, {
    contactSheet: { ...job.contactSheet, prints: [...(job.contactSheet.prints ?? []), { version: job.contactSheet.version, at: now, byName: me?.name ?? '' }] },
    updatedAt: now,
  });
}

/** "Make this the site's too": the job's value becomes the site's row for every job here */
export async function writeSiteRow(site: Site, def: SheetRowDef, value: RowValue): Promise<void> {
  const now = nowISO();
  if (def.key === 'location' || def.key === 'additional') {
    if (def.key === 'additional') await db.sites.update(site.id, { notificationRules: value.notes, updatedAt: now });
    return;
  }
  if (!def.siteRole) return;
  const contacts = [...(site.contacts ?? [])];
  const i = contacts.findIndex((c) => c.role === def.siteRole);
  const next: JobContact = { id: i >= 0 ? contacts[i].id : generateId(), role: def.siteRole, label: def.label, name: value.name, phone: value.phone, notes: value.notes };
  if (i >= 0) contacts[i] = next;
  else contacts.push(next);
  await db.sites.update(site.id, { contacts, updatedAt: now });
}

/** The rows a crew calls from the day's ☎ — everything with a number, grouped, plus the maps links */
export function callableRows(rows: BuiltRow[]): BuiltRow[] {
  return rows.filter((r) => !rowIsBlank(r) && (r.phone.trim() || r.def.text));
}

/** A link that opens the device's maps app with directions to a place */
export function mapsUrl(query: string): string {
  const q = encodeURIComponent(query);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return `https://maps.apple.com/?daddr=${q}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export const telHref = (phone: string): string => `tel:${phone.replace(/[^+\d]/g, '')}`;

/** The sheet's rows as the S20 Do now contacts (incident, injury, equipment, police, fire, fire chief, hospital, urgent care, onsite) */
export function sheetContacts(rows: ContactSheetRow[] | undefined): Partial<Record<string, { name: string; phone: string }>> {
  const out: Partial<Record<string, { name: string; phone: string }>> = {};
  const map: Partial<Record<SheetRowKey, string>> = { incident: 'incident', injury: 'injury', equipment: 'equipment', police: 'police', fire: 'fire', fire_chief: 'firechief', hospital: 'hospital', urgent_care: 'urgent', onsite: 'onsite' };
  for (const r of rows ?? []) {
    const k = map[r.key];
    if (!k || (!r.name.trim() && !r.phone.trim())) continue;
    out[k] = { name: r.name.trim(), phone: r.phone.trim() };
  }
  return out;
}
