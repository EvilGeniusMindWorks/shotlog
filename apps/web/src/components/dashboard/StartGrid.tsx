// Doc-first launcher: big Start tiles per document type. Job-scoped docs get
// a one-tap job pick (skipped entirely when there's a single active job); the
// work-day container is found-or-created quietly by openTodaysDoc.
// S11 (Matthew, Sep 13 2026): "Which job?" knows where the phone is —
// jobs within two miles float up with the distance; never picks for you;
// the fix is used on the phone for sorting only. A job with no point at all
// (no work spot, site without an address point) offers to remember where
// the person is standing as the job's work spot before it opens.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bomb,
  ClipboardCheck,
  ClipboardList,
  Drill,
  X,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { openTodaysDoc, type LauncherDoc } from '@/hooks/useLauncher';
import { createIncident } from '@/pages/admin/AdminIncidentsPage';
import type { IncidentType } from '@/db/schema';
import { IconChip } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/perms';
import { fmtMiles, getFix, gpsPreferred, isFix, setGpsPreferred, GPS_FAILURE_TEXT, type GpsFix, type GpsFailure } from '@/lib/gps';
import { setJobWorkSpot } from '@/lib/siteGeo';

import { orderByDistance, pickJobsFor, type PickJob } from '@/lib/nearbyJobs';

type Tile =
  | { kind: LauncherDoc; label: string; hint: string; icon: JSX.Element }
  | { kind: 'checklist'; label: string; hint: string; icon: JSX.Element }
  | { kind: 'incident'; label: string; hint: string; icon: JSX.Element };

const TILES: Record<string, Tile> = {
  blast_day: {
    kind: 'blast_day',
    label: 'Blast Day',
    hint: 'Blast log + daily report',
    icon: <IconChip tint="orange"><Bomb className="h-4 w-4" /></IconChip>,
  },
  drill_plan: {
    kind: 'drill_plan',
    label: 'Drill Plan',
    hint: 'Design the pattern, send to drillers',
    icon: <IconChip tint="navy"><Drill className="h-4 w-4" /></IconChip>,
  },
  drill_log: {
    kind: 'drill_log',
    label: 'Drill Log',
    hint: 'Start logging holes',
    icon: <IconChip tint="navy"><Drill className="h-4 w-4" /></IconChip>,
  },
  daily_report: {
    kind: 'daily_report',
    label: 'Daily Report',
    hint: 'Crew, equipment, materials',
    icon: <IconChip tint="blue"><ClipboardList className="h-4 w-4" /></IconChip>,
  },
  checklist: {
    kind: 'checklist',
    label: 'Rig Checklist',
    hint: 'Daily rock-drill checks',
    icon: <IconChip tint="green"><ClipboardCheck className="h-4 w-4" /></IconChip>,
  },
  incident: {
    kind: 'incident',
    label: 'Incident',
    hint: 'Complaint, strike, or damage',
    icon: <IconChip tint="red"><AlertTriangle className="h-4 w-4" /></IconChip>,
  },
};

const ROLE_TILES: Record<string, (keyof typeof TILES)[]> = {
  blaster: ['blast_day', 'drill_plan', 'daily_report', 'checklist', 'incident'],
  supervisor: ['blast_day', 'drill_plan', 'daily_report', 'checklist', 'incident'],
  // Round 3: the driller's no-plan drill-log tile is RETIRED — drilling
  // starts from a plan (trio home), even a trivial one on small jobs
  driller: ['checklist', 'daily_report', 'incident'],
};

export function StartGrid({ role }: { role: string }) {
  const navigate = useNavigate();
  const [pickFor, setPickFor] = useState<LauncherDoc | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobs =
    useLiveQuery(async () => {
      const xs = [...(await db.jobs.filter((j) => j.isActive).toArray())].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      return pickJobsFor(xs);
    }) ?? [];

  const tiles = (ROLE_TILES[role] ?? []).map((k) => TILES[k]);
  if (tiles.length === 0) return null;

  const launch = async (kind: LauncherDoc, jobId: string) => {
    setBusy(true);
    try {
      await openTodaysDoc(kind, jobId, navigate);
    } finally {
      setBusy(false);
      setPickFor(null);
    }
  };

  const tapTile = (tile: Tile) => {
    // The rig is the first question on the checklist itself (2026-09-07)
    if (tile.kind === 'checklist') return navigate('/drill-checklist');
    if (tile.kind === 'incident') return setShowIncident(true);
    // Single active job — skip the picker entirely
    if (jobs.length === 1) return void launch(tile.kind, jobs[0].id);
    setPickFor(tile.kind);
  };

  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        Start something
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            disabled={busy}
            className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-3 text-left hover:shadow-md active:scale-[0.99] transition disabled:opacity-60"
            onClick={() => tapTile(tile)}
          >
            {tile.icon}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{tile.label}</span>
              <span className="block text-[11px] text-gray-400 truncate">{tile.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {pickFor && (
        <JobPickSheet
          jobs={jobs}
          busy={busy}
          onPick={(jobId) => void launch(pickFor, jobId)}
          onClose={() => setPickFor(null)}
        />
      )}
      {showIncident && <IncidentTypeSheet onClose={() => setShowIncident(false)} />}
    </div>
  );
}

