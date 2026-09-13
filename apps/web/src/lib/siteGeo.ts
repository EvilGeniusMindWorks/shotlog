// Where a job is (Round S11, Sep 13 2026 — Matthew's shape B).
//
// The site's street address is its PRIMARY location: it becomes a map point
// (site.geo) on its own when the site is created or its address changes,
// retried at the next online moment if the phone was offline. A job may carry
// its own WORK SPOT — where this dig is on a quarry or a subdivision, set from
// the site map or GPS. Anything that needs a location reads
//   shot centre → job work spot → site address point.
import { db } from '@/db';
import type { Job, Site } from '@/db/schema';
import { nowISO } from '@/lib/utils';
import { cachedGeo, geocodeSite } from '@/lib/equipmentLocation';
import { getSessionUser } from '@/lib/session';

export interface LatLng {
  lat: number;
  lng: number;
}

const PENDING_KEY = 'shotlog-site-geo-pending';

function readPending(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function writePending(ids: string[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

/** Look the site's address up and save the point; queue it when offline or
 *  when the lookup found nothing. `force` throws away the old point first
 *  (the address changed). */
export async function ensureSiteGeo(siteId: string, opts: { force?: boolean } = {}): Promise<LatLng | null> {
  const site = await db.sites.get(siteId);
  if (!site) return null;
  if (opts.force && site.geo) {
    await db.sites.update(siteId, { geo: undefined, updatedAt: nowISO() });
    site.geo = undefined;
  }
  const hasAddress = Boolean(site.address?.trim() || site.city?.trim());
  if (!hasAddress) return null;
  if (!navigator.onLine) {
    queueSiteGeo(siteId);
    return null;
  }
  const geo = await geocodeSite(site);
  if (geo) writePending(readPending().filter((x) => x !== siteId));
  else queueSiteGeo(siteId);
  return geo;
}

export function queueSiteGeo(siteId: string) {
  const ids = readPending();
  if (!ids.includes(siteId)) writePending([...ids, siteId]);
}

/** Drain the queue: on app start and whenever the phone comes back online.
 *  One lookup at a time (the geocoder asks for that). */
export async function drainSiteGeoQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  let done = 0;
  for (const id of readPending()) {
    const site = await db.sites.get(id);
    if (!site) {
      writePending(readPending().filter((x) => x !== id));
      continue;
    }
    if (site.geo) {
      writePending(readPending().filter((x) => x !== id));
      done++;
      continue;
    }
    const geo = await geocodeSite(site);
    if (geo) {
      writePending(readPending().filter((x) => x !== id));
      done++;
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return done;
}

let installed = false;
export function installSiteGeoQueue() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('online', () => void drainSiteGeoQueue().catch(() => undefined));
  window.setTimeout(() => void drainSiteGeoQueue().catch(() => undefined), 4000);
}

/** The job's point for anything that needs one: work spot, else the site's
 *  address point (saved, or this device's cache of it). */
export function jobPoint(job: Job | undefined, site: Site | undefined): { point: LatLng; source: 'work-spot' | 'address' } | null {
  if (job?.workSpot) return { point: { lat: job.workSpot.lat, lng: job.workSpot.lng }, source: 'work-spot' };
  const g = site?.geo ?? (site ? cachedGeo(site.id) : undefined);
  return g ? { point: g, source: 'address' } : null;
}

export async function setJobWorkSpot(
  jobId: string,
  spot: LatLng,
  source: 'gps' | 'map' | 'previous-job',
): Promise<void> {
  const me = getSessionUser();
  await db.jobs.update(jobId, {
    workSpot: {
      lat: spot.lat,
      lng: spot.lng,
      setBy: me?.id,
      setByName: me?.name,
      setAt: nowISO(),
      source,
    },
    updatedAt: nowISO(),
  });
}

export async function clearJobWorkSpot(jobId: string): Promise<void> {
  await db.jobs.update(jobId, { workSpot: undefined, updatedAt: nowISO() });
}

/** Another job at the same site with a work spot — offered to a new job. */
export async function siblingWorkSpot(job: Job): Promise<{ job: Job; spot: LatLng } | null> {
  if (!job.siteId) return null;
  const siblings = (await db.jobs.where('siteId').equals(job.siteId).toArray())
    .filter((j) => j.id !== job.id && j.workSpot)
    .sort((a, b) => (b.workSpot?.setAt ?? '').localeCompare(a.workSpot?.setAt ?? ''));
  const s = siblings[0];
  return s?.workSpot ? { job: s, spot: { lat: s.workSpot.lat, lng: s.workSpot.lng } } : null;
}
