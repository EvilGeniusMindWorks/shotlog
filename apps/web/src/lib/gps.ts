// One GPS fix, promised (Round S11, Sep 13 2026). The site map keeps its own
// ten-second watch; this is for the moments that need one answer — sorting
// "Which job?" by distance, saving where the person is standing. S12's
// where-I-am dot builds on the same shape.

export interface GpsFix {
  lat: number;
  lng: number;
  /** metres, from the device */
  accuracy: number;
  at: number;
}

export type GpsFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

const STATE_KEY = 'shotlog-gps-pref';

/** "Use my location" toggle, remembered per device. Default on. */
export function gpsPreferred(): boolean {
  try {
    return localStorage.getItem(STATE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setGpsPreferred(on: boolean) {
  try {
    localStorage.setItem(STATE_KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

/** Resolve to a fix, or to a named failure — never rejects. */
export function getFix(opts: { timeoutMs?: number; maxAgeMs?: number } = {}): Promise<GpsFix | GpsFailure> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve('unsupported');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: p.timestamp,
        }),
      (err) => resolve(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: opts.timeoutMs ?? 8000, maximumAge: opts.maxAgeMs ?? 60_000 },
    );
  });
}

export function isFix(x: unknown): x is GpsFix {
  return typeof x === 'object' && x !== null && 'lat' in x;
}

export const GPS_FAILURE_TEXT: Record<GpsFailure, string> = {
  unsupported: 'This device has no location service.',
  denied: "Location is off for ShotLog in the phone's settings.",
  unavailable: 'No location fix right now.',
  timeout: 'Location took too long — try again outside.',
};

/** Straight-line miles between two points (haversine). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtMiles(mi: number): string {
  if (mi < 0.1) return 'here';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}
