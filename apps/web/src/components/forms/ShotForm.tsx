import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, BarChart3, Flame, MapPin, Wrench } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { distributeByHoles, totalSqFt, avgDrillDepth, totalYardsShot } from '@shotlog/shared';
import type { Shot, DrillParams, ShotTotals, ExplosiveUsage } from '@/db/schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChipSelect } from '@/components/ui/chip-select';
import { IconChip, SubSection } from '@/components/ui/section-card';

interface Props {
  shot: Shot;
  allShots: Shot[];
  explosiveUsage: ExplosiveUsage | undefined;
  kFactor: number;
  blastDayId?: string;
}

export function ShotForm({ shot, allShots, explosiveUsage, kFactor: _kFactor, blastDayId }: Props) {
  const navigate = useNavigate();
  const seismo =
    useLiveQuery(() => db.seismoReadings.where('shotId').equals(shot.id).toArray(), [shot.id]) ??
    [];

  const updateShot = useCallback(
    (updates: Partial<Shot>) => {
      db.shots.update(shot.id, { ...updates, updatedAt: nowISO() });
    },
    [shot.id],
  );

  const recalc = (dp: DrillParams, t: ShotTotals): ShotTotals => {
    const next = { ...t };
    next.totalSqFt = totalSqFt(dp.burden, dp.spacing, next.numHoles);
    if (next.numHoles > 0 && next.totalDrillFootage > 0) {
      next.avgDrillDepth = avgDrillDepth(next.totalDrillFootage, next.numHoles);
    }
    if (dp.burden > 0 && dp.spacing > 0 && next.totalDrillFootage > 0) {
      next.totalYardsShot = totalYardsShot(dp.burden, dp.spacing, next.totalDrillFootage);
    }
    return next;
  };

  const updateDrillParam = (field: keyof DrillParams, value: string | boolean) => {
    const dp = {
      ...shot.drillParams,
      [field]: typeof value === 'boolean' ? value : parseFloat(value) || 0,
    };
    updateShot({ drillParams: dp, totals: recalc(dp, shot.totals) });
  };

  const updateTotal = (field: keyof ShotTotals, value: string) => {
    const t = { ...shot.totals, [field]: parseFloat(value) || 0 };
    updateShot({ totals: recalc(shot.drillParams, t) });
  };

  const dp = shot.drillParams;
  const t = shot.totals;

  // Sub-section summaries (wireframe style)
  const drillSummary =
    [dp.holeDiameter && `${dp.holeDiameter}"`, dp.burden && dp.spacing && `${dp.burden}x${dp.spacing}`, t.avgDrillDepth > 0 && `${t.avgDrillDepth.toFixed(1)}'`]
      .filter(Boolean)
      .join(' · ') || '—';
  const totalsSummary =
    [t.numHoles > 0 && `${t.numHoles} holes`, t.totalDrillFootage > 0 && `${Math.round(t.totalDrillFootage)} ft`]
      .filter(Boolean)
      .join(' · ') || '—';
  const designPlan = shot.designPlan;
  const designSummary = [
    designPlan.siteSketchData ? 'Site' : null,
    designPlan.shotDiagramData ? 'Shot' : null,
    designPlan.closestStructureDistance > 0 ? 'Compliance' : null,
  ].filter(Boolean);
  const seismoWorst = seismo.some((r) => r.complianceStatus === 'violation')
    ? 'Violation'
    : seismo.some((r) => r.complianceStatus === 'warning')
      ? 'Warning'
      : 'Compliant';

  return (
    <div>
      {/* Drill Parameters */}
      <SubSection
        icon={<IconChip tint="blue"><Wrench className="h-4 w-4" /></IconChip>}
        title="Drill Parameters"
        summary={drillSummary}
        defaultOpen={t.numHoles === 0}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-gray-500">Time</Label>
            <Input type="time" value={shot.time} onChange={(e) => updateShot({ time: e.target.value })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-gray-500">Blast Mats</Label>
            <ChipSelect
              className="mt-1"
              value={dp.blastMats === true ? 'yes' : dp.blastMats === false ? 'no' : ''}
              onChange={(v) => updateDrillParam('blastMats', v === 'yes')}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
            />
          </div>
          {(
            [
              ['holeDiameter', 'Hole Dia (in)'],
              ['burden', 'Burden (ft)'],
              ['spacing', 'Spacing (ft)'],
              ['stemming', 'Stemming (ft)'],
              ['subDrill', 'Sub Drill (ft)'],
              ['waterDepth', 'Water Depth (ft)'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <Label className="text-[10px] uppercase tracking-wide text-gray-500">{label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={dp[field] || ''}
                onChange={(e) => updateDrillParam(field, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </SubSection>

      {/* Totals */}
      <SubSection
        icon={<IconChip tint="green"><BarChart3 className="h-4 w-4" /></IconChip>}
        title="Totals"
        summary={totalsSummary}
        defaultOpen={t.numHoles === 0}
      >
        <div className="grid grid-cols-3 border border-gray-200 rounded-lg overflow-hidden divide-x divide-y divide-gray-200 -space-y-px">
          <TotalsCell label="# Holes">
            <Input
              type="number"
              inputMode="numeric"
              className="h-8 border-0 px-0 font-mono font-bold text-[15px] focus-visible:ring-0"
              value={t.numHoles || ''}
              onChange={(e) => updateTotal('numHoles', e.target.value)}
              placeholder="0"
            />
          </TotalsCell>
          <TotalsCell label="Sq Ft" value={t.totalSqFt > 0 ? String(Math.round(t.totalSqFt)) : '—'} />
          <TotalsCell label="Avg Depth" value={t.avgDrillDepth > 0 ? `${t.avgDrillDepth.toFixed(1)}'` : '—'} />
          <TotalsCell label="Drill Footage">
            <div className="flex items-baseline">
              <Input
                type="number"
                inputMode="decimal"
                className="h-8 border-0 px-0 font-mono font-bold text-[15px] focus-visible:ring-0"
                value={t.totalDrillFootage || ''}
                onChange={(e) => updateTotal('totalDrillFootage', e.target.value)}
                placeholder="0"
              />
              <span className="text-xs text-gray-400">'</span>
            </div>
          </TotalsCell>
          <TotalsCell label="Pay Yards">
            <Input
              type="number"
              inputMode="decimal"
              className="h-8 border-0 px-0 font-mono font-bold text-[15px] focus-visible:ring-0"
              value={t.totalPayYards || ''}
              onChange={(e) => updateTotal('totalPayYards', e.target.value)}
              placeholder="0"
            />
          </TotalsCell>
          <TotalsCell label="Yards Shot" value={t.totalYardsShot > 0 ? String(Math.round(t.totalYardsShot)) : '—'} />
        </div>
      </SubSection>

      {/* Explosives (this shot) — auto-distributed */}
      <SubSection
        icon={<IconChip tint="red"><Flame className="h-4 w-4" /></IconChip>}
        title="Explosives (this shot)"
        summary={<Badge variant="secondary" className="text-[10px]">Auto</Badge>}
      >
        <ShotExplosives shot={shot} allShots={allShots} explosiveUsage={explosiveUsage} />
      </SubSection>

      {/* Design Plan → full screen */}
      {blastDayId && (
        <SubSection
          icon={<IconChip tint="orange"><MapPin className="h-4 w-4" /></IconChip>}
          title="Design Plan"
          summary={designSummary.length > 0 ? designSummary.join(' · ') : 'Site · Shot · Column · Compliance'}
          navigate={() => navigate(`/blast-day/${blastDayId}/design/${shot.id}`)}
        />
      )}

      {/* Seismo → full screen */}
      {blastDayId && (
        <SubSection
          icon={<IconChip tint="navy"><Activity className="h-4 w-4" /></IconChip>}
          title="Seismo Readings"
          summary={seismo.length > 0 ? `${seismo.length} graph${seismo.length > 1 ? 's' : ''} · ${seismoWorst}` : 'No readings yet'}
          navigate={() => navigate(`/blast-day/${blastDayId}/seismo/${shot.id}`)}
        />
      )}
    </div>
  );
}

function TotalsCell({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      {children ?? <div className="font-mono font-bold text-[15px]">{value}</div>}
    </div>
  );
}

/** Per-shot auto-distributed quantities with tap-to-override (Spec §4.6.3) */
function ShotExplosives({
  shot,
  allShots,
  explosiveUsage,
}: {
  shot: Shot;
  allShots: Shot[];
  explosiveUsage: ExplosiveUsage | undefined;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  if (!explosiveUsage || explosiveUsage.products.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Add products in Explosive Totals — quantities distribute here automatically.
      </p>
    );
  }
  const holeCounts = allShots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
  const totalHoles = holeCounts.reduce((s, h) => s + h.holes, 0);
  const pct =
    totalHoles > 0 && shot.totals.numHoles > 0
      ? ` (${shot.totals.numHoles}/${totalHoles} = ${Math.round((shot.totals.numHoles / totalHoles) * 100)}%)`
      : '';

  const setOverride = (index: number, qty: number) => {
    const products = [...explosiveUsage.products];
    const item = { ...products[index] };
    item.shotAllocations = { ...item.shotAllocations, [shot.id]: qty };
    products[index] = item;
    void db.explosiveUsages.update(explosiveUsage.id, { products, updatedAt: nowISO() });
  };

  let subtotal = 0;
  const rows = explosiveUsage.products.map((item, i) => {
    const dist = distributeByHoles(item.quantity, holeCounts, item.shotAllocations);
    const qty = dist.allocations[shot.id] ?? 0;
    const lbs = qty * item.weightMultiplier;
    subtotal += lbs;
    const overridden = item.shotAllocations[shot.id] !== undefined;
    return { item, i, qty, lbs, overridden };
  });

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 mb-2">
        Auto-distributed from totals{pct}. Tap to override.
      </p>
      {rows.map(({ item, i, qty, lbs, overridden }) => (
        <div
          key={i}
          className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 cursor-pointer"
          onClick={() => setEditing(editing === i ? null : i)}
        >
          <span className={`text-sm flex-1 truncate ${overridden ? 'font-semibold' : ''}`}>
            {item.productName}
          </span>
          {editing === i ? (
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              className="w-20 h-9 text-right font-mono"
              defaultValue={qty || ''}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setOverride(i, parseFloat(e.target.value) || 0);
                setEditing(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <span className="font-mono font-bold text-sm">{qty || '—'}</span>
          )}
          <span className="font-mono text-xs text-gray-500 w-16 text-right">
            {lbs > 0 ? `${lbs.toFixed(1)} lbs` : '—'}
          </span>
        </div>
      ))}
      <div className="text-right text-sm font-bold pt-1">
        Shot subtotal: <span className="font-mono">{subtotal.toFixed(1)} lbs</span>
      </div>
    </div>
  );
}
