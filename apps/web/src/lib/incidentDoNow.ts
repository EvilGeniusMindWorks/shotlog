// S20 (Matthew, Sep 16 2026): "make sure we can link incident instructions
// to specific actions / contacts from the grab and go details for that job."
// The Jobsite Contact Sheet already says who to call for what (Incident →
// Evette, Injury → Evette, Equipment/Vehicle Issues → Scott, the 911 block,
// the hospital and urgent care). These are the Do now lists per kind of
// incident, with placeholders the job's contacts fill — the company's office
// rows, the site's town rows, the job's own. Edited by the company later
// (S22, Admin › Company); these are the defaults Baystate starts from.
import type { CompanySettings, IncidentType, Job, JobContact, Site } from '@/db/schema';
import { sheetContacts } from '@/lib/contactSheet';

export const INCIDENT_KINDS: { value: IncidentType; label: string; hint: string }[] = [
  { value: 'blasting', label: 'Blasting complaint or damage claim', hint: 'a neighbor, a structure, a reading' },
  { value: 'utility', label: 'Utility strike', hint: 'gas, electric, water, a marked line' },
  { value: 'asset', label: 'Equipment or vehicle', hint: 'an accident, damage, theft' },
  { value: 'injury', label: 'Injury', hint: 'anyone hurt on the site' },
  { value: 'near_miss', label: 'Near miss', hint: 'it nearly went wrong' },
  { value: 'other', label: 'Other', hint: 'anything that should be on record' },
];

/** The screen's name for each kind */
export const INCIDENT_LABEL: Record<IncidentType, string> = {
  blasting: 'Blasting Incident',
  utility: 'Utility Strike',
  asset: 'Asset Incident',
  injury: 'Injury',
  near_miss: 'Near Miss',
  other: 'Incident',
};

/** The paper's title */
export const INCIDENT_TITLE: Record<IncidentType, string> = {
  blasting: 'Blasting Incident Report',
  utility: 'Utility Strike Report',
  asset: 'Company Asset Incident Report',
  injury: 'Injury Report',
  near_miss: 'Near Miss Report',
  other: 'Incident Report',
};

export type ContactKey = 'incident' | 'injury' | 'equipment' | 'police' | 'fire' | 'firechief' | 'hospital' | 'urgent' | 'utility' | 'onsite';

export interface DoNowStep {
  key: string;
  /** {contact} placeholders are filled from the job's sheet */
  text: string;
  /** which sheet row the step calls, if any */
  contact?: ContactKey;
  /** a fixed number to dial (911) */
  dial?: string;
  /** what the tap means: a call placed (the phone dials), or a plain confirmation */
  action: 'call' | 'confirm';
}

export const DO_NOW: Record<IncidentType, DoNowStep[]> = {
  injury: [
    { key: '911', text: 'Call 911 for anything serious', dial: '911', action: 'call' },
    { key: 'hospital', text: 'Serious: {hospital}', contact: 'hospital', action: 'call' },
    { key: 'urgent', text: 'Minor: {urgent}', contact: 'urgent', action: 'call' },
    { key: 'injury', text: 'Call {injury}', contact: 'injury', action: 'call' },
    { key: 'scene', text: 'Photos, witnesses’ names, leave the scene as it is', action: 'confirm' },
    { key: 'report', text: 'Fill this report in before the end of the shift', action: 'confirm' },
  ],
  utility: [
    { key: 'clear', text: 'Clear the area — no ignition sources if it is gas', action: 'confirm' },
    { key: '911', text: 'Call 911 if gas is escaping or wires are down', dial: '911', action: 'call' },
    { key: 'utility', text: 'Call the utility · {utility}', contact: 'utility', action: 'call' },
    { key: 'incident', text: 'Call {incident}', contact: 'incident', action: 'call' },
    { key: 'photos', text: 'Photos of the markings and the strike before anything moves', action: 'confirm' },
  ],
  asset: [
    { key: 'hurt', text: 'Anyone hurt? Report an injury as well', action: 'confirm' },
    { key: 'police', text: 'On a public way: call {police}', contact: 'police', action: 'call' },
    { key: 'equipment', text: 'Call {equipment}', contact: 'equipment', action: 'call' },
    { key: 'incident', text: 'Call {incident}', contact: 'incident', action: 'call' },
    { key: 'photos', text: 'Photos, the other party’s name, plate and insurance', action: 'confirm' },
  ],
  blasting: [
    { key: 'details', text: 'Take the person’s name, address, phone, what they saw and when', action: 'confirm' },
    { key: 'reading', text: 'Note the shot and the nearest seismo reading', action: 'confirm' },
    { key: 'incident', text: 'Call {incident}', contact: 'incident', action: 'call' },
    { key: 'firechief', text: 'Tell {firechief} if the town requires notice', contact: 'firechief', action: 'call' },
  ],
  near_miss: [
    { key: 'safe', text: 'Make it safe', action: 'confirm' },
    { key: 'blaster', text: 'Tell the blaster in charge', action: 'confirm' },
    { key: 'incident', text: 'Call {incident}', contact: 'incident', action: 'call' },
    { key: 'report', text: 'Fill this report in today, with what would have stopped it', action: 'confirm' },
  ],
  other: [{ key: 'incident', text: 'Call {incident}', contact: 'incident', action: 'call' }],
};

