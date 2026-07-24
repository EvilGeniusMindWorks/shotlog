import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '@/db';
import { addShot, deleteShot } from '@/hooks/useBlastDay';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import type { BlastDay, BlastLog, Shot, ExplosiveUsage, Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SectionCard, IconChip } from '@/components/ui/section-card';
import { ClipboardList, PenLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChipSelect, ChipMultiSelect } from '@/components/ui/chip-select';
import { SignatureField } from '@/components/ui/signature-field';
import { getSessionUser } from '@/lib/sync';
import { dataUrlToBlob } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ShotForm } from './ShotForm';
import { ExplosiveUsageForm } from './ExplosiveUsageForm';
import { AttachmentsCard } from './AttachmentsCard';

import {
  distributeByHoles,
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
  const totalYards = shots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
  const totalPounds = explosiveUsage?.totalPoundsShot ?? 0;
  const pf = totalYards > 0 ? calcPowderFactor(totalPounds, totalYards) : 0;

  // Per-shot pounds via auto-distribution (for the shot card headers)
  const holeCounts = shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
  const shotPounds = new Map<string, number>();
  for (const item of explosiveUsage?.products ?? []) {
    const dist = distributeByHoles(item.quantity, holeCounts, item.shotAllocations);
    for (const s of shots) {
      shotPounds.set(s.id, (shotPounds.get(s.id) ?? 0) + (dist.allocations[s.id] ?? 0) * item.weightMultiplier);
    }
  }

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
      <div className="border border-gray-200 rounded-lg bg-white px-3 py-2 text-xs text-gray-500 -mt-1">
        {pf > 0 ? (
          <>
            PF = {totalPounds.toFixed(0)} lbs ÷ {totalYards.toFixed(0)} yd³ ={' '}
            <b className="text-gray-800">{pf.toFixed(2)}</b> — {powderFactorAssessment(pf)}
          </>
        ) : (
          <>PF = Total Lbs ÷ Total Yd³ — enter drill footage and explosives to calculate</>
        )}
      </div>

      {/* Two-column on desktop: shots main, totals/sign-off sidebar (§4.7) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-4">
      <SectionCard
        title="Blast Information"
        icon={<IconChip tint="navy"><ClipboardList className="h-4 w-4" /></IconChip>}
        subtitle={
          [OPERATION_OPTIONS.find((o) => o.value === draft.operation)?.label, draft.typeOfRock, draft.typeOfTerrain]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        complete={blastInfoComplete}
        defaultOpen={!blastInfoComplete}
      >
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


      {shots.map((shot) => {
        const shotLbs = shotPounds.get(shot.id) ?? 0;
        return (
        <Card key={shot.id} className="rounded-xl shadow-sm overflow-hidden">
          {/* div, not button: contains the delete Button (nested buttons are invalid HTML) */}
          <div
            role="button"
            tabIndex={0}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer bg-gray-50/70 min-h-[52px]"
            onClick={() => toggleShot(shot.id)}
            onKeyDown={(e) => e.key === 'Enter' && toggleShot(shot.id)}
          >
            <span className="font-bold">Shot #{shot.shotNumber}</span>
            {shot.time && <span className="text-sm text-gray-500">{shot.time}</span>}
            <span className="text-sm text-gray-500">
              {shot.totals.numHoles > 0 && `${shot.totals.numHoles} holes`}
              {shot.totals.numHoles > 0 && shotLbs > 0 && ' · '}
              {shotLbs > 0 && `${shotLbs.toFixed(1)} lbs`}
            </span>
            <span className="flex-1" />
            {shots.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteShot(shot.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-gray-400" />
              </Button>
            )}
            {expandedShots.has(shot.id) ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
          {expandedShots.has(shot.id) && (
            <CardContent className="pt-1">
              <ShotForm
                shot={shot}
                allShots={shots}
                explosiveUsage={explosiveUsage}
                kFactor={job?.kFactor ?? 180}
                blastDayId={blastDay.id}
              />
            </CardContent>
          )}
        </Card>
        );
      })}

      {/* Add Shot — dashed full-width (wireframe) */}
      <button
        className="w-full min-h-[48px] border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-gray-500 hover:border-navy hover:text-navy transition-colors"
        onClick={handleAddShot}
      >
        + Add Shot
      </button>
        </div>

        {/* Sidebar column: totals, attachments, sign-off (§4.7–4.9) */}
        <div className="space-y-4">
      <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-1 !mb-0">
        Explosive Totals (All Shots)
      </p>
      {/* Explosive Usage */}
      {explosiveUsage && (
        <ExplosiveUsageForm explosiveUsage={explosiveUsage} shots={shots} />
      )}

      {/* Attachments */}
      <AttachmentsCard blastDayId={blastDay.id} />

      {/* Sign-off */}
      <SectionCard
        title="Sign-off & Delivery"
        icon={<IconChip tint="blue"><PenLine className="h-4 w-4" /></IconChip>}
        subtitle="Blaster, license, signature"
        complete={signoffComplete}
        defaultOpen={!signoffComplete}
      >
        <div className="space-y-3">
          {/* Pick from the signed-in blaster's licenses (one per state) */}
          {(() => {
            const session = getSessionUser();
            const licenses = session?.licenses ?? [];
            if (licenses.length === 0) return null;
            return (
              <div>
                <Label className="text-xs">
                  Your Licenses
                  <span className="text-gray-400 font-normal"> — tap to apply</span>
                </Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {licenses.map((lic) => {
                    const selected =
                      draft.licenseNumber === lic.licenseNumber && draft.licenseState === lic.state;
                    return (
                      <button
                        key={lic.state}
                        className={`min-h-[40px] px-3 rounded-full border text-sm font-medium ${
                          selected
                            ? 'bg-navy text-white border-navy'
                            : 'bg-white text-gray-700 border-gray-300'
                        }`}
                        onClick={() => {
                          setField('blasterName', session!.name);
                          setField('licenseNumber', lic.licenseNumber);
                          setField('licenseState', lic.state);
                        }}
                      >
                        {lic.state} · {lic.licenseNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
            <div className="mt-1 space-y-2">
              {!draft.signatureImage && getSessionUser()?.signature && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = dataUrlToBlob(getSessionUser()!.signature!);
                    if (blob) setField('signatureImage', blob);
                  }}
                >
                  <PenLine className="h-4 w-4 mr-1" /> Use Saved Signature
                </Button>
              )}
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
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
      <p className={`font-mono text-2xl font-bold ${accent ? 'text-compliant' : 'text-navy'}`}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
