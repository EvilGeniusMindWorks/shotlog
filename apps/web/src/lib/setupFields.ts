// S26 push 2 (Matthew, Oct 5 2026: "could this be an admin screen so I could
// adjust on the fly as they use the system?"): the setup fields — what a job
// setup asks for, where the fact lives, when it is asked, and whether it gates
// a blasting day. The defaults are his sort from the interview; Admin › Company
// › Setup fields changes them and the wizard, the site form, the tiles and the
// gate all read the same table.
// S26 push 3 (Oct 5 2026, "is that all there is for setup fields?"): the table
// is the whole sort — forty-four rows in the interview's six groups — on its
// own page. A row with an `input` is wired into the New job sheet and the tiles
// generically; a row with `fixed` is always asked, automatic or lives on a
// screen of its own, and the table says so instead of offering a switch.
import { useLiveQuery, db } from '@/db';
import type { CompanySettings, Customer, Job, Site } from '@/db/schema';

export type SetupWhen = 'setup' | 'later' | 'rare';
export type SetupLives = 'customer' | 'site' | 'job';
export type SetupGroup = 'who' | 'money' | 'compliance' | 'ground' | 'emergency' | 'job';
export type SetupKey =
  | 'customer_name' | 'customer_type' | 'customer_phone' | 'customer_people' | 'owner' | 'gc' | 'onsite' | 'eor'
  | 'billing_address' | 'terms' | 'po_required' | 'po' | 'quote' | 'tax' | 'job_number' | 'dates'
  | 'coi' | 'permit' | 'jurisdiction' | 'state' | 'fire_chief' | 'town_hall' | 'detail' | 'notification' | 'local_limit' | 'dig_safe'
  | 'address' | 'map_point' | 'work_spot' | 'k' | 'rock' | 'structures' | 'access' | 'hazards' | 'terrain'
  | 'police' | 'fire' | 'hospital' | 'urgent'
  | 'job_name' | 'work_type' | 'operation' | 'status' | 'defaults';

/** How the New job sheet asks for a row when it is "at setup" (and how a tile reads it) */
export interface SetupInput {
  kind: 'text' | 'date' | 'number' | 'textarea' | 'yesno' | 'contact' | 'dates';
  /** The property on the record it lives on (for `dates`: startDate + targetDate; for `contact`: the contacts row) */
  path: string;
  placeholder?: string;
}

export interface SetupFieldDef {
  key: SetupKey;
  label: string;
  group: SetupGroup;
  lives: SetupLives;
  when: SetupWhen;
  /** May this row hold a BLASTING day when it is missing? */
  gate: boolean;
  /** Can the admin toggle the gate on this row at all? */
  gateable: boolean;
  /** Can the admin move it between At setup / Later / Rarely? */
  askable: boolean;
  /** Why it has no switch: always asked, automatic, or lives on a screen of its own */
  fixed?: string;
  /** Wired into the New job sheet and the tiles when asked at setup */
  input?: SetupInput;
}

export const GROUP_LABEL: Record<SetupGroup, string> = {
  who: 'Who',
  money: 'Money',
  compliance: 'Compliance',
  ground: 'The ground',
  emergency: 'Emergency',
  job: 'The job',
};
export const GROUP_ORDER: SetupGroup[] = ['who', 'money', 'compliance', 'ground', 'emergency', 'job'];

const TOWN = 'From the town, or Suggest';
const ALWAYS = 'Always asked';

