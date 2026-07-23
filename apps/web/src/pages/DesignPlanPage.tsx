import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, Grid3x3, Layers3, Map as MapIcon, Ruler } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { parseDiagram, serializeDiagram, delayCounts, type ShotDiagram } from '@/lib/shotDiagram';
import { parseSiteDiagram, serializeSiteDiagram, type SiteDiagram } from '@/lib/siteDiagram';
import { scaledDistance, predictedPPV, osmPPVLimit, usbmRI8507Limit } from '@shotlog/shared';
import type { Shot, Job, DesignPlan } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconChip } from '@/components/ui/section-card';
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
  const siblings =
    useLiveQuery(
      async () =>
        shot ? (await db.shots.where('blastLogId').equals(shot.blastLogId).toArray()).sort((a, b) => a.shotNumber - b.shotNumber) : [],
      [shot?.blastLogId],
    ) ?? [];

  if (!shot || !id) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }
  // Key by shot id so local editor state resets when navigating between shots
  return (
    <DesignPlanInner
      key={shot.id}
      blastDayId={id}
      shot={shot}
      job={job}
      siblings={siblings.filter((s) => s.id !== shot.id)}
    />
  );
}

function DesignPlanInner({
  blastDayId,
  shot,
  job,
  siblings,
}: {
  blastDayId: string;
  shot: Shot;
  job: Job | undefined;
  siblings: Shot[];
}) {
  const navigate = useNavigate();
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

  // Re-sync local editor state when the record changes underneath us — but
  // never while local edits are pending (stale state must not resurrect pins)
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

  const saveSnapshot = (blob: Blob) => {
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      return db.shots.update(shot.id, {
        designPlan: { ...current.designPlan, siteSketchImage: blob },
        updatedAt: nowISO(),
      });
    });
  };

  /** Copy the site diagram (map, pins, snapshot, distances) to a sibling shot */
  const cloneSiteTo = (targetId: string) => {
    flush();
    void db.shots.get(shot.id).then((src) => {
      if (!src) return;
      return db.shots.get(targetId).then((target) => {
        if (!target) return;
        return db.shots.update(targetId, {
          designPlan: {
            ...target.designPlan,
            siteSketchData: src.designPlan.siteSketchData,
            siteSketchImage: src.designPlan.siteSketchImage,
            closestStructureLocation: src.designPlan.closestStructureLocation,
            closestStructureDistance: src.designPlan.closestStructureDistance,
          },
          updatedAt: nowISO(),
        });
      });
    });
  };

  /** Copy the delay/wiring diagram to a sibling shot */
  const cloneDiagramTo = (targetId: string) => {
    flush();
    void db.shots.get(targetId).then((target) => {
      if (!target) return;
      return db.shots.update(targetId, {
        designPlan: { ...target.designPlan, shotDiagramData: serializeDiagram(diagram) },
        updatedAt: nowISO(),
      });
    });
  };

  // Header badge bar
  const dp = shot.designPlan;
  const sd =
    dp.closestStructureDistance > 0 && dp.maxPoundsPerDelay > 0
      ? scaledDistance(dp.closestStructureDistance, dp.maxPoundsPerDelay)
      : 0;
  const ppv = sd > 0 ? predictedPPV(dp.kFactor || (job?.kFactor ?? 180), sd) : 0;
  const osmLimit = dp.closestStructureDistance > 0 ? osmPPVLimit(dp.closestStructureDistance) : 0;
  const usbmLimit = usbmRI8507Limit(15);
  const painted = Object.keys(diagram.delays).length;
  const maxHolesPainted = Math.max(0, ...delayCounts(diagram).values());

  const cloneTargets = siblings.map((s) => ({ id: s.id, label: `Shot #${s.shotNumber}` }));

  return (
    <div>
      {/* Navy context header */}
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate(`/blast-day/${blastDayId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight truncate">
              Design Plan — Shot #{shot.shotNumber}
            </h2>
            <p className="text-xs text-navy-200 truncate">
              {[job?.name, shot.time, shot.totals.numHoles > 0 && `${shot.totals.numHoles} holes`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {/* Compliance badge bar */}
      <div className="px-4 py-2 bg-gray-50">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-2">
          {sd > 0 ? (
            <>
              <Badge variant={ppv <= usbmLimit ? 'compliant' : 'violation'}>
                {ppv <= usbmLimit ? '✓' : '✗'} USBM RI8507
              </Badge>
              <Badge variant={ppv <= osmLimit ? 'compliant' : 'violation'}>
                {ppv <= osmLimit ? '✓' : '✗'} OSM
              </Badge>
              <Badge variant="compliant">✓ SD = {sd.toFixed(1)}</Badge>
              <Badge variant="compliant">✓ PPV = {ppv.toFixed(2)} in/s</Badge>
            </>
          ) : (
            <Badge variant="draft">Enter structure distance + max lbs/delay for compliance</Badge>
          )}
          {maxHolesPainted > 0 && (
            <Badge variant="secondary">Max holes/delay: {maxHolesPainted}</Badge>
          )}
        </div>
      </div>

      {/* 2×2 panel grid (wireframe §5) */}
      <div className="p-4 max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-4 items-start pb-12">
        <Panel
          icon={<IconChip tint="green"><MapIcon className="h-4 w-4" /></IconChip>}
          title="Site Diagram"
          subtitle={
            siteDiagram.blastPin
              ? `${siteDiagram.structures.length} structure${siteDiagram.structures.length === 1 ? '' : 's'} pinned · ${siteDiagram.baseLayer}`
              : 'Find the site, pin the blast & structures'
          }
        >
          <SiteDiagramEditor
            value={siteDiagram}
            onChange={handleSiteChange}
            jobAddress={
              job ? [job.address, job.city, job.state].filter(Boolean).join(', ') : undefined
            }
            onUseClosest={useClosestForCompliance}
            onSnapshot={saveSnapshot}
            cloneTargets={cloneTargets}
            onClone={cloneSiteTo}
          />
        </Panel>

        <Panel
          icon={<IconChip tint="navy"><Grid3x3 className="h-4 w-4" /></IconChip>}
          title="Shot Diagram"
          subtitle={painted > 0 ? `${painted} holes painted · ${diagram.wires.length} wires` : 'Tap delay, then paint holes'}
        >
          <ShotDiagramEditor
            diagram={diagram}
            onChange={handleChange}
            cloneTargets={cloneTargets}
            onClone={cloneDiagramTo}
          />
        </Panel>

        <Panel
          icon={<IconChip tint="red"><Ruler className="h-4 w-4" /></IconChip>}
          title="Structure & Compliance"
          subtitle={
            dp.closestStructureLocation
              ? `${dp.closestStructureLocation} · ${dp.closestStructureDistance} ft`
              : 'Closest structure & charge limits'
          }
          complete={sd > 0}
        >
          <ComplianceInputs shot={shot} job={job} defaultK={job?.kFactor ?? 180} />
        </Panel>

        <Panel
          icon={<IconChip tint="gray"><Layers3 className="h-4 w-4" /></IconChip>}
          title="Typical Column"
          subtitle="Borehole loading profile"
        >
          <TypicalColumnBuilder shotId={shot.id} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  complete,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-tight">{title}</div>
          {subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</div>}
        </div>
        {complete && (
          <span className="h-5 w-5 rounded-full border-2 border-compliant text-compliant flex items-center justify-center">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Structure & compliance inputs — auto-calc box, worked formula, full regulation stack */
function ComplianceInputs({
  shot,
  job,
  defaultK,
}: {
  shot: Shot;
  job: Job | undefined;
  defaultK: number;
}) {
  const dp = shot.designPlan;

  const update = (field: keyof DesignPlan, value: string | number) => {
    void db.shots.get(shot.id).then((current) => {
      if (!current) return;
      const plan = { ...current.designPlan, [field]: value };
      if (plan.closestStructureDistance > 0 && plan.maxPoundsPerDelay > 0) {
        plan.scaledDistance = scaledDistance(plan.closestStructureDistance, plan.maxPoundsPerDelay);
        const k = plan.kFactor || defaultK;
        plan.predictedPPV =
          plan.scaledDistance > 0 && k > 0 ? predictedPPV(k, plan.scaledDistance) : 0;
      }
      return db.shots.update(shot.id, { designPlan: plan, updatedAt: nowISO() });
    });
  };
  const num = (field: keyof DesignPlan) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update(field, parseFloat(e.target.value) || 0);

  const k = dp.kFactor || defaultK;
  const usbmLimit = usbmRI8507Limit(15);
  const osmLimit = dp.closestStructureDistance > 0 ? osmPPVLimit(dp.closestStructureDistance) : null;

  // Regulation stack (Spec §16): federal + state (auto by job address) + local override
  const regs: { name: string; limit: number; note?: string }[] = [];
  if (dp.predictedPPV > 0) {
    regs.push({ name: 'USBM RI 8507', limit: usbmLimit, note: '15 Hz est' });
    if (osmLimit !== null) {
      regs.push({
        name: 'OSMRE',
        limit: osmLimit,
        note:
          dp.closestStructureDistance <= 300
            ? '0–300 ft'
            : dp.closestStructureDistance <= 5000
              ? '301–5,000 ft'
              : '> 5,000 ft',
      });
    }
    if (job?.state === 'MA') regs.push({ name: 'MA 540 CMR', limit: 2.0 });
    if (job?.localPPVLimit && job.localPPVLimit > 0) {
      regs.push({ name: job.localRegName || 'Local Bylaw', limit: job.localPPVLimit, note: 'override' });
    }
  }
  const mostRestrictive = regs.length
    ? regs.reduce((a, b) => (b.limit < a.limit ? b : a))
    : null;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">Closest Structure</Label>
        <Input
          defaultValue={dp.closestStructureLocation}
          onBlur={(e) => update('closestStructureLocation', e.target.value)}
          placeholder="Stevens residence — NE corner"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['closestStructureDistance', 'Distance (ft)'],
            ['maxPoundsPerDelay', 'Max Lbs/Delay'],
            ['closestBoreholeDistance', 'Closest Borehole (ft)'],
            ['maxHolesPerDelay', 'Max Holes/Delay'],
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
      </div>

      {/* Auto-calculated box */}
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">Auto-Calculated</Label>
        <div className="border border-gray-200 rounded-lg grid grid-cols-3 divide-x divide-gray-200 mt-1">
          <div className="p-2.5">
            <div className="text-[10px] text-gray-400">Scaled Distance</div>
            <div className="font-mono font-bold text-blue-600">
              {dp.scaledDistance > 0 ? dp.scaledDistance.toFixed(1) : '—'}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] text-gray-400">Predicted PPV</div>
            <div className="font-mono font-bold text-compliant">
              {dp.predictedPPV > 0 ? dp.predictedPPV.toFixed(2) : '—'}
            </div>
          </div>
          <div className="p-2.5">
            <div className="text-[10px] text-gray-400">K Factor</div>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                inputMode="decimal"
                className="h-7 border-0 px-0 font-mono font-bold focus-visible:ring-0"
                defaultValue={dp.kFactor || defaultK}
                onBlur={num('kFactor')}
              />
            </div>
          </div>
        </div>
        {dp.scaledDistance > 0 && (
          <p className="text-[11px] text-gray-400 font-mono mt-1">
            SD = {dp.closestStructureDistance} / √{dp.maxPoundsPerDelay} ={' '}
            {dp.scaledDistance.toFixed(1)} &nbsp;|&nbsp; PPV = {k} × {dp.scaledDistance.toFixed(1)}
            ^-1.6 = {dp.predictedPPV.toFixed(2)}
          </p>
        )}
      </div>

      {/* Regulation check */}
      {regs.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-gray-500">
            Regulation Check
          </Label>
          <div className="space-y-1.5 mt-1">
            {regs.map((r) => {
              const pass = dp.predictedPPV <= r.limit;
              return (
                <div
                  key={r.name}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
                    pass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}
                >
                  <span className={pass ? 'text-compliant' : 'text-violation'}>
                    {pass ? '✓' : '✗'}
                  </span>
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-gray-500 flex-1">
                    — PPV {dp.predictedPPV.toFixed(2)} {pass ? '<' : '>'} {r.limit.toFixed(2)} in/s
                    {r.note && ` (${r.note})`}
                  </span>
                  <span className={`text-[10px] font-bold ${pass ? 'text-compliant' : 'text-violation'}`}>
                    {pass ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              );
            })}
          </div>
          {mostRestrictive && (
            <p className="text-[11px] text-gray-500 mt-1.5">
              Most restrictive limit: <b>{mostRestrictive.limit.toFixed(2)} in/s</b> (
              {mostRestrictive.name}) —{' '}
              <b className={dp.predictedPPV / mostRestrictive.limit <= 1 ? 'text-compliant' : 'text-violation'}>
                {Math.round((dp.predictedPPV / mostRestrictive.limit) * 100)}% of limit
              </b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
