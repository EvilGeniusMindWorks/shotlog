// S22 — the client side of "nearest hospital and urgent care" and "the way
// there": the server holds the federal hospital list and asks OpenStreetMap
// for urgent care; the route comes from our own router when one is on.
import { authedFetch } from '@/lib/session';

export interface NearbyPlace {
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  miles: number;
  er?: boolean;
  kind: 'hospital' | 'urgent';
  source: 'cms' | 'osm' | 'google';
  /** filled when the router answers */
  minutes?: number;
}

export interface DriveRoute {
  miles: number;
  minutes: number;
  steps: string[];
}

export async function nearestPlaces(kind: 'hospital' | 'urgent', at: { lat: number; lng: number }, limit = 3): Promise<{ places: NearbyPlace[]; phonesFrom: string }> {
  const res = await authedFetch(`/places/nearest?lat=${at.lat}&lng=${at.lng}&kind=${kind}&limit=${limit}`);
  const body = (await res.json().catch(() => null)) as { places?: NearbyPlace[]; phonesFrom?: string; error?: string } | null;
  if (!res.ok || !body?.places) throw new Error(body?.error ?? 'the lookup did not answer');
  return { places: body.places, phonesFrom: body.phonesFrom ?? '' };
}

/** null when no router is configured (the print says so) */
export async function driveRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<DriveRoute | null> {
  const res = await authedFetch(`/places/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`);
  const body = (await res.json().catch(() => null)) as { router?: string; route?: DriveRoute | null; error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'the router did not answer');
  if (!body || body.router === 'off') return null;
  return body.route ?? null;
}

/** A web search for the number OpenStreetMap does not carry — no vendor, the office's own browser */
export function webSearchUrl(place: { name: string; address: string }): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${place.name} ${place.address} phone`)}`;
}

/** The link the QR code carries: any phone's maps app opens turn-by-turn from where you stand */
export function liveDirectionsUrl(place: { name: string; address: string; lat?: number; lng?: number }): string {
  const dest = place.lat !== undefined && place.lng !== undefined ? `${place.lat},${place.lng}` : `${place.name} ${place.address}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

export const fmtMiles = (m: number): string => (m < 10 ? `${m.toFixed(1)} mi` : `${Math.round(m)} mi`);
