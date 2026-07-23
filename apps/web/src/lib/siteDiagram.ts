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
}

export function emptySiteDiagram(): SiteDiagram {
  return { center: null, zoom: 17, baseLayer: 'satellite', blastPin: null, structures: [] };
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