function JobPickSheet({
  jobs,
  busy,
  onPick,
  onClose,
}: {
  jobs: PickJob[];
  busy: boolean;
  onPick: (jobId: string) => void;
  onClose: () => void;
}) {
  const [useGps, setUseGps] = useState(() => gpsPreferred());
  const [fix, setFix] = useState<GpsFix | GpsFailure | 'asking' | null>(null);
  const [offer, setOffer] = useState<PickJob | null>(null);
  useEffect(() => {
    if (!useGps) {
      setFix(null);
      return;
    }
    let live = true;
    setFix('asking');
    void getFix().then((f) => live && setFix(f));
    return () => {
      live = false;
    };
  }, [useGps]);
  const here = fix && isFix(fix) ? fix : null;
  const ordered = orderByDistance(jobs, here);
  const canSaveSpot = can('jobs', 'PATCH');
  const pick = (j: PickJob) => {
    // No point at all for this job and a fix in hand: offer once, then open
    if (!j.point && here && canSaveSpot) {
      setOffer(j);
      return;
    }
    onPick(j.id);
  };
  const gpsLine = !useGps
    ? null
    : fix === 'asking'
      ? 'Finding you…'
      : fix && !isFix(fix)
        ? GPS_FAILURE_TEXT[fix]
        : here
          ? `±${Math.round(here.accuracy * 3.281)} ft`
          : null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[70vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">Which job?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer" data-jobpick-gps>
          <input
            type="checkbox"
            checked={useGps}
            onChange={(e) => {
              setUseGps(e.target.checked);
              setGpsPreferred(e.target.checked);
            }}
          />
          Use my location
          {gpsLine && <span className="text-xs text-gray-400" data-jobpick-gps-line>{gpsLine}</span>}
        </label>
        {offer && (
          <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" data-jobpick-offer>
            <p className="font-semibold">{offer.siteName ?? 'This site'} has no point on the map yet</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Save where you're standing as {offer.name}'s work spot? Next time it shows how far away it is.
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                disabled={busy}
                data-jobpick-offer-save
                onClick={() => {
                  if (here) void setJobWorkSpot(offer.id, { lat: here.lat, lng: here.lng }, 'gps');
                  onPick(offer.id);
                }}
              >
                Save and open
              </Button>
              <Button size="sm" variant="outline" disabled={busy} data-jobpick-offer-skip onClick={() => onPick(offer.id)}>
                Just open
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-1" data-jobpick-list>
          {ordered.map((j) => (
            <button
              key={j.id}
              disabled={busy}
              className="w-full flex flex-col items-start px-3 py-2.5 rounded-lg border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              onClick={() => pick(j)}
              data-jobpick-job={j.id}
              data-jobpick-nearby={j.nearby ? '1' : undefined}
            >
              <span className="text-sm font-semibold flex items-center gap-2">
                {j.name}
                {j.nearby && j.miles != null && (
                  <span className="text-[10px] font-semibold rounded-full bg-green-100 text-green-700 px-1.5 py-0.5" data-jobpick-miles>
                    {fmtMiles(j.miles)}
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                {j.customer}
                {here && !j.nearby && (j.miles != null ? ` · ${fmtMiles(j.miles)}` : ' · no address point yet')}
              </span>
            </button>
          ))}
          {jobs.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No active jobs yet — an admin can add one under Jobs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const INCIDENT_TYPES: { value: IncidentType; label: string; hint: string }[] = [
  { value: 'blasting', label: 'Blasting complaint', hint: 'Damage claim / vibration complaint' },
  { value: 'utility', label: 'Utility strike', hint: 'Gas, water, electric, comms' },
  { value: 'asset', label: 'Asset incident', hint: 'Equipment or vehicle damage' },
];

function IncidentTypeSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async (type: IncidentType) => {
    setBusy(true);
    const id = await createIncident(type);
    navigate(`/incident/${id}`);
  };
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">What happened?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.value}
              disabled={busy}
              className="w-full flex flex-col items-start px-3 py-2.5 rounded-lg border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              onClick={() => void start(t.value)}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-xs text-gray-400">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
