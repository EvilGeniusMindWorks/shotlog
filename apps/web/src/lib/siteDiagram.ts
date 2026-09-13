// Site diagram model — map annotations persisted as JSON in
// Shot.designPlan.siteSketchData (Spec §5.2).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StructurePin extends LatLng {
  id: string;
  label: string;
}

export interface SiteDiagram {
  center: LatLng | null;
  zoom: number;
  baseLayer: 'street' | 'satellite';
  blastPin: LatLng | null;
  structures: StructurePin[];
  /** S12 (Matthew, Sep 13 2026): a distance ring around the blast pin, in
   *  feet — "what stands within 250 ft". Saved per shot; printed. Not a
   *  regulatory number (the charge ring waits for the engineer's sign-off). */
  ringFt: number;
}

export const RING_DEFAULT_FT = 250;
export const RING_MIN_FT = 50;
export const RING_MAX_FT = 2000;
export const FT_PER_M = 3.280839895;

export function clampRing(ft: unknown): number {
  const n = typeof ft === 'number' && Number.isFinite(ft) ? ft : RING_DEFAULT_FT;
  return Math.min(RING_MAX_FT, Math.max(RING_MIN_FT, Math.round(n)));
}

export function emptySiteDiagram(): SiteDiagram {
  return { center: null, zoom: 17, baseLayer: 'satellite', blastPin: null, structures: [], ringFt: RING_DEFAULT_FT };
}

export function parseSiteDiagram(json: string | null): SiteDiagram {
  if (!json) return emptySiteDiagram();
  try {
    const p = JSON.parse(json) as Partial<SiteDiagram>;
    return {
      center: p.center ?? null,
      zoom: p.zoom ?? 17,
      baseLayer: p.baseLayer ?? 'satellite',
      blastPin: p.blastPin ?? null,
      structures: p.structures ?? [],
      ringFt: clampRing(p.ringFt),
    };
  } catch {
    return emptySiteDiagram();
  }
}

export function serializeSiteDiagram(d: SiteDiagram): string {
  return JSON.stringify(d);
}

const EARTH_RADIUS_FT = 20_902_231; // mean radius in feet

/** Great-circle distance between two points, in feet (haversine) */
export function distanceFt(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_FT * Math.asin(Math.sqrt(h));
}

/** Nearest structure pin to the blast pin, with its distance */
export function closestStructure(
  d: SiteDiagram,
): { pin: StructurePin; distance: number } | null {
  if (!d.blastPin || d.structures.length === 0) return null;
  let best: { pin: StructurePin; distance: number } | null = null;
  for (const pin of d.structures) {
    const dist = distanceFt(d.blastPin, pin);
    if (!best || dist < best.distance) best = { pin, distance: dist };
  }
  return best;
}

/** Every structure with its distance, split by the ring, nearest first */
export function structuresByRing(d: SiteDiagram): {
  inside: { pin: StructurePin; distance: number }[];
  outside: { pin: StructurePin; distance: number }[];
} {
  if (!d.blastPin) return { inside: [], outside: d.structures.map((pin) => ({ pin, distance: NaN })) };
  const blast = d.blastPin;
  const all = d.structures
    .map((pin) => ({ pin, distance: distanceFt(blast, pin) }))
    .sort((a, b) => a.distance - b.distance);
  return { inside: all.filter((x) => x.distance <= d.ringFt), outside: all.filter((x) => x.distance > d.ringFt) };
}

/** The caption under the printed map: "Ring 250 ft · within: Stevens residence 180', Barn 230'" */
export function ringCaption(d: SiteDiagram, maxChars = 110): string {
  if (!d.blastPin) return '';
  const { inside } = structuresByRing(d);
  const head = `Ring ${d.ringFt} ft`;
  if (inside.length === 0) return `${head} · nothing inside`;
  const parts = inside.map((x) => `${x.pin.label} ${Math.round(x.distance)}'`);
  let out = `${head} · within: `;
  let n = 0;
  for (const p of parts) {
    const next = out + (n ? ', ' : '') + p;
    if (next.length > maxChars) break;
    out = next;
    n++;
  }
  return n < parts.length ? `${out} +${parts.length - n} more` : out;
}

// one degree of latitude on the same sphere distanceFt uses (2π·R / 360)
const FT_PER_DEG_LAT = (2 * Math.PI * EARTH_RADIUS_FT) / 360;

/** A point `ft` feet east of `p` — used to size the ring in screen pixels */
export function pointEast(p: LatLng, ft: number): LatLng {
  return { lat: p.lat, lng: p.lng + ft / (FT_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)) };
}

/** A point `ft` feet from `p` on a compass bearing (degrees, 0 = north) */
export function pointAt(p: LatLng, ft: number, bearingDeg: number): LatLng {
  const b = (bearingDeg * Math.PI) / 180;
  return {
    lat: p.lat + (ft * Math.cos(b)) / FT_PER_DEG_LAT,
    lng: p.lng + (ft * Math.sin(b)) / (FT_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)),
  };
}
