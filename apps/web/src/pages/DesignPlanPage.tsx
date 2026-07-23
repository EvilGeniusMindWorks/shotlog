import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { parseDiagram, serializeDiagram, delayCounts, type ShotDiagram } from '@/lib/shotDiagram';
import { parseSiteDiagram, serializeSiteDiagram, type SiteDiagram } from '@/lib/siteDiagram';
import { scaledDistance, predictedPPV, osmPPVLimit, usbmRI8507Limit } from '@shotlog/shared';
import type { Shot, Job, DesignPlan } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShotDiagramEditor } from '@/components/design/ShotDiagramEditor';
import { TypicalColumnBuilder } from '@/components/design/TypicalColumnBuilder';
import { SiteDiagramEditor } from '@/components/design/SiteDiagramEditor';

export function DesignPlanPage() {
  const { id, shotId } = useParams<{ id: string; shotId: string }>();
  const shot = useLiveQuery(() => (shotId ? db.shots.get(shotId) : undefined), [shotId]);
  const blastDay = useLiveQuery(() => (id ? db.blastDays.get(id) : undefined), [id]);
  const job = useLiveQuery(
    () => (blastDay ? db.jobs.get(blastDay.jobId) : undefined),
    [blastDay?.jobId],
  );

  if (!shot || !id) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }
  // Key by shot id so local editor state resets when navigating between shots
  return <DesignPlanInner key={shot.id} blastDayId={id} shot={shot} job={job} />;
}

