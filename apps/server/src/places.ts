// S22 — the nearest hospital and urgent care, and the way there (Matthew,
// Sep 16 2026: "nearest 3 hospitals, nearest 3 urgent care"; his pick: the
// federal list plus OpenStreetMap, no new vendor; the route from our own
// router).
//   GET /places/nearest?lat=&lng=&kind=hospital   the nearest three with an
//        emergency department, from the bundled CMS list (straight-line miles)
//   GET /places/nearest?lat=&lng=&kind=urgent     urgent-care clinics near the
//        point from OpenStreetMap's Overpass service (phones when tagged)
//   GET /places/route?from=lat,lng&to=lat,lng     the drive from our own
//        router (ROUTER_URL, an OSRM instance) — miles, minutes, one step per
//        line; "off" when no router is configured
// A Google Places key (GOOGLE_PLACES_KEY) fills missing phones when present;
// without it the office searches the web from the row.
import { readFileSync } from 'node:fs';
import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from './auth.js';

export const placesRouter = Router();
placesRouter.use(requireAuth);

interface Hospital { name: string; address: string; city: string; state: string; zip: string; phone: string; type: string; er: boolean; lat: number; lng: number }
export interface Place { name: string; address: string; phone: string; lat: number; lng: number; miles: number; er?: boolean; kind: 'hospital' | 'urgent'; source: 'cms' | 'osm' | 'google' }

let hospitals: Hospital[] | null = null;
function loadHospitals(): Hospital[] {
  if (hospitals) return hospitals;
  try {
    const raw = JSON.parse(readFileSync(new URL('../data/hospitals-ne.json', import.meta.url), 'utf8')) as { rows: Hospital[] };
    hospitals = raw.rows;
  } catch (err) {
    console.error('hospitals list not loaded:', err);
    hospitals = [];
  }
  return hospitals;
}

/** straight-line miles between two points */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestHospitals(at: { lat: number; lng: number }, limit: number): Place[] {
  return loadHospitals()
    .filter((h) => h.er)
    .map((h) => ({ name: h.name, address: `${h.address}, ${h.city}, ${h.state} ${h.zip}`, phone: h.phone, lat: h.lat, lng: h.lng, miles: milesBetween(at, h), er: true, kind: 'hospital' as const, source: 'cms' as const }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, limit);
}

/** Urgent care from OpenStreetMap — the same map the app already draws on */
async function nearestUrgentCare(at: { lat: number; lng: number }, limit: number): Promise<Place[]> {
  const radius = 25000; // metres
  const q = `[out:json][timeout:10];(
    nwr["healthcare"="urgent_care"](around:${radius},${at.lat},${at.lng});
    nwr["amenity"="clinic"]["urgent_care"="yes"](around:${radius},${at.lat},${at.lng});
    nwr["amenity"="clinic"]["name"~"[Uu]rgent [Cc]are"](around:${radius},${at.lat},${at.lng});
  );out center tags;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ShotLog (contact sheet; jobsite urgent care lookup)' },
      body: 'data=' + encodeURIComponent(q),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    const seen = new Set<string>();
    return data.elements
      .map((e): Place | null => {
        const t = e.tags ?? {};
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (lat === undefined || lng === undefined || !t.name) return null;
        const address = [t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : t['addr:street'], t['addr:city'], t['addr:state']].filter(Boolean).join(', ');
        return { name: t.name, address, phone: t.phone ?? t['contact:phone'] ?? '', lat, lng, miles: milesBetween(at, { lat, lng }), kind: 'urgent' as const, source: 'osm' as const };
      })
      .filter((p): p is Place => p !== null)
      .filter((p) => { const k = `${p.name}|${p.address}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.miles - b.miles)
      .slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

/** With a Google Places key, fill the phones OpenStreetMap does not carry */
async function fillPhones(places: Place[]): Promise<Place[]> {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return places;
  const out: Place[] = [];
  for (const p of places) {
    if (p.phone) { out.push(p); continue; }
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.nationalPhoneNumber,places.formattedAddress' },
        body: JSON.stringify({ textQuery: `${p.name} ${p.address}`, locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 2000 } }, maxResultCount: 1 }),
      });
      const body = (await res.json()) as { places?: { nationalPhoneNumber?: string; formattedAddress?: string }[] };
      const hit = body.places?.[0];
      out.push(hit?.nationalPhoneNumber ? { ...p, phone: hit.nationalPhoneNumber, address: p.address || hit.formattedAddress || '', source: 'google' } : p);
    } catch {
      out.push(p);
    }
  }
  return out;
}

