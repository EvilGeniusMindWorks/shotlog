import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '@/db';
import { addShot, deleteShot } from '@/hooks/useBlastDay';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import type { BlastDay, BlastLog, Shot, ExplosiveUsage, Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionCard } from '@/components/ui/section-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChipSelect, ChipMultiSelect } from '@/components/ui/chip-select';
import { SignatureField } from '@/components/ui/signature-field';
import { Badge } from '@/components/ui/badge';
import { ShotForm } from './ShotForm';
import { ExplosiveUsageForm } from './ExplosiveUsageForm';
import { AttachmentsCard } from './AttachmentsCard';

import {
  totalSqFt,
  avgDrillDepth,
  totalYardsShot as calcTotalYards,
  scaledDistance,
  predictedPPV,
  powderFactor as calcPowderFactor,
  powderFactorAssessment,
} from '@shotlog/shared';

const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

// Spec §4.5 — common hazards and precautions as tap-to-toggle chips
const HAZARD_OPTIONS = [
  { value: 'overhead_lines', label: 'Overhead Lines' },
  { value: 'gas_line', label: 'Gas Line' },
  { value: 'water_main', label: 'Water Main' },
  { value: 'residential', label: 'Residential' },
  { value: 'highway', label: 'Highway' },
];
const PRECAUTION_OPTIONS = [
  { value: 'blast_mats', label: 'Blast Mats' },
  { value: 'road_guards', label: 'Road Guards' },
  { value: 'siren', label: 'Siren' },
  { value: 'flagging', label: 'Flagging' },
];

interface Props {
  blastDay: BlastDay;
  blastLog: BlastLog;
  shots: Shot[];
  explosiveUsage: ExplosiveUsage | undefined;
  job: Job | undefined;
}

