// Where the work is (Round S11, Sep 13 2026 — Matthew's shape B). The site's
// address is the primary location and becomes a map point on its own; this
// job may carry a WORK SPOT (the bench, the lot) set from GPS here, from the
// site map on a day, or copied from the previous job at the same site.
import { useEffect, useState } from 'react';
import { Crosshair, MapPin, Trash2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import type { Job, Site } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { showToast } from '@/components/ui/undo-toast';
import { can } from '@/lib/perms';
import { formatLatLng } from '@/lib/geo';
import { fmtMiles, getFix, isFix, milesBetween, GPS_FAILURE_TEXT } from '@/lib/gps';
import { clearJobWorkSpot, ensureSiteGeo, setJobWorkSpot, siblingWorkSpot } from '@/lib/siteGeo';

export function JobLocationCard({ job, site }: { job: Job; site: Site | undefined }) {
  const canEdit = can('jobs', 'PATCH');
  const [busy, setBusy] = useState<string | null>(null);
  const sibling = useLiveQuery(() => siblingWorkSpot(job), [job.id, job.siteId, job.workSpot?.setAt]);
  // A site with an address but no point yet: try once more when this card opens
  useEffect(() => {
    if (site && !site.geo && (site.address || site.city) && navigator.onLine) void ensureSiteGeo(site.id).catch(() => undefined);
  }, [site?.id, site?.geo, site?.address, site?.city]);

  const addressPoint = site?.geo ?? null;
  const spot = job.workSpot ?? null;
  const fromAddress = spot && addressPoint ? milesBetween(spot, addressPoint) : null;

  const useGps = async () => {
    setBusy('gps');
    try {
      const f = await getFix({ timeoutMs: 12_000 });
      if (!isFix(f)) {
        showToast(GPS_FAILURE_TEXT[f]);
        return;
      }
      await setJobWorkSpot(job.id, { lat: f.lat, lng: f.lng }, 'gps');
      showToast(`Work spot saved (±${Math.round(f.accuracy * 3.281)} ft)`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card data-job-location>
      <CardHeader>
        <CardTitle className="text-base">Where the work is</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Address point <span className="text-xs font-normal text-gray-400">· the site's main location</span></p>
            <p className="text-xs text-gray-500" data-job-address-point={addressPoint ? 'yes' : 'no'}>
              {addressPoint
                ? `${formatLatLng(addressPoint)} · from ${[site?.address, site?.city].filter(Boolean).join(', ') || 'the address'}`
                : site?.address || site?.city
                  ? navigator.onLine
                    ? 'Looking the address up…'
                    : 'Looked up when the phone is next online.'
                  : 'The site has no address yet — add one on the site page.'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Crosshair className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Work spot <span className="text-xs font-normal text-gray-400">· where this job's dig is</span></p>
            {spot ? (
              <p className="text-xs text-gray-500" data-job-work-spot="yes">
                {formatLatLng(spot)} · set by {spot.setByName ?? 'someone'}
                {spot.setAt ? ` on ${new Date(spot.setAt).toLocaleDateString()}` : ''}
                {spot.source === 'gps' ? ' from GPS' : spot.source === 'map' ? ' on the site map' : spot.source === 'previous-job' ? ' from the previous job' : ''}
                {fromAddress != null && ` · ${fmtMiles(fromAddress)} from the address`}
              </p>
            ) : (
              <p className="text-xs text-gray-500" data-job-work-spot="no">
                None yet — nearby jobs and the map use the address point. Set one when the dig is away from the street address.
              </p>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void useGps()} data-job-spot-gps>
                  <Crosshair className="h-4 w-4 mr-1" /> {busy === 'gps' ? 'Finding you…' : 'Use where I am'}
                </Button>
                {sibling && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy != null}
                    data-job-spot-previous
                    onClick={() => void setJobWorkSpot(job.id, sibling.spot, 'previous-job').then(() => showToast(`Using ${sibling.job.name}'s spot`))}
                  >
                    Use {sibling.job.name}'s spot
                  </Button>
                )}
                {spot && (
                  <Button size="sm" variant="ghost" className="text-red-700" disabled={busy != null} onClick={() => void clearJobWorkSpot(job.id)} data-job-spot-clear>
                    <Trash2 className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1">On a day's site map, "Save as this job's work spot" puts it on the blast pin.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