placesRouter.get('/nearest', async (req: AuthedRequest, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const kind = req.query.kind === 'urgent' ? 'urgent' : 'hospital';
  const limit = Math.min(5, Math.max(1, Number(req.query.limit) || 3));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat and lng required' });
    return;
  }
  try {
    const places = kind === 'hospital' ? nearestHospitals({ lat, lng }, limit) : await fillPhones(await nearestUrgentCare({ lat, lng }, limit));
    res.json({ kind, places, phonesFrom: process.env.GOOGLE_PLACES_KEY ? 'google' : kind === 'hospital' ? 'cms' : 'osm' });
  } catch (err) {
    console.error('nearest lookup failed:', err);
    res.status(502).json({ error: kind === 'urgent' ? 'the map service did not answer — try again, or type the urgent care by hand' : 'the hospital list is not available' });
  }
});

/** The drive, from our own router (OSRM) when one is configured */
placesRouter.get('/route', async (req: AuthedRequest, res: Response) => {
  const routerUrl = process.env.ROUTER_URL;
  if (!routerUrl) {
    res.json({ router: 'off' });
    return;
  }
  const parse = (s: unknown) => { const [a, b] = String(s ?? '').split(',').map(Number); return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null; };
  const from = parse(req.query.from);
  const to = parse(req.query.to);
  if (!from || !to) {
    res.status(400).json({ error: 'from and to as lat,lng' });
    return;
  }
  try {
    const url = `${routerUrl.replace(/\/$/, '')}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&steps=true`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`router ${r.status}`);
    const data = (await r.json()) as { routes?: { distance: number; duration: number; legs: { steps: { name: string; distance: number; maneuver: { type: string; modifier?: string } }[] }[] }[] };
    const route = data.routes?.[0];
    if (!route) { res.json({ router: 'on', route: null }); return; }
    const words = (s: { name: string; distance: number; maneuver: { type: string; modifier?: string } }) => {
      const mi = s.distance / 1609.34;
      const dist = mi >= 0.1 ? ` · ${mi.toFixed(1)} mi` : mi > 0 ? ` · ${Math.round(s.distance * 3.28084)} ft` : '';
      const road = s.name ? ` onto ${s.name}` : '';
      const m = s.maneuver;
      if (m.type === 'depart') return `Head ${m.modifier ?? 'out'}${s.name ? ` on ${s.name}` : ''}${dist}`;
      if (m.type === 'arrive') return `Arrive${m.modifier ? ` · destination on the ${m.modifier}` : ''}`;
      if (m.type === 'roundabout' || m.type === 'rotary') return `At the roundabout, take the exit${road}${dist}`;
      const turn = m.modifier ? m.modifier.replace('slight ', 'bear ').replace('sharp ', 'turn sharp ') : m.type;
      return `${/^bear|^turn/.test(turn) ? turn.charAt(0).toUpperCase() + turn.slice(1) : `Turn ${turn}`}${road}${dist}`;
    };
    res.json({ router: 'on', route: { miles: +(route.distance / 1609.34).toFixed(1), minutes: Math.round(route.duration / 60), steps: route.legs.flatMap((l) => l.steps).map(words) } });
  } catch (err) {
    console.error('route failed:', err);
    res.status(502).json({ error: 'the router did not answer' });
  }
});
