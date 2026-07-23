import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { parseDiagram, serializeDiagram, delayCounts, type ShotDiagram } from '@/lib/shotDiagram';
import { scaledDistance, predictedPPV, osmPPVLimit, usbmRI8507Limit } from '@shotlog/shared';
import type { Shot, Job } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShotDiagramEditor } from '@/components/design/ShotDiagramEditor';

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
  const saveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef<ShotDiagram | null>(null);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const d = dirty.current;
    if (!d) return;
    dirty.current = null;
    void db.shots
      .get(shot.id)
      .then((current) =>
        current
          ? db.shots.update(shot.id, {
              designPlan: { ...current.designPlan, shotDiagramData: serializeDiagram(d) },
              updatedAt: nowISO(),
            })
          : undefined,
      );
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

  const handleChange = (next: ShotDiagram) => {
    setDiagram(next);
    dirty.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
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

        {/* Coming panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site Diagram</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-400">
                Map with structure pins — next up
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Typical Column</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-40 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-400">
                Column builder — next up
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
