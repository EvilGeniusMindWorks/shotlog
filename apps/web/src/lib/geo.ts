// Finding a spot on the map (site-map location round, 2026-09-09).
// Coordinates in the forms people actually paste, and an address search that
// shows its candidates and falls back to a structured query for the rural
// addresses the free geocoder misses on free text.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoCandidate extends LatLng {
  label: string;
}

const DMS = /(\d{1,3})\s*[°º:]\s*(\d{1,2})\s*['′:]\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([NSEW])?/gi;

/** "42.4412, -72.6321" · "42.4412 -72.6321" · "N 42.4412 W 72.6321" ·
 *  "42°26'28.3\"N 72°37'55.6\"W" · "42.4412N, 72.6321W" — or null when the
 *  text is not a coordinate pair (then it is an address). */
export function parseCoordinates(text: string): LatLng | null {
  const t = text.trim();
  if (!t) return null;
  // degrees-minutes-seconds pairs
  const dms = [...t.matchAll(DMS)];
  if (dms.length === 2) {
    const toDec = (m: RegExpMatchArray) => {
      const d = parseFloat(m[1]);
      const mi = parseFloat(m[2] ?? '0');
      const s = parseFloat(m[3] ?? '0');
      const v = d + mi / 60 + s / 3600;
      const h = (m[4] ?? '').toUpperCase();
      return h === 'S' || h === 'W' ? -v : v;
    };
    const a = toDec(dms[0]);
    const b = toDec(dms[1]);
    return finish(a, b, dms[0][4], dms[1][4]);
  }
  // decimal pairs, with optional hemisphere letters before ("N 42 W 72") or
  // after ("42N, 72W") each number — which side is read from the first token
  const tokens = [...t.replace(/[,;°]/g, ' ').matchAll(/([NSEW])(?![a-z])|(-?\d{1,3}(?:\.\d+)?)/gi)];
  if (tokens.some((m) => m[2] === undefined && m[1] === undefined)) return null;
  const letters = tokens.filter((m) => m[1]);
  const nums: { v: number; h: string }[] = [];
  if (letters.length > 2) return null;
  const prefixed = Boolean(tokens[0]?.[1]);
  let pending = '';
  for (const m of tokens) {
    if (m[1]) {
      const h = m[1].toUpperCase();
      if (prefixed) pending = h;
      else if (nums.length) nums[nums.length - 1].h = h;
    } else {
      nums.push({ v: parseFloat(m[2]), h: pending });
      pending = '';
    }
  }
  if (nums.length !== 2 || /[a-z]{2,}/i.test(t)) return null;
  const val = (n: { v: number; h: string }) => (n.h === 'S' || n.h === 'W' ? -Math.abs(n.v) : n.v);
  return finish(val(nums[0]), val(nums[1]), nums[0].h, nums[1].h);
}

function finish(a: number, b: number, ha?: string, hb?: string): LatLng | null {
  let lat = a;
  let lng = b;
  const H = (h?: string) => (h ?? '').toUpperCase();
  if (H(ha) === 'E' || H(ha) === 'W' || H(hb) === 'N' || H(hb) === 'S') {
    lat = b;
    lng = a;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // a lone pair like "42 72" with no sign: in the western hemisphere that is a
  // longitude of -72 — the common paste from a seismograph tape
  if (lng > 0 && lat > 0 && lng > 30 && !H(hb) && !H(ha)) lng = -lng;
  return { lat, lng };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const headers = { Accept: 'application/json' };
// Nominatim's usage policy asks that an application identify itself. A
// browser cannot set User-Agent, so the Referer (sent by default cross-origin)
// plus the documented `email` parameter carry the identity (S10). Set
// VITE_CONTACT_EMAIL in the web build to a mailbox someone reads.
const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '';
/** A Nominatim search URL with the app's identity attached */
export function nominatimUrl(params: Record<string, string>): string {
  const p = new URLSearchParams({ format: 'json', ...params });
  if (CONTACT) p.set('email', CONTACT);
  return `${NOMINATIM}?${p.toString()}`;
}
const FETCH_OPTS: RequestInit = { headers, referrerPolicy: 'strict-origin-when-cross-origin' };
type Row = { lat: string; lon: string; display_name: string };

function toCandidates(rows: Row[]): GeoCandidate[] {
  return rows.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    // "Quarry Rd, Westfield, Hampden County, Massachusetts, 01085, United States" → the first three parts
    label: r.display_name.split(',').slice(0, 3).map((s) => s.trim()).join(', '),
  }));
}

/** Split "410 Quarry Rd, Westfield, MA 01085" into the structured parts Nominatim wants */
export function splitAddress(q: string): { street?: string; city?: string; state?: string } | null {
  const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].replace(/\b\d{5}(-\d{4})?\b/, '').trim();
  if (parts.length === 2) return { city: parts[0], state: last };
  return { street: parts[0], city: parts[1], state: last };
}

/** Free-text first (up to five candidates); a structured query when that finds nothing.
 *  Returns [] offline or when nothing matches; `fellBack` says the structured query ran. */
export async function searchAddress(q: string, opts: { limit?: number } = {}): Promise<{ candidates: GeoCandidate[]; fellBack: boolean }> {
  const limit = opts.limit ?? 5;
  if (!navigator.onLine) return { candidates: [], fellBack: false };
  const free = await fetch(nominatimUrl({ limit: String(limit), q }), FETCH_OPTS)
    .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
    .catch(() => [] as Row[]);
  if (free.length > 0) return { candidates: toCandidates(free), fellBack: false };
  const parts = splitAddress(q);
  if (!parts) return { candidates: [], fellBack: false };
  const params: Record<string, string> = { limit: String(limit), country: 'us' };
  if (parts.street) params.street = parts.street;
  if (parts.city) params.city = parts.city;
  if (parts.state) params.state = parts.state;
  const structured = await fetch(nominatimUrl(params), FETCH_OPTS)
    .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
    .catch(() => [] as Row[]);
  if (structured.length > 0) return { candidates: toCandidates(structured), fellBack: true };
  // the town alone, so the map at least opens in the right place
  if (parts.street && parts.city) {
    const town = { limit: '3', country: 'us', city: parts.city, ...(parts.state ? { state: parts.state } : {}) };
    const rows = await fetch(nominatimUrl(town), FETCH_OPTS)
      .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
      .catch(() => [] as Row[]);
    return { candidates: toCandidates(rows).map((c) => ({ ...c, label: `${c.label} (town — street not found)` })), fellBack: true };
  }
  return { candidates: [], fellBack: true };
}

/** "42.44121, -72.63210" for the record and the clipboard */
export function formatLatLng(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