export const SETUP_FIELD_DEFAULTS: SetupFieldDef[] = [
  // who
  { key: 'customer_name', label: 'Customer name', group: 'who', lives: 'customer', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'customer_type', label: 'Customer type', group: 'who', lives: 'customer', when: 'later', gate: false, gateable: false, askable: false, fixed: "On the customer's page" },
  { key: 'customer_phone', label: 'Customer phone', group: 'who', lives: 'customer', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'phone', placeholder: '413-555-0100' } },
  { key: 'customer_people', label: 'People at the customer', group: 'who', lives: 'customer', when: 'later', gate: false, gateable: false, askable: false, fixed: "On the customer's page" },
  { key: 'owner', label: 'Owner', group: 'who', lives: 'job', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'owner' } },
  { key: 'gc', label: 'General contractor', group: 'who', lives: 'job', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'generalContractor' } },
  { key: 'onsite', label: 'Onsite contact', group: 'who', lives: 'job', when: 'setup', gate: false, gateable: false, askable: true, input: { kind: 'contact', path: 'contacts' } },
  { key: 'eor', label: 'Engineer of record', group: 'who', lives: 'job', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'engineerOfRecord' } },
  // money
  { key: 'billing_address', label: 'Billing address', group: 'money', lives: 'customer', when: 'later', gate: false, gateable: false, askable: false, fixed: "On the customer's page" },
  { key: 'terms', label: 'Payment terms', group: 'money', lives: 'customer', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'paymentTerms', placeholder: 'Net 30' } },
  { key: 'po_required', label: 'PO required', group: 'money', lives: 'customer', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'yesno', path: 'poRequired' } },
  { key: 'po', label: 'Customer PO', group: 'money', lives: 'job', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'customerPO' } },
  { key: 'quote', label: 'Quote reference', group: 'money', lives: 'job', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'quoteRef', placeholder: 'Q-2026-041' } },
  { key: 'tax', label: 'Tax exempt', group: 'money', lives: 'customer', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'yesno', path: 'taxExempt' } },
  { key: 'job_number', label: 'Job number', group: 'money', lives: 'job', when: 'setup', gate: false, gateable: false, askable: false, fixed: 'Automatic' },
  { key: 'dates', label: 'Start and target dates', group: 'money', lives: 'job', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'dates', path: 'startDate' } },
  // compliance
  { key: 'coi', label: 'Insurance certificate', group: 'compliance', lives: 'customer', when: 'later', gate: false, gateable: true, askable: true, input: { kind: 'date', path: 'coiExpires' } },
  { key: 'permit', label: 'Blasting permit', group: 'compliance', lives: 'site', when: 'later', gate: true, gateable: true, askable: true },
  { key: 'jurisdiction', label: 'Jurisdiction', group: 'compliance', lives: 'site', when: 'setup', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'jurisdiction', placeholder: 'Westford Fire Department' } },
  { key: 'state', label: 'State', group: 'compliance', lives: 'site', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'fire_chief', label: 'Fire chief', group: 'compliance', lives: 'site', when: 'setup', gate: true, gateable: true, askable: false, fixed: TOWN },
  { key: 'town_hall', label: 'Town hall', group: 'compliance', lives: 'site', when: 'later', gate: false, gateable: false, askable: false, fixed: TOWN },
  { key: 'detail', label: 'Police detail dispatch', group: 'compliance', lives: 'site', when: 'later', gate: false, gateable: false, askable: false, fixed: TOWN },
  { key: 'notification', label: 'Notification rules', group: 'compliance', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'textarea', path: 'notificationRules', placeholder: 'Abutters within 250 ft, 24 hours before' } },
  { key: 'local_limit', label: 'Local PPV limit', group: 'compliance', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'number', path: 'localPPVLimit', placeholder: '2.0' } },
  { key: 'dig_safe', label: 'Dig Safe · utilities', group: 'compliance', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'utilityNotes', placeholder: 'Ticket number, marked out' } },
  // the ground
  { key: 'address', label: 'Address', group: 'ground', lives: 'site', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'map_point', label: 'Map point', group: 'ground', lives: 'site', when: 'setup', gate: false, gateable: false, askable: false, fixed: 'From the address' },
  { key: 'work_spot', label: 'Work spot', group: 'ground', lives: 'job', when: 'later', gate: false, gateable: false, askable: false, fixed: 'From the site map' },
  { key: 'k', label: 'K factor', group: 'ground', lives: 'site', when: 'setup', gate: false, gateable: false, askable: true },
  { key: 'rock', label: 'Rock type', group: 'ground', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'rockType', placeholder: 'Granite' } },
  { key: 'structures', label: 'Structures', group: 'ground', lives: 'site', when: 'later', gate: false, gateable: false, askable: false, fixed: 'On the shot map' },
  { key: 'access', label: 'Access notes', group: 'ground', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'textarea', path: 'accessNotes', placeholder: 'Gate code, haul road' } },
  { key: 'hazards', label: 'Standing hazards', group: 'ground', lives: 'site', when: 'later', gate: false, gateable: false, askable: true, input: { kind: 'textarea', path: 'standingHazards' } },
  { key: 'terrain', label: 'Terrain', group: 'ground', lives: 'job', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'text', path: 'typeOfTerrain', placeholder: 'Sloped, wooded' } },
  // emergency
  { key: 'police', label: 'Police', group: 'emergency', lives: 'site', when: 'setup', gate: false, gateable: true, askable: false, fixed: TOWN },
  { key: 'fire', label: 'Fire department', group: 'emergency', lives: 'site', when: 'setup', gate: false, gateable: true, askable: false, fixed: TOWN },
  { key: 'hospital', label: 'Nearest hospital', group: 'emergency', lives: 'site', when: 'setup', gate: true, gateable: true, askable: false, fixed: TOWN },
  { key: 'urgent', label: 'Urgent care', group: 'emergency', lives: 'site', when: 'setup', gate: false, gateable: false, askable: false, fixed: TOWN },
  // the job
  { key: 'job_name', label: 'Job name', group: 'job', lives: 'job', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'work_type', label: 'Type of work', group: 'job', lives: 'job', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'operation', label: 'Operation', group: 'job', lives: 'job', when: 'setup', gate: false, gateable: false, askable: false, fixed: ALWAYS },
  { key: 'status', label: 'Status', group: 'job', lives: 'job', when: 'later', gate: false, gateable: false, askable: false, fixed: 'Active when created' },
  { key: 'defaults', label: 'Default hazards', group: 'job', lives: 'job', when: 'rare', gate: false, gateable: false, askable: true, input: { kind: 'textarea', path: 'defaultHazards', placeholder: 'Carried onto every day at this job' } },
];

