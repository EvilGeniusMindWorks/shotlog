import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLiveQuery, db, deleteWithTombstone } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { BlastDay, BlastLog, DailyReport, Shot, WorkForceEntry, EquipmentEntry, MaterialEntry, SubcontractorEntry } from '@/db/schema';
import { equipmentEntryBucket } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { canEditApprovedDay, can } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { propagateHourMeter } from '@/hooks/useMaintenance';

/** S4 (I3): an empty section is ONE row, not a card of nothing — tap to add
 *  the first line. On a locked day an empty section is simply absent. */
function EmptyAddRow({ title, label, onAdd }: { title: string; label: string; onAdd: () => void }) {
  return (
    <button
      className="w-full flex items-center justify-between rounded-xl border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm hover:bg-gray-50"
      onClick={onAdd}
      data-empty-add={title}
    >
      <span className="text-gray-500">{title}</span>
      <span className="text-navy font-medium flex items-center gap-1">
        <Plus className="h-4 w-4" /> {label}
      </span>
    </button>
  );
}

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
  /** S7d: the report belongs to its author — everyone else reads */
  readOnly?: boolean;
}

export function DailyReportForm({ blastDay, dailyReport, blastLog, shots, readOnly }: Props) {
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

  // Filed/approved days are read-only for field roles: empty sections hide
  // entirely instead of stacking four screens of empty cards (S4, I3)
  const locked = (blastDay.status !== 'draft' && !canEditApprovedDay()) || Boolean(readOnly);

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
      <WorkForceSection entries={workforce} />

      {/* Equipment */}
      <EquipmentSection
        dailyReportId={dailyReport.id}
        entries={equipmentEntries}
        locked={locked}
        blastDay={blastDay}
      />

      {/* Materials */}
      <GenericLineItems
        title="Materials / Onsite Repairs / Fuel"
        dailyReportId={dailyReport.id}
        entries={materials}
        locked={locked}
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
        locked={locked}
        tableName="subcontractorEntries"
        fields={['vendor', 'description', 'hours', 'total']}
        fieldLabels={['Vendor', 'Description', 'Hours', 'Total ($)']}
        fieldTypes={['text', 'text', 'number', 'number']}
      />

      {/* Notes — hidden on a locked day when there are none */}
      {!(locked && !dailyReport.notes) && (
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
      )}
    </div>
  );
}

/** S7d: hours live on TIME CARDS (each person files their own; the day's
 *  Work Force is the roll-up in the Time Cards card above). Rows typed
 *  here before S7d stay visible, read-only — nothing filed is lost. */
function WorkForceSection({ entries }: { entries: WorkForceEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card data-workforce-legacy>
      <CardHeader>
        <CardTitle className="text-base">
          Work Force <span className="text-xs font-normal text-gray-400">— rows from before time cards</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-t border-gray-100 first:border-t-0">
            <span className="font-medium flex-1 min-w-0 truncate">{e.workerName || '—'}</span>
            <span className="font-mono text-xs text-gray-500">
              {e.timeIn || '—'}–{e.timeOut || '—'} · ST {e.straightTime > 0 ? e.straightTime.toFixed(1) : '—'} · OT {e.overtime || 0}
              {e.truckHours ? ` · TRK ${e.truckHours}` : ''}
              {e.travelHours ? ` · TRVL ${e.travelHours}` : ''}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-gray-400 pt-2">Hours are filed on time cards now — see Time Cards above.</p>
      </CardContent>
    </Card>
  );
}

