// The weather from the National Weather Service (Round S13). Verified Sep 14
// 2026 against api.weather.gov: /points → the station list (NOT reliably
// sorted — pick the nearest by distance) → the station's latest observation.
// CORS is open; the browser sends its own User-Agent. Anything missing or
// failing returns null — the card then keeps the last day's values.
import type { BlastDayConditions, NwsReading } from '@/db/schema';
import { nowISO } from '@/lib/utils';

const BASE = 'https://api.weather.gov';

interface StationFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { stationIdentifier?: string; name?: string };
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: 'application/geo+json' }, signal });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The latest observation from the nearest NWS station, or null */
export async function fetchNws(
  point: { lat: number; lng: number },
  opts: { signal?: AbortSignal; precip?: boolean } = {},
): Promise<NwsReading | null> {
  try {
    const pt = await getJson<{ properties?: { observationStations?: string } }>(
      `${BASE}/points/${point.lat.toFixed(4)},${point.lng.toFixed(4)}`,
      opts.signal,
    );
    const stationsUrl = pt?.properties?.observationStations;
    if (!stationsUrl) return null;
    const list = await getJson<{ features?: StationFeature[] }>(stationsUrl, opts.signal);
    let best: StationFeature | null = null;
    let bestMi = Infinity;
    for (const f of list?.features ?? []) {
      const [lng, lat] = f.geometry?.coordinates ?? [];
      if (typeof lat !== 'number' || typeof lng !== 'number' || !f.properties?.stationIdentifier) continue;
      const mi = milesBetween(point, { lat, lng });
      if (mi < bestMi) {
        bestMi = mi;
        best = f;
      }
    }
    if (!best?.properties?.stationIdentifier) return null;
    const station = best.properties.stationIdentifier;
    const obs = await getJson<{
      properties?: {
        timestamp?: string;
        textDescription?: string;
        temperature?: { value?: number | null };
        windDirection?: { value?: number | null };
        windSpeed?: { value?: number | null };
      };
    }>(`${BASE}/stations/${station}/observations/latest`, opts.signal);
    const p = obs?.properties;
    if (!p) return null;
    const tempC = num(p.temperature?.value);
    const windKmh = num(p.windSpeed?.value);
    const reading: NwsReading = {
      station,
      name: best.properties.name ?? station,
      observedAt: p.timestamp ?? '',
      tempF: tempC === null ? null : Math.round((tempC * 9) / 5 + 32),
      text: p.textDescription ?? '',
      windDeg: num(p.windDirection?.value),
      windMph: windKmh === null ? null : Math.round(windKmh * 0.621371),
      precipIn24h: null,
      fetchedAt: nowISO(),
    };
    if (opts.precip !== false) {
      // The last 24 hours of hourly precipitation, summed — a "ground"
      // suggestion, never a fact; skipped quietly when the station has none
      try {
        const start = new Date(Date.now() - 24 * 3600e3).toISOString();
        const hist = await getJson<{ features?: { properties?: { precipitationLastHour?: { value?: number | null } } }[] }>(
          `${BASE}/stations/${station}/observations?start=${encodeURIComponent(start)}&limit=48`,
          opts.signal,
        );
        let mm = 0;
        let any = false;
        for (const f of hist?.features ?? []) {
          const v = num(f.properties?.precipitationLastHour?.value);
          if (v !== null) {
            mm += v;
            any = true;
          }
        }
        reading.precipIn24h = any ? Math.round((mm / 25.4) * 100) / 100 : null;
      } catch {
        /* the suggestion is optional */
      }
    }
    return reading;
  } catch {
    return null;
  }
}

// ── Mapping a reading onto the card ─────────────────────────────────────────

/** Cool below 40°F, moderate to 70, warm above (design page, Sep 14 2026) */
export function tempRange(tempF: number): BlastDayConditions['temperatureRange'] {
  if (tempF < 40) return 'low';
  if (tempF <= 70) return 'mod';
  return 'high';
}

export function weatherFromText(text: string): BlastDayConditions['weather'] | undefined {
  const t = text.toLowerCase();
  if (!t) return undefined;
  if (/thunder|heavy rain|heavy shower/.test(t)) return 'rain_heavy';
  if (/rain|drizzle|shower|sleet|snow|freezing/.test(t)) return 'rain_light';
  if (/partly|few clouds|scattered/.test(t)) return 'partly_cloudy';
  if (/cloud|overcast|fog|mist|haze|smoke/.test(t)) return 'cloudy';
  if (/clear|sunny|fair/.test(t)) return 'sunny';
  return undefined;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassFromDeg(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return POINTS[i];
}

/** Ground is only SUGGESTED: rain in the last day says wet, freezing says frozen */
export function groundSuggestion(r: NwsReading): BlastDayConditions['groundConditions'] | undefined {
  if (r.tempF !== null && r.tempF <= 32) return 'frozen';
  if (r.precipIn24h !== null && r.precipIn24h > 0.1) return 'wet';
  return undefined;
}

export interface NwsCardFill {
  temperatureRange?: BlastDayConditions['temperatureRange'];
  weather?: BlastDayConditions['weather'];
  windDirection?: string;
  groundSuggested?: BlastDayConditions['groundConditions'];
}

export function nwsToCard(r: NwsReading): NwsCardFill {
  const out: NwsCardFill = {};
  if (r.tempF !== null) out.temperatureRange = tempRange(r.tempF);
  const w = weatherFromText(r.text);
  if (w) out.weather = w;
  if (r.windDeg !== null && (r.windMph === null || r.windMph > 0)) out.windDirection = compassFromDeg(r.windDeg);
  const g = groundSuggestion(r);
  if (g) out.groundSuggested = g;
  return out;
}

/** "NWS 6:28 am · Westfield, 57°F, Mostly Cloudy" */
export function nwsLine(r: NwsReading): string {
  const parts = [r.name.split(',')[0]];
  if (r.tempF !== null) parts.push(`${r.tempF}°F`);
  if (r.text) parts.push(r.text);
  return parts.join(', ');
}