export type SetupFieldSetting = { key: string; when?: SetupWhen; gate?: boolean };

/** The defaults with the company's changes laid over them */
export function resolveSetupFields(settings?: Pick<CompanySettings, 'setupFields'> | null): SetupFieldDef[] {
  const over = new Map((settings?.setupFields ?? []).map((s) => [s.key, s]));
  return SETUP_FIELD_DEFAULTS.map((d) => {
    const o = over.get(d.key);
    return o ? { ...d, when: d.askable ? (o.when ?? d.when) : d.when, gate: d.gateable ? (o.gate ?? d.gate) : d.gate } : d;
  });
}

export function useSetupFields(): SetupFieldDef[] {
  const settings = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  return resolveSetupFields(settings);
}

export const asksAtSetup = (fields: SetupFieldDef[], key: SetupKey): boolean => fields.find((f) => f.key === key)?.when === 'setup';
export const gateKeys = (fields: SetupFieldDef[]): Set<string> => new Set(fields.filter((f) => f.gate).map((f) => f.key));
/** The gate when no company table has been read yet */
export const DEFAULT_GATE_KEYS: Set<string> = gateKeys(SETUP_FIELD_DEFAULTS);

/** Rows the New job sheet handles with fields of their own, not the generic inputs */
export const SPECIAL_SETUP_KEYS: ReadonlySet<SetupKey> = new Set<SetupKey>(['k', 'permit', 'po', 'coi']);

/** The rows asked at setup that the sheet wires generically, for one record */
export const genericSetupInputs = (fields: SetupFieldDef[], lives: SetupLives): SetupFieldDef[] =>
  fields.filter((f) => f.when === 'setup' && f.input && f.lives === lives && !SPECIAL_SETUP_KEYS.has(f.key));

/** What a tile reads for a generic row: the value as text, or null when it is not in */
export function readSetupValue(f: SetupFieldDef, rec: { customer?: Customer; site?: Site; job: Job }): string | null {
  if (!f.input) return null;
  const target: Record<string, unknown> | undefined = f.lives === 'customer' ? (rec.customer as unknown as Record<string, unknown> | undefined) : f.lives === 'site' ? (rec.site as unknown as Record<string, unknown> | undefined) : (rec.job as unknown as Record<string, unknown>);
  if (!target) return null;
  if (f.input.kind === 'contact') {
    const c = rec.job.contacts?.find((x) => x.role === 'onsite' && (x.name || x.phone));
    return c ? [c.name, c.phone].filter(Boolean).join(' · ') : null;
  }
  if (f.input.kind === 'dates') {
    const s = rec.job.startDate, t = rec.job.targetDate;
    return s || t ? [s ? `from ${s}` : null, t ? `to ${t}` : null].filter(Boolean).join(' · ') : null;
  }
  const v = target[f.input.path];
  if (f.input.kind === 'yesno') return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : null;
  if (v === undefined || v === null || v === '') return null;
  return String(v);
}

export const WHEN_LABEL: Record<SetupWhen, string> = { setup: 'At setup', later: 'Later', rare: 'Rarely' };
export const LIVES_LABEL: Record<SetupLives, string> = { customer: 'the customer', site: 'the site', job: 'the job' };

/** The typed values of the generic rows (keyed by row key; `dates` as key:start / key:target, `contact` as key:name / key:phone) */
export type SetupExtraValues = Record<string, string>;

/** What the New job sheet typed into the generic rows, sorted onto the three records */
export function buildSetupExtras(fields: SetupFieldDef[], more: SetupExtraValues, newId: () => string): { customer: Partial<Customer>; site: Partial<Site>; job: Partial<Job> } {
  const out = { customer: {} as Record<string, unknown>, site: {} as Record<string, unknown>, job: {} as Record<string, unknown> };
  for (const f of fields) {
    if (f.when !== 'setup' || !f.input || SPECIAL_SETUP_KEYS.has(f.key)) continue;
    const target = out[f.lives];
    const { kind, path } = f.input;
    if (kind === 'dates') {
      const s = (more[`${f.key}:start`] ?? '').trim();
      const t = (more[`${f.key}:target`] ?? '').trim();
      if (s) target.startDate = s;
      if (t) target.targetDate = t;
      continue;
    }
    if (kind === 'contact') {
      const name = (more[`${f.key}:name`] ?? '').trim();
      const phone = (more[`${f.key}:phone`] ?? '').trim();
      if (name || phone) {
        const list = (target.contacts as unknown[] | undefined) ?? [];
        target.contacts = [...list, { id: newId(), role: 'onsite', label: 'Onsite contact', name, phone }];
      }
      continue;
    }
    const v = (more[f.key] ?? '').trim();
    if (!v) continue;
    if (kind === 'yesno') target[path] = v === 'yes';
    else if (kind === 'number') { const n = Number(v); if (Number.isFinite(n)) target[path] = n; }
    else target[path] = v;
  }
  return out as { customer: Partial<Customer>; site: Partial<Site>; job: Partial<Job> };
}
