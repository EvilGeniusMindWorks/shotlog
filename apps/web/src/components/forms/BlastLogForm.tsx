import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { addShot, deleteShot } from '@/hooks/useBlastDay';
import type { BlastDay, BlastLog, Shot, ExplosiveUsage, Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShotForm } from './ShotForm';
import { ExplosiveUsageForm } from './ExplosiveUsageForm';

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

  const updateBlastLog = (field: string, value: string | boolean) => {
    db.blastLogs.update(blastLog.id, { [field]: value, updatedAt: nowISO() });
  };

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

  return (
    <div className="space-y-4">
      {/* Blast Log Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blast Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Operation</Label>
              <Select
                value={blastLog.operation}
                onChange={(e) => updateBlastLog('operation', e.target.value)}
                options={OPERATION_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Type of Rock</Label>
              <Input
                value={blastLog.typeOfRock}
                onChange={(e) => updateBlastLog('typeOfRock', e.target.value)}
                placeholder="Granite"
              />
            </div>
            <div>
              <Label className="text-xs">Type of Terrain</Label>
              <Input
                value={blastLog.typeOfTerrain}
                onChange={(e) => updateBlastLog('typeOfTerrain', e.target.value)}
                placeholder="Flat"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Identify Hazards</Label>
            <Textarea
              value={blastLog.hazards}
              onChange={(e) => updateBlastLog('hazards', e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs">Precautions Taken</Label>
            <Textarea
              value={blastLog.precautions}
              onChange={(e) => updateBlastLog('precautions', e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

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
          <button
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => toggleShot(shot.id)}
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
          </button>
          {expandedShots.has(shot.id) && (
            <CardContent>
              <ShotForm shot={shot} kFactor={job?.kFactor ?? 180} />
            </CardContent>
          )}
        </Card>
      ))}

      {/* Explosive Usage */}
      {explosiveUsage && (
        <ExplosiveUsageForm explosiveUsage={explosiveUsage} shots={shots} />
      )}

      {/* Summary Totals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blast Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Total Holes</Label>
              <p className="font-mono text-lg font-semibold">{totalHoles}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Total Drill Footage</Label>
              <p className="font-mono text-lg font-semibold">{totalFootage.toFixed(1)} ft</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Total Yards Shot</Label>
              <p className="font-mono text-lg font-semibold">{totalYards.toFixed(1)} yd³</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Total Pounds Shot</Label>
              <p className="font-mono text-lg font-semibold">{totalPounds.toFixed(1)} lbs</p>
            </div>
            {pf > 0 && (
              <div className="col-span-2 sm:col-span-4">
                <Label className="text-xs text-gray-500">Powder Factor</Label>
                <p className="font-mono font-semibold">
                  {pf.toFixed(2)} lbs/yd³
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    — {powderFactorAssessment(pf)}
                  </span>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sign-off */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign-off</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Blaster Name</Label>
              <Input
                value={blastLog.blasterName}
                onChange={(e) => updateBlastLog('blasterName', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">License #</Label>
              <Input
                value={blastLog.licenseNumber}
                onChange={(e) => updateBlastLog('licenseNumber', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input
                value={blastLog.licenseState}
                onChange={(e) => updateBlastLog('licenseState', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={blastLog.onsiteDelivery}
              onChange={(e) => updateBlastLog('onsiteDelivery', e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
            />
            <span className="text-sm">Onsite Delivery</span>
          </label>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={blastLog.notes}
              onChange={(e) => updateBlastLog('notes', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