export function BlastLogForm({ blastDay, blastLog, shots, explosiveUsage, job }: Props) {
  const [expandedShots, setExpandedShots] = useState<Set<string>>(
    new Set(shots.length > 0 ? [shots[0]?.id] : [])
  );

  const toggleShot = (id: string) => {
    setExpandedShots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Debounced write-through: edits show instantly, IndexedDB writes are batched
  const { draft, setField } = useDraftRecord(db.blastLogs, blastLog);

  const handleAddShot = async () => {
    const id = await addShot(blastLog.id, job?.kFactor ?? 180);
    setExpandedShots((prev) => new Set(prev).add(id));
  };

  const handleDeleteShot = async (shotId: string) => {
    if (!confirm('Delete this shot?')) return;
    await deleteShot(shotId, blastLog.id);
    setExpandedShots((prev) => {
      const next = new Set(prev);
      next.delete(shotId);
      return next;
    });
  };

  // Aggregate totals from all shots
  const totalHoles = shots.reduce((s, sh) => s + sh.totals.numHoles, 0);
  const totalFootage = shots.reduce((s, sh) => s + sh.totals.totalDrillFootage, 0);
  const totalYards = shots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
  const totalPounds = explosiveUsage?.totalPoundsShot ?? 0;
  const pf = totalYards > 0 ? calcPowderFactor(totalPounds, totalYards) : 0;

  const blastInfoComplete = Boolean(draft.operation && draft.typeOfRock && draft.typeOfTerrain);
  const signoffComplete = Boolean(draft.blasterName && draft.licenseNumber && draft.signatureImage);

  return (
    <div className="space-y-4">
      {/* Summary stats bar (§4.4) — live, always visible */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Shots" value={String(shots.length)} />
        <StatBox label="Holes" value={totalHoles ? String(totalHoles) : '—'} />
        <StatBox label="Total Lbs" value={totalPounds ? totalPounds.toFixed(1) : '—'} />
        <StatBox label="PF (lbs/yd³)" value={pf ? pf.toFixed(2) : '—'} accent />
      </div>
      <p className="text-xs text-gray-400 -mt-2 px-1">
        PF = Total Lbs ÷ Total Yd³
        {pf > 0 && (
          <>
            {' '}= {totalPounds.toFixed(0)} ÷ {totalYards.toFixed(0)} — {powderFactorAssessment(pf)}
          </>
        )}
      </p>

      {/* Two-column on desktop: shots main, totals/sign-off sidebar (§4.7) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
      <SectionCard title="Blast Information" complete={blastInfoComplete}>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Operation</Label>
            <ChipSelect
              className="mt-1"
              value={draft.operation}
              onChange={(v) => setField('operation', v as BlastLog['operation'])}
              options={OPERATION_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type of Rock</Label>
              <Input
                value={draft.typeOfRock}
                onChange={(e) => setField('typeOfRock', e.target.value)}
                placeholder="Granite"
              />
            </div>
            <div>
              <Label className="text-xs">Type of Terrain</Label>
              <Input
                value={draft.typeOfTerrain}
                onChange={(e) => setField('typeOfTerrain', e.target.value)}
                placeholder="Flat"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Identify Hazards</Label>
            <ChipMultiSelect
              className="mt-1"
              value={draft.hazards}
              onChange={(v) => setField('hazards', v)}
              options={HAZARD_OPTIONS}
            />
          </div>
          <div>
            <Label className="text-xs">Precautions Taken</Label>
            <ChipMultiSelect
              className="mt-1"
              value={draft.precautions}
              onChange={(v) => setField('precautions', v)}
              options={PRECAUTION_OPTIONS}
            />
          </div>
        </div>
      </SectionCard>

      {/* Shots */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Shots ({shots.length})
        </h3>
        <Button size="sm" onClick={handleAddShot}>
          <Plus className="h-4 w-4 mr-1" /> Add Shot
        </Button>
      </div>

      {shots.map((shot) => (
        <Card key={shot.id}>
          {/* div, not button: contains the delete Button (nested buttons are invalid HTML) */}
          <div
            role="button"
            tabIndex={0}
            className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
            onClick={() => toggleShot(shot.id)}
            onKeyDown={(e) => e.key === 'Enter' && toggleShot(shot.id)}
          >
            <div className="flex items-center gap-2">
              {expandedShots.has(shot.id) ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              <span className="font-semibold">Shot #{shot.shotNumber}</span>
              {shot.time && <span className="text-sm text-gray-500">{shot.time}</span>}
              {shot.totals.numHoles > 0 && (
                <Badge variant="secondary">{shot.totals.numHoles} holes</Badge>
              )}
            </div>
            {shots.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteShot(shot.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-gray-400" />
              </Button>
            )}
          </div>
          {expandedShots.has(shot.id) && (
            <CardContent>
              <ShotForm shot={shot} kFactor={job?.kFactor ?? 180} blastDayId={blastDay.id} />
            </CardContent>
          )}
        </Card>
      ))}
        </div>

        {/* Sidebar column: totals, attachments, sign-off (§4.7–4.9) */}
        <div className="space-y-4">
      {/* Explosive Usage */}
      {explosiveUsage && (
        <ExplosiveUsageForm explosiveUsage={explosiveUsage} shots={shots} />
      )}

      {/* Attachments */}
      <AttachmentsCard blastDayId={blastDay.id} />

      {/* Sign-off */}
      <SectionCard
        title="Sign-off"
        complete={signoffComplete}
        summary={draft.blasterName || undefined}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Blaster Name</Label>
              <Input
                value={draft.blasterName}
                onChange={(e) => setField('blasterName', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">License #</Label>
              <Input
                value={draft.licenseNumber}
                onChange={(e) => setField('licenseNumber', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input
                value={draft.licenseState}
                onChange={(e) => setField('licenseState', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.onsiteDelivery}
              onChange={(e) => setField('onsiteDelivery', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
            />
            <span className="text-sm">Onsite Delivery</span>
          </label>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={draft.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label className="text-xs">Blaster Signature</Label>
            <div className="mt-1">
              <SignatureField
                value={draft.signatureImage}
                onChange={(blob) => setField('signatureImage', blob)}
              />
            </div>
          </div>
        </div>
      </SectionCard>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        accent
          ? 'bg-navy text-white rounded-xl p-3 text-center'
          : 'bg-white border border-gray-200 rounded-xl p-3 text-center'
      }
    >
      <p className={`font-mono text-lg font-bold ${accent ? '' : 'text-navy'}`}>{value}</p>
      <p className={`text-[10px] ${accent ? 'text-navy-200' : 'text-gray-500'}`}>{label}</p>
    </div>
  );
}
