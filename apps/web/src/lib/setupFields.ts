// S26 push 2 (Matthew, Oct 5 2026: "could this be an admin screen so I could
// adjust on the fly as they use the system?"): the setup fields — what a job
// setup asks for, where the fact lives, when it is asked, and whether it gates
// a blasting day. The defaults are his sort from the interview; Admin › Company
// changes them and the wizard, the site form, the tiles and the gate all read
// the same table.
import { useLiveQuery, db } from '@/db';
import type { CompanySettings } from '@/db/schema';

export type SetupWhen = 'setup' | 'later' | 'rare';
export type SetupLives = 'customer' | 'site' | 'job';
export type SetupKey = 'fire_chief' | 'hospital' | 'k' | 'permit' | 'structures' | 'onsite' | 'po' | 'coi' | 'eor';

export interface SetupFieldDef {
  key: SetupKey;
  label: string;
  lives: SetupLives;
  when: SetupWhen;
  /** May this row hold a BLASTING day when it is missing? */
  gate: boolean;
  /** Can the admin toggle the gate on this row at all? */
  gateable: boolean;
  /** Can the admin ask for it at setup? (the town rows come by memory or Suggest, never typed in the wizard) */
  askable: boolean;
}

export const SETUP_FIELD_DEFAULTS: SetupFieldDef[] = [
  { key: 'fire_chief', label: 'Fire chief', lives: 'site', when: 'setup', gate: true, gateable: true, askable: false },
  { key: 'hospital', label: 'Nearest hospital · urgent care', lives: 'site', when: 'setup', gate: true, gateable: true, askable: false },
  { key: 'k', label: 'K factor', lives: 'site', when: 'later', gate: false, gateable: false, askable: true },
  { key: 'permit', label: 'Blasting permit', lives: 'site', when: 'later', gate: true, gateable: true, askable: true },
  { key: 'structures', label: 'Structures', lives: 'site', when: 'later', gate: false, gateable: false, askable: false },
  { key: 'onsite', label: 'Onsite contact', lives: 'job', when: 'setup', gate: false, gateable: false, askable: true },
  { key: 'po', label: 'Customer PO', lives: 'job', when: 'later', gate: false, gateable: false, askable: true },
  { key: 'coi', label: 'Insurance certificate', lives: 'customer', when: 'later', gate: false, gateable: false, askable: true },
  { key: 'eor', label: 'Engineer of record', lives: 'job', when: 'rare', gate: false, gateable: false, askable: true },
];

export type SetupFieldSetting = { key: string; when?: SetupWhen; gate?: boolean };

/** The defaults with the company's changes laid over them */
export function resolveSetupFields(settings?: Pick<CompanySettings, 'setupFields'> | null): SetupFieldDef[] {
  const over = new Map((settings?.setupFields ?? []).map((s) => [s.key, s]));
  return SETUP_FIELD_DEFAULTS.map((d) => {
    const o = over.get(d.key);
    return o ? { ...d, when: o.when ?? d.when, gate: d.gateable ? (o.gate ?? d.gate) : d.gate } : d;
  });
}

export function useSetupFields(): SetupFieldDef[] {
  const settings = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  return resolveSetupFields(settings);
}

export const asksAtSetup = (fields: SetupFieldDef[], key: SetupKey): boolean => fields.find((f) => f.key === key)?.when === 'setup';
export const gateKeys = (fields: SetupFieldDef[]): Set<SetupKey> => new Set(fields.filter((f) => f.gate).map((f) => f.key));

export const WHEN_LABEL: Record<SetupWhen, string> = { setup: 'At setup', later: 'Later', rare: 'Rarely' };