export interface ResolvedContact {
  name: string;
  phone: string;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase();

/** The job's sheet rows by what the Do now lists need: the job's own contacts
 *  win over the site's, the company's office rows fill the office keys */
export function resolveIncidentContacts(input: {
  job?: Job | null;
  site?: Site | null;
  company?: CompanySettings | null;
}): Partial<Record<ContactKey, ResolvedContact>> {
  const out: Partial<Record<ContactKey, ResolvedContact>> = {};
  const put = (key: ContactKey, c: { name?: string; phone?: string } | undefined) => {
    if (!c || out[key]) return;
    const name = (c.name ?? '').trim();
    const phone = (c.phone ?? '').trim();
    if (!name && !phone) return;
    out[key] = { name, phone };
  };
  const fromJobContact = (c: JobContact) => {
    const label = norm(c.label);
    switch (c.role) {
      case 'police':
        return put('police', c);
      case 'fire':
        return put('fire', c);
      case 'fire_chief':
        return put('firechief', c);
      case 'hospital':
        return put('hospital', c);
      case 'urgent_care':
        return put('urgent', c);
      case 'onsite':
        return put('onsite', c);
      default:
        if (/gas|electric|water|utility|dig ?safe|eversource|national grid|unitil/.test(label)) return put('utility', c);
        if (/urgent/.test(label)) return put('urgent', c);
        if (/hospital/.test(label)) return put('hospital', c);
        if (/chief/.test(label)) return put('firechief', c);
        if (/police/.test(label)) return put('police', c);
        if (/^fire/.test(label)) return put('fire', c);
        if (/injur/.test(label)) return put('injury', c);
        if (/incident/.test(label)) return put('incident', c);
        if (/equipment|vehicle/.test(label)) return put('equipment', c);
        return undefined;
    }
  };
  // S22: the job's own contact sheet first — the paper the office filled for this job
  for (const [k, v] of Object.entries(sheetContacts(input.job?.contactSheet?.rows))) if (v) put(k as ContactKey, v);
  for (const c of input.job?.contacts ?? []) fromJobContact(c);
  for (const c of input.site?.contacts ?? []) fromJobContact(c);
  for (const c of input.company?.officeContacts ?? []) {
    const label = norm(c.label);
    if (/injur/.test(label)) put('injury', c);
    else if (/incident/.test(label)) put('incident', c);
    else if (/equipment|vehicle/.test(label)) put('equipment', c);
  }
  // the office's Incident row covers Injury when the sheet has no Injury row, and the other way round
  if (!out.injury && out.incident) out.injury = out.incident;
  if (!out.incident && out.injury) out.incident = out.injury;
  return out;
}

export interface RenderedStep extends DoNowStep {
  /** the step's text with the sheet's names and numbers in */
  line: string;
  /** who the tap dials */
  who?: ResolvedContact;
  /** the number to dial, if any */
  tel?: string;
  /** the contact the step needs is not on the sheet */
  missing: boolean;
}

const FALLBACK: Record<ContactKey, string> = {
  incident: 'the office (Incident)',
  injury: 'the office (Injury)',
  equipment: 'the office (Equipment/Vehicle Issues)',
  police: 'the police',
  fire: 'the fire department',
  firechief: 'the fire chief',
  hospital: 'the hospital',
  urgent: 'urgent care',
  utility: 'the utility',
  onsite: 'the onsite contact',
};

export function renderDoNow(type: IncidentType, contacts: Partial<Record<ContactKey, ResolvedContact>>): RenderedStep[] {
  return DO_NOW[type].map((step) => {
    const who = step.contact ? contacts[step.contact] : undefined;
    const missing = Boolean(step.contact) && !who;
    const filled = step.contact
      ? step.text.replace(`{${step.contact}}`, who ? `${who.name}${who.phone ? ` ${who.phone}` : ''}` : `${FALLBACK[step.contact]} — not on the contact sheet yet`)
      : step.text;
    const tel = step.dial ?? (who?.phone || undefined);
    return { ...step, line: filled, who, tel, missing };
  });
}
