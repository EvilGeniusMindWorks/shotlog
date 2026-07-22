import { useCallback } from 'react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import type { Shot, DrillParams, ShotTotals, DesignPlan } from '@/db/schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import {
  totalSqFt,
  avgDrillDepth,
  totalYardsShot,
  scaledDistance,
  predictedPPV,
  checkCompliance,
} from '@shotlog/shared';

interface Props {
  shot: Shot;
  kFactor: number;
}

export function ShotForm({ shot, kFactor }: Props) {
  const updateShot = useCallback(
    (updates: Partial<Shot>) => {
      db.shots.update(shot.id, { ...updates, updatedAt: nowISO() });
    },
    [shot.id]
  );

  const updateDrillParam = (field: keyof DrillParams, value: string) => {
    const num = parseFloat(value) || 0;
    const dp = { ...shot.drillParams, [field]: num };

    // Auto-recalculate totals
    const t = { ...shot.totals };
    t.totalSqFt = totalSqFt(dp.burden, dp.spacing, t.numHoles);
    if (t.numHoles > 0 && t.totalDrillFootage > 0) {
      t.avgDrillDepth = avgDrillDepth(t.totalDrillFootage, t.numHoles);
    }
    if (dp.burden > 0 && dp.spacing > 0 && t.totalDrillFootage > 0) {
      t.totalYardsShot = totalYardsShot(dp.burden, dp.spacing, t.totalDrillFootage);
    }

    updateShot({ drillParams: dp, totals: t });
  };

  const updateTotal = (field: keyof ShotTotals, value: string) => {
    const num = parseFloat(value) || 0;
    const dp = shot.drillParams;
    const t = { ...shot.totals, [field]: num };

    // Auto-recalculate dependent fields
    t.totalSqFt = totalSqFt(dp.burden, dp.spacing, t.numHoles);
    if (t.numHoles > 0 && t.totalDrillFootage > 0) {
      t.avgDrillDepth = avgDrillDepth(t.totalDrillFootage, t.numHoles);
    }
    if (dp.burden > 0 && dp.spacing > 0 && t.totalDrillFootage > 0) {
      t.totalYardsShot = totalYardsShot(dp.burden, dp.spacing, t.totalDrillFootage);
    }

    updateShot({ totals: t });
  };

  const updateDesignPlan = (field: keyof DesignPlan, value: string | number) => {
    const plan = { ...shot.designPlan, [field]: typeof value === 'string' ? (parseFloat(value) || 0) : value };

    // Auto-calculate SD and PPV
    if (plan.closestStructureDistance > 0 && plan.maxPoundsPerDelay > 0) {
      plan.scaledDistance = scaledDistance(plan.closestStructureDistance, plan.maxPoundsPerDelay);
      const k = plan.kFactor || kFactor;
      if (plan.scaledDistance > 0 && k > 0) {
        plan.predictedPPV = predictedPPV(k, plan.scaledDistance);
      }
    }

    updateShot({ designPlan: plan });
  };

  // Compute compliance if we have predicted PPV
  const sd = shot.designPlan.scaledDistance;
  const ppv = shot.designPlan.predictedPPV;
  const dist = shot.designPlan.closestStructureDistance;

  return (
    <div className="space-y-4">
      {/* Time */}
      <div className="w-32">
        <Label className="text-xs">Blast Time</Label>
        <Input
          type="time"
          value={shot.time}
          onChange={(e) => updateShot({ time: e.target.value })}
        />
      </div>

      {/* Drill Parameters */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Drill Parameters</h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {([
            ['waterDepth', 'Water Depth', 'ft'],
            ['holeDiameter', 'Hole Dia.', 'in'],
            ['burden', 'Burden', 'ft'],
            ['spacing', 'Spacing', 'ft'],
            ['stemming', 'Stemming', 'ft'],
            ['subDrill', 'Sub Drill', 'ft'],
          ] as const).map(([field, label, unit]) => (
            <div key={field}>
              <Label className="text-xs">{label} ({unit})</Label>
              <Input
                type="number"
                step="0.1"
                value={shot.drillParams[field] || ''}
                onChange={(e) => updateDrillParam(field, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Totals</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs"># Holes</Label>
            <Input
              type="number"
              value={shot.totals.numHoles || ''}
              onChange={(e) => updateTotal('numHoles', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Drill Footage (ft)</Label>
            <Input
              type="number"
              step="0.1"
              value={shot.totals.totalDrillFootage || ''}
              onChange={(e) => updateTotal('totalDrillFootage', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Total Pay Yards (yd³)</Label>
            <Input
              type="number"
              step="0.1"
              value={shot.totals.totalPayYards || ''}
              onChange={(e) => updateTotal('totalPayYards', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Auto-calculated fields */}
          <div>
            <Label className="text-xs text-gray-400">Total Sq Ft (auto)</Label>
            <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
              {shot.totals.totalSqFt > 0 ? shot.totals.totalSqFt.toFixed(1) : '—'}
            </p>
          </div>
          <div>
            <Label className="text-xs text-gray-400">Avg Drill Depth (auto)</Label>
            <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
              {shot.totals.avgDrillDepth > 0 ? shot.totals.avgDrillDepth.toFixed(1) + ' ft' : '—'}
            </p>
          </div>
          <div>
            <Label className="text-xs text-gray-400">Total Yards Shot (auto)</Label>
            <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
              {shot.totals.totalYardsShot > 0 ? shot.totals.totalYardsShot.toFixed(1) + ' yd³' : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Design Plan — Compliance Calcs */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Design Plan — Compliance</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Closest Structure</Label>
            <Input
              value={shot.designPlan.closestStructureLocation}
              onChange={(e) => {
                const plan = { ...shot.designPlan, closestStructureLocation: e.target.value };
                updateShot({ designPlan: plan });
              }}
              placeholder="Stevens Residence"
            />
          </div>
          <div>
            <Label className="text-xs">Distance (ft)</Label>
            <Input
              type="number"
              step="1"
              value={shot.designPlan.closestStructureDistance || ''}
              onChange={(e) => updateDesignPlan('closestStructureDistance', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Max Holes/Delay</Label>
            <Input
              type="number"
              value={shot.designPlan.maxHolesPerDelay || ''}
              onChange={(e) => updateDesignPlan('maxHolesPerDelay', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Max lbs/Delay (W)</Label>
            <Input
              type="number"
              step="0.1"
              value={shot.designPlan.maxPoundsPerDelay || ''}
              onChange={(e) => updateDesignPlan('maxPoundsPerDelay', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">K Factor</Label>
            <Input
              type="number"
              step="1"
              value={shot.designPlan.kFactor || ''}
              onChange={(e) => updateDesignPlan('kFactor', e.target.value)}
              placeholder="180"
            />
          </div>

          {/* Auto-calculated compliance fields */}
          <div>
            <Label className="text-xs text-gray-400">Scaled Distance (auto)</Label>
            <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
              {sd > 0 && sd !== Infinity ? sd.toFixed(1) + ' ft/lb⁰·⁵' : '—'}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <Label className="text-xs text-gray-400">Predicted PPV (auto)</Label>
            <div className="flex items-center gap-2">
              <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200 flex-1">
                {ppv > 0 && ppv !== Infinity ? ppv.toFixed(3) + ' in/s' : '—'}
              </p>
              {ppv > 0 && ppv !== Infinity && dist > 0 && (
                <ComplianceBadge ppv={ppv} distance={dist} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComplianceBadge({ ppv, distance }: { ppv: number; distance: number }) {
  // Use a mid-range frequency estimate for predictive compliance
  // (actual frequency will come from seismo readings)
  const result = checkCompliance(ppv, 15, distance);
  const variant = result.overall;
  const label = variant === 'compliant' ? 'COMPLIANT' : variant === 'warning' ? 'WARNING' : 'VIOLATION';

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}
