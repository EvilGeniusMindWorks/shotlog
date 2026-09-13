// Nearby jobs (Round S11, Sep 13 2026): jobs whose point — the job's work
// spot, else the site's address point — is within two miles of the phone
// float to the top of "Which job?" with the distance. Never picks for you;
// the fix is used on the phone for sorting only.
import { db } from '@/db';
import type { Job } from '@/db/schema';
import { milesBetween } from '@/lib/gps';
import { jobPoint } from '@/lib/siteGeo';

export const NEARBY_MILES = 2;

export interface PickJob {
  id: string;
  name: string;
  customer: string;
  jobNumber?: string;
  /** work spot or the site's address point, when there is one */
  point: { lat: number; lng: number } | null;
  siteName?: string;
  siteId?: string;
}

export async function pickJobsFor(jobs: Job[]): Promise<PickJob[]> {
  const out: PickJob[] = [];
  for (const j of jobs) {
    const site = j.siteId ? await db.sites.get(j.siteId) : undefined;
    out.push({ id: j.id, name: j.name, customer: j.customer, jobNumber: j.jobNumber, point: jobPoint(j, site)?.point ?? null, siteName: site?.name, siteId: j.siteId });
  }
  return out;
}

/** Nearby first (by distance), then the rest in the order given. */
export function orderByDistance<T extends { point: { lat: number; lng: number } | null }>(
  jobs: T[],
  here: { lat: number; lng: number } | null,
): (T & { miles: number | null; nearby: boolean })[] {
  const withMiles = jobs.map((j) => {
    const miles = here && j.point ? milesBetween(here, j.point) : null;
    return { ...j, miles, nearby: miles != null && miles <= NEARBY_MILES };
  });
  if (!here) return withMiles;
  const near = withMiles.filter((j) => j.nearby).sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0));
  const rest = withMiles.filter((j) => !j.nearby);
  return [...near, ...rest];
}