function EquipmentSection({
  dailyReportId,
  entries,
  locked,
  blastDay,
}: {
  dailyReportId: string;
  entries: EquipmentEntry[];
  locked?: boolean;
  blastDay: BlastDay;
}) {
  // S7d: drill hours come from the rigs' OWN records that day — checklist
  // starting hours in the morning, the driller's end-of-day meter at
  // sign-complete — derived here, read-only. Trucks and seismographs stay
  // manual rows (nothing else records them).
  const derived =
    useLiveQuery(async () => {
      const logs = await db.drillLogs
        .filter(
          (l) =>
            l.blastDayId === blastDay.id ||
            (l.jobId === blastDay.jobId && (l.date ?? l.createdAt.slice(0, 10)) === blastDay.date),
        )
        .toArray();
      const rigIds = [...new Set(logs.map((l) => l.drillRigEquipmentId).filter((x): x is string => Boolean(x)))];
      const out: { rigId: string; asset: string; start: number | null; end: number | null; who?: string; logId?: string; logOwnerId?: string }[] = [];
      for (const rigId of rigIds) {
        const rig = await db.equipment.get(rigId);
        if (!rig) continue;
        // latest checklist that day wins (a refiled one supersedes)
        const chk = (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === blastDay.date).toArray()).sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt),
        )[0];
        const ends = logs
          .filter((l) => l.drillRigEquipmentId === rigId && l.endingHours != null)
          .map((l) => l.endingHours as number)
          .sort((a, b) => b - a);
        // S9a: the newest log on this rig is where a missed end-of-day meter lands
        const rigLogs = logs.filter((l) => l.drillRigEquipmentId === rigId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        out.push({
          rigId,
          asset: rig.assetNumber,
          start: chk?.startingHours ?? null,
          end: ends[0] ?? null,
          who: rigLogs[0]?.drillerName,
          logId: rigLogs[0]?.id,
          logOwnerId: rigLogs[0]?.drillerUserId,
        });
      }
      return out;
    }, [blastDay.id, blastDay.jobId, blastDay.date]) ?? [];

  // S9a: end-of-day meter door on the rig row (see derived rigs above)
  const [meterEdit, setMeterEdit] = useState<string | null>(null);
  const [meterValue, setMeterValue] = useState('');
  const canEnterMeter = (ownerId?: string) => {
    const me = getSessionUser();
    return Boolean(me && (me.id === ownerId || can('drillLogs', 'PATCH')));
  };
  const saveMeter = async (d: { rigId: string; logId?: string }) => {
    const v = parseFloat(meterValue);
    if (!d.logId || !Number.isFinite(v)) return;
    await db.drillLogs.update(d.logId, { endingHours: v, updatedAt: nowISO() });
    await propagateHourMeter(d.rigId, v);
    setMeterEdit(null);
  };

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

  // Registry-linked entry: picking an asset stamps id + number + bucket so
  // the equipment history page can trace usage reliably
  const registry =
    useLiveQuery(() =>
      db.equipment.filter((e) => e.isActive && e.status !== 'retired').toArray(),
    ) ?? [];
  const registrySorted = [...registry].sort((a, b) =>
    a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }),
  );
  const pickAsset = (entryId: string, equipmentId: string) => {
    if (equipmentId === '__other') {
      void db.equipmentEntries.update(entryId, { equipmentId: undefined, updatedAt: nowISO() });
      return;
    }
    const equip = registry.find((e) => e.id === equipmentId);
    if (!equip) return;
    void db.equipmentEntries.update(entryId, {
      equipmentId: equip.id,
      assetNumber: equip.assetNumber,
      category: equipmentEntryBucket(equip.category),
      updatedAt: nowISO(),
    });
  };

  // Group by category
  const grouped = EQUIPMENT_CATEGORIES.map((cat) => ({
    ...cat,
    items: entries.filter((e) => e.category === cat.value),
  }));

  if (entries.length === 0 && derived.length === 0) {
    return locked ? null : <EmptyAddRow title="Equipment / Assets" label="Add equipment" onAdd={() => void addEntry()} />;
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Equipment / Assets</CardTitle>
        {!locked && (
          <Button size="sm" onClick={addEntry}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {derived.length > 0 && (
          <div data-derived-rigs>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Drills — from the rigs' own records
            </h4>
            {derived.map((d) => (
              <div key={d.rigId} className="flex items-center gap-2 text-sm py-1 flex-wrap" data-derived-rig={d.asset}>
                <span className="font-mono font-bold text-xs bg-blue-50 text-navy rounded-lg px-2 py-0.5">{d.asset}</span>
                <span className="font-mono text-gray-700">
                  {d.start ?? '—'} →{' '}
                  {/* S9a: the second door for the rig's end-of-day meter — the driller
                      who owns the log (or anyone who logs equipment) taps the blank */}
                  {meterEdit === d.rigId ? (
                    <span className="inline-flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-7 w-24 inline-block"
                        autoFocus
                        aria-label={`${d.asset} meter at end of day`}
                        data-rig-meter-input={d.asset}
                        value={meterValue}
                        placeholder={d.start != null ? String(d.start) : ''}
                        onChange={(e) => setMeterValue(e.target.value)}
                      />
                      <Button size="sm" className="h-7" data-rig-meter-save={d.asset} disabled={!meterValue.trim()} onClick={() => void saveMeter(d)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setMeterEdit(null)}>Cancel</Button>
                    </span>
                  ) : d.end == null && d.logId && blastDay.status === 'draft' && canEnterMeter(d.logOwnerId) ? (
                    <button
                      type="button"
                      className="underline decoration-dotted text-safety-orange"
                      aria-label={`Enter ${d.asset} meter at end of day`}
                      data-rig-meter-enter={d.asset}
                      onClick={() => { setMeterEdit(d.rigId); setMeterValue(''); }}
                    >
                      — h · enter end-of-day meter
                    </button>
                  ) : (
                    <>{d.end ?? '—'} h</>
                  )}
                </span>
                {d.who && <span className="text-xs text-gray-400">· {d.who}</span>}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">checklist · drill log</span>
              </div>
            ))}
          </div>
        )}
        {grouped
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <div key={group.value}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </h4>
              {group.items.map((e) => (
                <div key={e.id} className="flex items-center gap-2 mb-2 flex-wrap">
                  <Select
                    value={e.equipmentId ?? (e.assetNumber ? '__other' : '')}
                    onChange={(ev) => pickAsset(e.id, ev.target.value)}
                    placeholder="Pick asset…"
                    groups={EQUIPMENT_CATEGORIES.map((cat) => ({
                      label: cat.label,
                      options: registrySorted
                        .filter((r) => equipmentEntryBucket(r.category) === cat.value)
                        .map((r) => ({
                          value: r.id,
                          label: `${r.assetNumber} — ${r.description}`,
                        })),
                    })).filter((g) => g.options.length > 0)}
                    options={[{ value: '__other', label: 'Other / not listed' }]}
                    className="flex-1 min-w-[180px]"
                  />
                  {e.equipmentId && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 whitespace-nowrap">
                      {EQUIPMENT_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                    </span>
                  )}
                  {!e.equipmentId && (
                    <>
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
                        className="w-28"
                      />
                    </>
                  )}
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
  locked,
}: {
  title: string;
  dailyReportId: string;
  entries: (MaterialEntry | SubcontractorEntry)[];
  tableName: 'materialEntries' | 'subcontractorEntries';
  fields: string[];
  fieldLabels: string[];
  fieldTypes: string[];
  locked?: boolean;
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

  if (entries.length === 0) {
    return locked ? null : <EmptyAddRow title={title} label="Add" onAdd={() => void addEntry()} />;
  }
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
