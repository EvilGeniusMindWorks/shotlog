// S26 (Matthew, Oct 5 2026, shape A): what stands between a site and a
// BLASTING day. Three facts the regulators and the contact sheet both need —
// a permit on file that has not expired, the fire chief on the site's rows,
// the nearest hospital on the site's rows. A drilling day is never held.
import type { Site } from '@/db/schema';
import { todayISO } from '@/lib/utils';

export interface GateLine {
  key: 'permit' | 'fire_chief' | 'hospital';
  ok: boolean;
  /** What the person reads, red or green */
  text: string;
}

export function blastingGate(site: Pick<Site, 'permits' | 'contacts'> | undefined | null): GateLine[] {
  if (!site) return [];
  const today = todayISO();
  const permits = (site.permits ?? []).filter((p) => (p.number ?? '').trim());
  const live = permits.filter((p) => !p.expiresAt || p.expiresAt >= today);
  const expired = permits.filter((p) => p.expiresAt && p.expiresAt < today);
  const permitText = live.length
    ? `Blasting permit ${live[0].number}${live[0].expiresAt ? ` · to ${live[0].expiresAt}` : ''}`
    : expired.length
      ? `Blasting permit ${expired[0].number} · expired ${expired[0].expiresAt}`
      : 'Blasting permit · none on file';
  const chief = (site.contacts ?? []).find((c) => c.role === 'fire_chief' && (c.name || c.phone));
  const hospital = (site.contacts ?? []).find((c) => c.role === 'hospital' && (c.name || c.phone));
  return [
    { key: 'permit', ok: live.length > 0, text: permitText },
    { key: 'fire_chief', ok: Boolean(chief), text: chief ? `Fire chief on the contact sheet · ${chief.name || chief.phone}` : 'Fire chief · not on the contact sheet' },
    { key: 'hospital', ok: Boolean(hospital), text: hospital ? `Nearest hospital set · ${hospital.name || hospital.phone}` : 'Nearest hospital · not set' },
  ];
}

export const gateHolds = (lines: GateLine[]): boolean => lines.some((l) => !l.ok);
