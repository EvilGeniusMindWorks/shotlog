// S26 (Matthew, Oct 5 2026, shape A): what stands between a site and a
// BLASTING day. The facts the regulators and the contact sheet both need —
// a permit on file that has not expired, the fire chief on the site's rows,
// the nearest hospital on the site's rows — and, when Admin › Setup fields
// turns them on, police, fire and the customer's insurance certificate.
// A drilling day is never held.
import type { Customer, Site } from '@/db/schema';
import { todayISO } from '@/lib/utils';
import { DEFAULT_GATE_KEYS } from '@/lib/setupFields';

export type GateKey = 'permit' | 'fire_chief' | 'hospital' | 'police' | 'fire' | 'coi';

export interface GateLine {
  key: GateKey;
  ok: boolean;
  /** What the person reads, red or green */
  text: string;
}

type GateSite = Pick<Site, 'permits' | 'contacts'>;
type GateCustomer = Pick<Customer, 'coiExpires'>;

/** `keys`: which rows gate (Admin › Setup fields); the defaults when omitted. The customer is only needed for its insurance row. */
export function blastingGate(site: GateSite | undefined | null, keys: Set<string> = DEFAULT_GATE_KEYS, customer?: GateCustomer | null): GateLine[] {
  if (!site) return [];
  return gateLines(site, customer).filter((l) => keys.has(l.key));
}

function gateLines(site: GateSite, customer?: GateCustomer | null): GateLine[] {
  const today = todayISO();
  const permits = (site.permits ?? []).filter((p) => (p.number ?? '').trim());
  const live = permits.filter((p) => !p.expiresAt || p.expiresAt >= today);
  const expired = permits.filter((p) => p.expiresAt && p.expiresAt < today);
  const permitText = live.length
    ? `Blasting permit ${live[0].number}${live[0].expiresAt ? ` · to ${live[0].expiresAt}` : ''}`
    : expired.length
      ? `Blasting permit ${expired[0].number} · expired ${expired[0].expiresAt}`
      : 'Blasting permit · none on file';
  const row = (role: string) => (site.contacts ?? []).find((c) => c.role === role && (c.name || c.phone));
  const chief = row('fire_chief');
  const hospital = row('hospital');
  const police = row('police');
  const fire = row('fire');
  const coi = customer?.coiExpires;
  const coiLive = Boolean(coi && coi >= today);
  return [
    { key: 'permit', ok: live.length > 0, text: permitText },
    { key: 'fire_chief', ok: Boolean(chief), text: chief ? `Fire chief on the contact sheet · ${chief.name || chief.phone}` : 'Fire chief · not on the contact sheet' },
    { key: 'hospital', ok: Boolean(hospital), text: hospital ? `Nearest hospital set · ${hospital.name || hospital.phone}` : 'Nearest hospital · not set' },
    { key: 'police', ok: Boolean(police), text: police ? `Police on the contact sheet · ${police.name || police.phone}` : 'Police · not on the contact sheet' },
    { key: 'fire', ok: Boolean(fire), text: fire ? `Fire department on the contact sheet · ${fire.name || fire.phone}` : 'Fire department · not on the contact sheet' },
    { key: 'coi', ok: coiLive, text: coiLive ? `Insurance certificate · to ${coi}` : coi ? `Insurance certificate · expired ${coi}` : 'Insurance certificate · none on file' },
  ];
}

export const gateHolds = (lines: GateLine[]): boolean => lines.some((l) => !l.ok);
