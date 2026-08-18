// Shot readiness review (Round 2, blaster study §4 — NEW step): plan
// intent vs what the drill actually found, hazards phrased as QUESTIONS
// (the decision logic stays in the blaster's head), and the design
// numbers that seed every shot. Confirm flows into the shots.
import { useState } from 'react';
import { db, useLiveQuery } from '@/db';
import type { BlastDay, BlastLog, HoleCondition, Shot } from '@/db/schema';
import { dayDrillLogs } from '@/hooks/useDayPhases';
import { getPlanHoles } from '@/hooks/useDrillPlans';
import { useJobContext } from '@/lib/jobContext';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import { predictedPPV, scaledDistance } from '@shotlog/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComplianceSheet } from '@/components/records/ComplianceSheet';
import { conditionText } from '@/components/day/MergedDrillingView';

function hazardQuestion(c: HoleCondition): string {
  switch (c.code) {
    case 'W':
      return `wet-hole product below ${c.fromFt} ft?`;
    case 'V':
      return 'deck through the void?';
    case 'SR':
      return `seams ${c.fromFt}–${c.toFt} ft — stemming plan?`;
    default:
      return 'load through it or adjust?';
  }
}

export function ReadinessView({
  day,
  blastLog,
  shots,
  onConfirmed,
}: {
  day: BlastDay;
  blastLog: BlastLog;
  shots: Shot[];
  onConfirmed: () => void;
}) {
  const ctx = useJobContext(day.jobId);
  const review = blastLog.readinessReview;
  const [showWhy, setShowWhy] = useState(false);

  const facts = useLiveQuery(async () => {
    const logs = await dayDrillLogs(day, shots);
    let drilled = 0;
    let footage = 0;
    const hazardRows: { holeNumber: string; text: string; question: string; who: string }[] = [];
    for (const log of logs) {
      for (const h of await db.drillLogHoles.where('drillLogId').equals(log.id).toArray()) {
        drilled++;
        footage += h.actualDepth;
        for (const c of h.conditions) {
          hazardRows.push({
            holeNumber: h.holeNumber,
            text: conditionText(h),
            question: hazardQuestion(c),
            who: log.drillerName,
          });
        }
      }
    }
    // Plan intent: the drill plans the day's shots imported from
    let planned = 0;
    let plannedFootage = 0;
    const planIds = [...new Set(shots.map((s) => s.drillPlanId).filter((p): p is string => !!p))];
    for (const planId of planIds) {
      const plan = await db.drillPlans.get(planId);
      const holes = plan ? getPlanHoles(plan) : null;
      if (holes) {
        planned += holes.length;
        plannedFootage += holes.reduce((s, h) => s + (h.holeLength ?? h.depth), 0);
      }
    }
    return { drilled, footage, planned, plannedFootage, hazardRows };
  }, [day.id, shots.map((s) => s.id).join(',')]);

  // The adjustable ceiling — defaults to the first shot's current value
  const currentMax = shots.map((s) => s.designPlan.maxPoundsPerDelay).find((v) => v > 0) ?? 0;
  const [maxLbs, setMaxLbs] = useState<string>(
    review?.maxPoundsPerDelay ? String(review.maxPoundsPerDelay) : currentMax ? String(currentMax) : '',
  );
  const [hazardNotes, setHazardNotes] = useState(review?.hazardNotes ?? '');

  const distance = shots.map((s) => s.designPlan.closestStructureDistance).find((d) => d > 0) ?? 0;
  const k = ctx?.kFactor ?? 180;
  const lbs = parseFloat(maxLbs) || 0;
  const ppv = distance > 0 && lbs > 0 ? predictedPPV(k, scaledDistance(distance, lbs)) : null;
  const limit = ctx?.localPPVLimit;
  const passes = ppv != null && limit != null ? ppv <= limit : undefined;

  const confirm = async () => {
    const me = getSessionUser();
    await db.blastLogs.update(blastLog.id, {
      readinessReview: {
        confirmedAt: nowISO(),
        confirmedBy: me?.id ?? '',
        confirmedByName: me?.name ?? '',
        maxPoundsPerDelay: lbs || undefined,
        hazardNotes: hazardNotes.trim() || undefined,
      },
      updatedAt: nowISO(),
    });
    // Seed every shot that hasn't set its own ceiling; overrides stand
    if (lbs > 0) {
      for (const s of shots) {
        if (!s.designPlan.maxPoundsPerDelay || s.designPlan.maxPoundsPerDelay === currentMax) {
          const sd = s.designPlan.closestStructureDistance > 0 ? scaledDistance(s.designPlan.closestStructureDistance, lbs) : 0;
          await db.shots.update(s.id, {
            designPlan: {
              ...s.designPlan,
              maxPoundsPerDelay: lbs,
              scaledDistance: sd,
              predictedPPV: sd > 0 ? predictedPPV(s.designPlan.kFactor || k, sd) : s.designPlan.predictedPPV,
            },
            updatedAt: nowISO(),
          });
        }
      }
    }
    onConfirmed();
  };

  return (
    <div className="space-y-3">
      {review && (
        <p className="text-xs text-compliant bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Design confirmed by {review.confirmedByName} — reconfirm to update.
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
          Planned → as-drilled
        </p>
        <RRow label="Holes" value={facts ? `${facts.planned || '—'} → ${facts.drilled}` : '…'}
          ok={facts ? facts.planned === 0 || facts.drilled >= facts.planned : undefined} />
        <RRow
          label="Footage"
          value={facts ? `${facts.plannedFootage ? facts.plannedFootage.toFixed(0) : '—'} → ${facts.footage.toFixed(0)} ft` : '…'}
          ok={facts ? facts.plannedFootage === 0 || facts.footage >= facts.plannedFootage * 0.95 : undefined}
        />
        <RRow
          label="Hazards"
          value={facts ? String(facts.hazardRows.length) : '…'}
          ok={facts ? facts.hazardRows.length === 0 : undefined}
          warnLabel="review"
        />
      </div>

      {facts && facts.hazardRows.length > 0 && (
        <div className="bg-white border border-gray-200 border-l-4 border-l-safety-orange rounded-xl p-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
            Affects loading
          </p>
          {facts.hazardRows.map((h, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-t border-gray-100 first:border-t-0">
              <span className="text-[11px] font-bold text-orange-700 bg-orange-50 rounded-lg px-2 py-0.5 shrink-0">
                H-{h.holeNumber}
              </span>
              <div className="min-w-0">
                <p className="text-sm">{h.text}</p>
                <p className="text-xs text-gray-400">{h.question}</p>
              </div>
            </div>
          ))}
          <Label className="text-xs mt-2 block">Loading answers (optional)</Label>
          <Textarea
            rows={2}
            value={hazardNotes}
            onChange={(e) => setHazardNotes(e.target.value)}
            placeholder="wet product below 12 ft · deck through H-25 void…"
          />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">
          Design (adjust here — seeds every shot)
        </p>
        <div className="flex items-center gap-2 py-1.5 text-sm">
          <span className="flex-1 text-gray-600">Max lbs/delay</span>
          <Input
            type="number"
            inputMode="decimal"
            className="w-24 text-right font-mono"
            value={maxLbs}
            onChange={(e) => setMaxLbs(e.target.value)}
            placeholder="lbs"
          />
        </div>
        <RRow label="K factor (site)" value={String(k)} />
        <RRow label="Closest structure" value={distance > 0 ? `${distance} ft` : '—'} />
        <div className="flex items-center gap-2 py-1.5 border-t border-gray-100 text-sm">
          <span className="flex-1 text-gray-600">Predicted PPV</span>
          <span className="font-mono font-bold">{ppv != null ? `${ppv.toFixed(2)} in/s` : '—'}</span>
          {passes !== undefined && (
            <button onClick={() => setShowWhy(true)}>
              <Badge variant={passes ? 'compliant' : 'violation'}>
                {passes ? 'passes' : 'exceeds'}
              </Badge>
            </button>
          )}
        </div>
      </div>

      <button
        className="w-full bg-safety-orange text-white rounded-xl py-3 font-bold text-sm hover:bg-orange-600"
        onClick={() => void confirm()}
      >
        {review ? 'Reconfirm design' : shots.length > 0 ? `Confirm design → Shot ${shots[0].shotNumber}` : 'Confirm design'}
      </button>

      {showWhy && ppv != null && (
        <ComplianceSheet
          facts={{
            kind: 'predicted',
            ppv,
            kFactor: k,
            distanceFt: distance,
            chargeLbs: lbs,
            localReg: limit != null ? { name: ctx?.localRegName || 'local limit', limit } : undefined,
          }}
          onClose={() => setShowWhy(false)}
        />
      )}
    </div>
  );
}

function RRow({
  label,
  value,
  ok,
  warnLabel,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warnLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-sm">
      <span className="flex-1 text-gray-600">{label}</span>
      <span className="font-mono font-bold">{value}</span>
      {ok === true && <Badge variant="compliant">✓</Badge>}
      {ok === false && <Badge variant="warning">{warnLabel ?? 'check'}</Badge>}
    </div>
  );
}