/** Structure & compliance inputs — live SD/PPV recompute, pass/fail rows */
function ComplianceInputs({ shot, defaultK }: { shot: Shot; defaultK: number }) {
  const dp = shot.designPlan;

  const update = (field: keyof DesignPlan, value: string | number) => {
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      const plan = {
        ...current.designPlan,
        [field]: typeof value === 'string' ? value : value,
      };
      if (plan.closestStructureDistance > 0 && plan.maxPoundsPerDelay > 0) {
        plan.scaledDistance = scaledDistance(plan.closestStructureDistance, plan.maxPoundsPerDelay);
        const k = plan.kFactor || defaultK;
        plan.predictedPPV = plan.scaledDistance > 0 && k > 0 ? predictedPPV(k, plan.scaledDistance) : 0;
      }
      return db.shots.update(shot.id, { designPlan: plan, updatedAt: nowISO() });
    });
  };
  const num = (field: keyof DesignPlan) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update(field, parseFloat(e.target.value) || 0);

  const usbmLimit = usbmRI8507Limit(15);
  const osmLimit = dp.closestStructureDistance > 0 ? osmPPVLimit(dp.closestStructureDistance) : null;
  const rows =
    dp.predictedPPV > 0
      ? [
          { name: 'USBM RI 8507 (15 Hz est)', limit: usbmLimit },
          ...(osmLimit !== null ? [{ name: 'OSMRE', limit: osmLimit }] : []),
        ]
      : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-[10px] uppercase tracking-wide text-gray-500">
            Location of Closest Structure
          </Label>
          <Input
            defaultValue={dp.closestStructureLocation}
            onBlur={(e) => update('closestStructureLocation', e.target.value)}
            placeholder="Stevens residence — NE corner"
          />
        </div>
        {(
          [
            ['closestStructureDistance', 'Distance to Structure (ft)'],
            ['closestBoreholeDistance', 'Closest Borehole (ft)'],
            ['maxHolesPerDelay', 'Max Holes / Delay'],
            ['maxPoundsPerDelay', 'Max Lbs / Delay (W)'],
            ['kFactor', 'K Factor'],
          ] as const
        ).map(([field, label]) => (
          <div key={field}>
            <Label className="text-[10px] uppercase tracking-wide text-gray-500">{label}</Label>
            <Input
              type="number"
              inputMode="decimal"
              defaultValue={dp[field] || ''}
              onBlur={num(field)}
              placeholder="0"
            />
          </div>
        ))}
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-gray-400">Scaled Distance (auto)</Label>
          <p className="h-10 flex items-center font-mono font-bold text-navy">
            {dp.scaledDistance > 0 ? dp.scaledDistance.toFixed(1) : '—'}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {rows.map((r) => {
            const pass = dp.predictedPPV <= r.limit;
            return (
              <div key={r.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{r.name}</span>
                <span className="font-mono text-xs text-gray-500">
                  {dp.predictedPPV.toFixed(2)} vs {r.limit.toFixed(2)} in/s
                </span>
                <Badge variant={pass ? 'compliant' : 'violation'}>{pass ? 'PASS' : 'FAIL'}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DesignPlanInner({
  blastDayId,
  shot,
  job,
}: {
  blastDayId: string;
  shot: Shot;
  job: Job | undefined;
}) {
  const navigate = useNavigate();
  // The diagram lives in local state while editing; writes are debounced
  const [diagram, setDiagram] = useState<ShotDiagram>(() =>
    parseDiagram(shot.designPlan.shotDiagramData),
  );
  const [siteDiagram, setSiteDiagram] = useState<SiteDiagram>(() =>
    parseSiteDiagram(shot.designPlan.siteSketchData),
  );
  const saveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef<{ shot?: ShotDiagram; site?: SiteDiagram }>({});

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const d = dirty.current;
    if (!d.shot && !d.site) return;
    dirty.current = {};
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      return db.shots.update(shot.id, {
        designPlan: {
          ...current.designPlan,
          ...(d.shot ? { shotDiagramData: serializeDiagram(d.shot) } : {}),
          ...(d.site ? { siteSketchData: serializeSiteDiagram(d.site) } : {}),
        },
        updatedAt: nowISO(),
      });
    });
  }, [shot.id]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  // Re-sync local editor state when the record changes underneath us (another
  // tab, devtools, sync later) — but never while local edits are pending;
  // otherwise a stale local copy can resurrect old pins over newer data.
  useEffect(() => {
    if (dirty.current.shot || dirty.current.site) return;
    setDiagram(parseDiagram(shot.designPlan.shotDiagramData));
    setSiteDiagram(parseSiteDiagram(shot.designPlan.siteSketchData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.updatedAt]);

  const handleChange = (next: ShotDiagram) => {
    setDiagram(next);
    dirty.current.shot = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };

  const handleSiteChange = (next: SiteDiagram) => {
    setSiteDiagram(next);
    dirty.current.site = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };

  const useClosestForCompliance = (distanceFeet: number, label: string) => {
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      return db.shots.update(shot.id, {
        designPlan: {
          ...current.designPlan,
          closestStructureDistance: distanceFeet,
          closestStructureLocation: label,
        },
        updatedAt: nowISO(),
      });
    });
  };

  // Rendered map image for dashboard thumbnails and printed reports
  const saveSnapshot = (blob: Blob) => {
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      return db.shots.update(shot.id, {
        designPlan: { ...current.designPlan, siteSketchImage: blob },
        updatedAt: nowISO(),
      });
    });
  };

  // Live compliance strip from the shot's design inputs
  const dp = shot.designPlan;
  const sd =
    dp.closestStructureDistance > 0 && dp.maxPoundsPerDelay > 0
      ? scaledDistance(dp.closestStructureDistance, dp.maxPoundsPerDelay)
      : 0;
  const ppv = sd > 0 ? predictedPPV(dp.kFactor, sd) : 0;
  const osmLimit = dp.closestStructureDistance > 0 ? osmPPVLimit(dp.closestStructureDistance) : 0;
  const usbmLimit = usbmRI8507Limit(15); // predicted check at 15 Hz estimate until seismo data exists
  const maxHolesPainted = Math.max(0, ...delayCounts(diagram).values());

  return (
    <div className="max-w-3xl mx-auto pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/blast-day/${blastDayId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg">Design Plan — Shot #{shot.shotNumber}</h2>
            <p className="text-sm text-gray-500 truncate">{job?.name}</p>
          </div>
        </div>
        {/* Compliance badge bar */}
        <div className="flex flex-wrap gap-2 mt-2">
          {sd > 0 ? (
            <>
              <Badge variant="secondary">SD = {sd.toFixed(1)}</Badge>
              <Badge variant="secondary">PPV = {ppv.toFixed(2)} in/s</Badge>
              <Badge variant={ppv <= osmLimit ? 'compliant' : 'violation'}>
                {ppv <= osmLimit ? '✓' : '✗'} OSM ({osmLimit.toFixed(2)})
              </Badge>
              <Badge variant={ppv <= usbmLimit ? 'compliant' : 'violation'}>
                {ppv <= usbmLimit ? '✓' : '✗'} USBM @15Hz est ({usbmLimit.toFixed(2)})
              </Badge>
            </>
          ) : (
            <Badge variant="draft">Enter structure distance + max lbs/delay for compliance</Badge>
          )}
          {maxHolesPainted > 0 && (
            <Badge variant="secondary">Max holes/delay painted: {maxHolesPainted}</Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Shot Diagram */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shot Diagram — Delay Timing & Wiring</CardTitle>
          </CardHeader>
          <CardContent>
            <ShotDiagramEditor diagram={diagram} onChange={handleChange} />
          </CardContent>
        </Card>

        {/* Structure & Compliance (wireframe §5.4) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Structure & Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <ComplianceInputs shot={shot} defaultK={job?.kFactor ?? 180} />
          </CardContent>
        </Card>

        {/* Typical Column Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Typical Column</CardTitle>
          </CardHeader>
          <CardContent>
            <TypicalColumnBuilder shotId={shot.id} />
          </CardContent>
        </Card>

        {/* Site diagram */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site Diagram</CardTitle>
          </CardHeader>
          <CardContent>
            <SiteDiagramEditor
              value={siteDiagram}
              onChange={handleSiteChange}
              jobAddress={
                job ? [job.address, job.city, job.state].filter(Boolean).join(', ') : undefined
              }
              onUseClosest={useClosestForCompliance}
              onSnapshot={saveSnapshot}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
