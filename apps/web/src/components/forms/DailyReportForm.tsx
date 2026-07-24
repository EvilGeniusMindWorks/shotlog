import { Plus, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteWithTombstone } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { BlastDay, BlastLog, DailyReport, Shot, WorkForceEntry, EquipmentEntry, MaterialEntry, SubcontractorEntry } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import { straightTime, equipmentHoursUsed } from '@shotlog/shared';

const EQUIPMENT_CATEGORIES = [
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'equip_drill', label: 'Equip / Drills' },
  { value: 'mats_seismo', label: 'Mats / Seismo' },
];

interface Props {
  blastDay: BlastDay;
  dailyReport: DailyReport;
  blastLog: BlastLog | undefined;
  shots: Shot[];
}

export function DailyReportForm({ blastDay, dailyReport, blastLog, shots }: Props) {
  const workforce = useLiveQuery(
    () => db.workForceEntries.where('dailyReportId').equals(dailyReport.id).sortBy('rowNumber'),
    [dailyReport.id]
  ) ?? [];

  const equipmentEntries = useLiveQuery(
    () => db.equipmentEntries.where('dailyReportId').equals(dailyReport.id).toArray(),
    [dailyReport.id]
  ) ?? [];

  const materials = useLiveQuery(
    () => db.materialEntries.where('dailyReportId').equals(dailyReport.id).toArray(),
    [dailyReport.id]
  ) ?? [];

  const subcontractors = useLiveQuery(
    () => db.subcontractorEntries.where('dailyReportId').equals(dailyReport.id).toArray(),
    [dailyReport.id]
  ) ?? [];

  // Shared data from Blast Log
  const totalHoles = shots.reduce((s, sh) => s + sh.totals.numHoles, 0);
  const totalFootage = shots.reduce((s, sh) => s + sh.totals.totalDrillFootage, 0);
  const patternStr = shots.length > 0 && shots[0].drillParams.burden > 0
    ? `${shots[0].drillParams.burden}' × ${shots[0].drillParams.spacing}'`
    : '—';

  return (
    <div className="space-y-4">
      {/* Drill Summary (auto from Blast Log) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drill Summary (from Blast Log)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-400"># Drill Holes</Label>
              <p className="font-mono font-semibold">{totalHoles}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Total Vertical Ft</Label>
              <p className="font-mono font-semibold">{totalFootage.toFixed(1)}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-400">Pattern</Label>
              <p className="font-mono font-semibold">{patternStr}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Force */}
      <WorkForceSection
        dailyReportId={dailyReport.id}
        entries={workforce}
      />

      {/* Equipment */}
      <EquipmentSection
        dailyReportId={dailyReport.id}
        entries={equipmentEntries}
      />

      {/* Materials */}
      <GenericLineItems
        title="Materials / Onsite Repairs / Fuel"
        dailyReportId={dailyReport.id}
        entries={materials}
        tableName="materialEntries"
        fields={['vendor', 'description', 'unit', 'total']}
        fieldLabels={['Vendor', 'Description', 'Unit', 'Total ($)']}
        fieldTypes={['text', 'text', 'text', 'number']}
      />

      {/* Subcontractors */}
      <GenericLineItems
        title="Subcontractors / Rentals / Fire Detail"
        dailyReportId={dailyReport.id}
        entries={subcontractors}
        tableName="subcontractorEntries"
        fields={['vendor', 'description', 'hours', 'total']}
        fieldLabels={['Vendor', 'Description', 'Hours', 'Total ($)']}
        fieldTypes={['text', 'text', 'number', 'number']}
      />

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={dailyReport.notes}
            onChange={(e) =>
              db.dailyReports.update(dailyReport.id, { notes: e.target.value, updatedAt: nowISO() })
            }
            rows={4}
            placeholder="Daily notes..."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function WorkForceSection({
  dailyReportId,
  entries,
}: {
  dailyReportId: string;
  entries: WorkForceEntry[];
}) {
  const addEntry = async () => {
    const now = nowISO();
    await db.workForceEntries.add({
      id: generateId(),
      dailyReportId,
      rowNumber: entries.length + 1,
      workerName: '',
      timeIn: '',
      timeOut: '',
      straightTime: 0,
      overtime: 0,
      truckHours: 0,
      travelHours: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  };

  const updateEntry = (id: string, field: string, value: string | number) => {
    db.workForceEntries.get(id).then((entry) => {
      if (!entry) return;
      const updates: Record<string, string | number> = { [field]: value, updatedAt: nowISO() };

      // Auto-calculate straight time
      const timeIn = field === 'timeIn' ? (value as string) : entry.timeIn;
      const timeOut = field === 'timeOut' ? (value as string) : entry.timeOut;
      const ot = field === 'overtime' ? (value as number) : entry.overtime;
      if (timeIn && timeOut) {
        updates.straightTime = straightTime(timeIn, timeOut, ot);
      }

      db.workForceEntries.update(id, updates);
    });
  };

  const removeEntry = (id: string) => {
    void deleteWithTombstone('workForceEntries', id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Work Force</CardTitle>
        <Button size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" /> Add Worker
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">No workers added</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 mr-2">
                <Input
                  value={e.workerName}
                  onChange={(ev) => updateEntry(e.id, 'workerName', ev.target.value)}
                  placeholder="Worker name"
                  className="font-medium"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)}>
                <Trash2 className="h-4 w-4 text-gray-400" />
              </Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <div>
                <Label className="text-xs">IN</Label>
                <Input
                  type="time"
                  value={e.timeIn}
                  onChange={(ev) => updateEntry(e.id, 'timeIn', ev.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">OUT</Label>
                <Input
                  type="time"
                  value={e.timeOut}
                  onChange={(ev) => updateEntry(e.id, 'timeOut', ev.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-400">ST (auto)</Label>
                <p className="h-10 flex items-center font-mono text-sm bg-gray-50 rounded-md px-3 border border-gray-200">
                  {e.straightTime > 0 ? e.straightTime.toFixed(1) : '—'}
                </p>
              </div>
              <div>
                <Label className="text-xs">OT</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={e.overtime || ''}
                  onChange={(ev) => updateEntry(e.id, 'overtime', parseFloat(ev.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">TRK</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={e.truckHours || ''}
                  onChange={(ev) => updateEntry(e.id, 'truckHours', parseFloat(ev.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">TRVL</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={e.travelHours || ''}
                  onChange={(ev) => updateEntry(e.id, 'travelHours', parseFloat(ev.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EquipmentSection({
  dailyReportId,
  entries,
}: {
  dailyReportId: string;
  entries: EquipmentEntry[];
}) {
  const addEntry = async () => {
    const now = nowISO();
    await db.equipmentEntries.add({
      id: generateId(),
      dailyReportId,
      category: 'vehicle',
      assetNumber: '',
      hoursStart: 0,
      hoursEnd: 0,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  };

  const updateEntry = (id: string, field: string, value: string | number) => {
    db.equipmentEntries.update(id, { [field]: value, updatedAt: nowISO() });
  };

  const removeEntry = (id: string) => {
    void deleteWithTombstone('equipmentEntries', id);
  };

  // Group by category
  const grouped = EQUIPMENT_CATEGORIES.map((cat) => ({
    ...cat,
    items: entries.filter((e) => e.category === cat.value),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Equipment / Assets</CardTitle>
        <Button size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">No equipment added</p>
        )}
        {grouped
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <div key={group.value}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h4>
              {group.items.map((e) => (
                <div key={e.id} className="flex items-center gap-2 mb-2">
                  <Select
                    value={e.category}
                    onChange={(ev) => updateEntry(e.id, 'category', ev.target.value)}
                    options={EQUIPMENT_CATEGORIES}
                    className="w-32"
                  />
                  <Input
                    value={e.assetNumber}
                    onChange={(ev) => updateEntry(e.id, 'assetNumber', ev.target.value)}
                    placeholder="Asset #"
                    className="flex-1"
                  />
                  <div className="w-20">
                    <Input
                      type="number"
                      step="0.1"
                      value={e.hoursStart || ''}
                      onChange={(ev) => updateEntry(e.id, 'hoursStart', parseFloat(ev.target.value) || 0)}
                      placeholder="Start"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      step="0.1"
                      value={e.hoursEnd || ''}
                      onChange={(ev) => updateEntry(e.id, 'hoursEnd', parseFloat(ev.target.value) || 0)}
                      placeholder="End"
                    />
                  </div>
                  <span className="font-mono text-sm w-12 text-right">
                    {e.hoursEnd > e.hoursStart
                      ? equipmentHoursUsed(e.hoursStart, e.hoursEnd).toFixed(1)
                      : '—'}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)}>
                    <Trash2 className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function GenericLineItems({
  title,
  dailyReportId,
  entries,
  tableName,
  fields,
  fieldLabels,
  fieldTypes,
}: {
  title: string;
  dailyReportId: string;
  entries: (MaterialEntry | SubcontractorEntry)[];
  tableName: 'materialEntries' | 'subcontractorEntries';
  fields: string[];
  fieldLabels: string[];
  fieldTypes: string[];
}) {
  const table = db[tableName] as typeof db.materialEntries;

  const addEntry = async () => {
    const now = nowISO();
    const base: Record<string, string | number> = {
      id: generateId(),
      dailyReportId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    for (const f of fields) {
      base[f] = fieldTypes[fields.indexOf(f)] === 'number' ? 0 : '';
    }
    await table.add(base as never);
  };

  const updateEntry = (id: string, field: string, value: string | number) => {
    table.update(id, { [field]: value, updatedAt: nowISO() } as never);
  };

  const removeEntry = (id: string) => {
    table.delete(id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-3">None added</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-2">
            {fields.map((f, i) => (
              <Input
                key={f}
                type={fieldTypes[i]}
                step={fieldTypes[i] === 'number' ? '0.01' : undefined}
                value={(e as unknown as Record<string, string | number>)[f] || ''}
                onChange={(ev) =>
                  updateEntry(
                    e.id,
                    f,
                    fieldTypes[i] === 'number' ? parseFloat(ev.target.value) || 0 : ev.target.value
                  )
                }
                placeholder={fieldLabels[i]}
                className="flex-1"
              />
            ))}
            <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)}>
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
