// Equipment registry: full asset identity + compliance dates, grouped by
// category, with a bulk-paste importer for "CODE  Description" lists.
// Writable by admin/supervisor/mechanic (the matrix enforces server-side).
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Pencil, Plus, Upload } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { Equipment, EquipmentCategory, EquipmentStatus } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export const EQUIPMENT_CATEGORIES: { value: EquipmentCategory; label: string }[] = [
  { value: 'pickup', label: 'Pickups & Trucks' },
  { value: 'service_truck', label: 'Service Trucks' },
  { value: 'rock_drill', label: 'Rock Drills' },
  { value: 'crusher', label: 'Crushers' },
  { value: 'excavator', label: 'Excavators' },
  { value: 'compressor', label: 'Compressors' },
  { value: 'conveyor', label: 'Conveyors' },
  { value: 'tractor', label: 'Tractors' },
  { value: 'trailer', label: 'Trailers' },
  { value: 'fuel_trailer', label: 'Fuel Trailers' },
  { value: 'blast_mats', label: 'Blast Mats' },
  { value: 'seismograph', label: 'Seismographs' },
  { value: 'bore_tracking', label: 'Bore Tracking' },
  // Legacy buckets from the original simple card
  { value: 'vehicle', label: 'Vehicles (legacy)' },
  { value: 'equip_drill', label: 'Drills/Equipment (legacy)' },
  { value: 'mats_seismo', label: 'Mats/Seismo (legacy)' },
];

const STATUS_OPTIONS: { value: EquipmentStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'in_shop', label: 'In Shop' },
  { value: 'retired', label: 'Retired' },
];

/** Infer a category from an asset code + description (Baystate conventions). */
export function inferCategory(code: string, description: string): EquipmentCategory {
  const c = code.toUpperCase();
  const d = description.toLowerCase();
  if (c.startsWith('FT') || d.includes('fuel trailer')) return 'fuel_trailer';
  // \b guards: "Komatsu" contains "mats" — substring matching misfiles it
  if (c.startsWith('XMATS') || /\bmats?\b/.test(d)) return 'blast_mats';
  if (c.startsWith('XSEISMO') || d.includes('seismograph')) return 'seismograph';
  if (c.startsWith('BORETR') || d.includes('bore track')) return 'bore_tracking';
  if (c.startsWith('R')) return d.includes('crusher') ? 'crusher' : 'rock_drill';
  if (c.startsWith('E') || d.includes('excavator')) return 'excavator';
  if (c.startsWith('C')) return d.includes('compressor') ? 'compressor' : 'conveyor';
  if (c.startsWith('T')) return d.includes('tractor') ? 'tractor' : 'trailer';
  if (c.startsWith('P')) return d.includes('service') ? 'service_truck' : 'pickup';
  return 'vehicle';
}

/** Pull make/model/year out of descriptions like "GMC 2016 Sierra 1500 Pickup" */
function parseIdentity(description: string): { make?: string; year?: number; model?: string } {
  const m = description.match(/^([A-Za-z]+)\s+(19|20)(\d{2})\s+(.+)$/);
  if (m) return { make: m[1], year: Number(`${m[2]}${m[3]}`), model: m[4] };
  const y = description.match(/(19|20)\d{2}/);
  return y ? { year: Number(y[0]) } : {};
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function DueChip({ label, date }: { label: string; date?: string }) {
  const days = daysUntil(date);
  if (days === null || days > 30) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[11px] text-safety-orange">
      <AlertTriangle className="h-3 w-3" />
      {label} {days < 0 ? 'overdue' : `due in ${days}d`}
    </span>
  );
}

export function AdminEquipmentPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const equipment = useLiveQuery(() => db.equipment.toArray()) ?? [];
  const [showRetired, setShowRetired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const visible = equipment
      .filter((e) => e.isActive)
      .filter((e) => showRetired || (e.status ?? 'active') !== 'retired')
      .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }));
    return EQUIPMENT_CATEGORIES.map((cat) => ({
      ...cat,
      items: visible.filter((e) => e.category === cat.value),
    })).filter((g) => g.items.length > 0);
  }, [equipment, showRetired]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-sm text-gray-500">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          show retired
        </label>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setImporting(!importing)}>
          <Upload className="h-4 w-4 mr-1" /> Bulk Import
        </Button>
        <Button onClick={() => setAdding(!adding)}>
          <Plus className="h-4 w-4 mr-1" /> Add Asset
        </Button>
      </div>

      {importing && <BulkImport existing={equipment} onDone={() => setImporting(false)} />}
      {adding && (
        <EquipmentForm
          title="New asset"
          online={online}
          onSave={async (values) => {
            const now = nowISO();
            await db.equipment.put({
              id: generateId(),
              isActive: true,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'local',
              ...values,
            } as Equipment);
            setAdding(false);
          }}
        />
      )}

      {grouped.map((group) => (
        <section key={group.value}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-3">
            {group.label} ({group.items.length})
          </h3>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {group.items.map((item) => (
              <div key={item.id} className={(item.status ?? 'active') === 'retired' ? 'p-3 opacity-50' : 'p-3'}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-navy shrink-0 w-16">{item.assetNumber}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[item.make, item.year, item.model].filter(Boolean).join(' ') || '—'}
                      {item.serialNumber && ` · SN ${item.serialNumber}`}
                      {item.plate && ` · ${item.plate}`}
                      {typeof item.hourMeter === 'number' && ` · ${item.hourMeter} hrs`}
                    </p>
                  </div>
                  {(item.status ?? 'active') !== 'active' && (
                    <Badge variant={item.status === 'in_shop' ? 'warning' : 'local'}>
                      {item.status === 'in_shop' ? 'in shop' : 'retired'}
                    </Badge>
                  )}
                  <DueChip label="DOT" date={item.dotInspectionDue} />
                  <DueChip label="calibration" date={item.calibrationDue} />
                  <Button variant="ghost" size="icon" title="Edit"
                    onClick={() => setEditingId(editingId === item.id ? null : item.id)}>
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>
                {editingId === item.id && (
                  <EquipmentForm
                    title={`Edit — ${item.assetNumber}`}
                    online={online}
                    initial={item}
                    onSave={async (values) => {
                      await db.equipment.update(item.id, { ...values, updatedAt: nowISO() });
                      setEditingId(null);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {grouped.length === 0 && (
        <p className="text-sm text-gray-400 p-4">No equipment yet — add assets or bulk import a list.</p>
      )}
    </div>
  );
}

interface FormValues {
  assetNumber: string;
  description: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  make: string;
  model: string;
  year: number | null;
  serialNumber: string;
  plate: string;
  hourMeter: number | null;
  odometer: number | null;
  dotInspectionDue: string;
  calibrationDue: string;
  notes: string;
}

function EquipmentForm({
  title,
  initial,
  online,
  onSave,
}: {
  title: string;
  initial?: Equipment;
  online: boolean;
  onSave: (values: FormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<FormValues>({
    assetNumber: initial?.assetNumber ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'pickup',
    status: initial?.status ?? 'active',
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    year: initial?.year ?? null,
    serialNumber: initial?.serialNumber ?? '',
    plate: initial?.plate ?? '',
    hourMeter: initial?.hourMeter ?? null,
    odometer: initial?.odometer ?? null,
    dotInspectionDue: initial?.dotInspectionDue ?? '',
    calibrationDue: initial?.calibrationDue ?? '',
    notes: initial?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormValues>) => setForm({ ...form, ...patch });

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3 space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Code / asset #</Label>
          <Input value={form.assetNumber} onChange={(e) => set({ assetNumber: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category}
            onChange={(e) => set({ category: e.target.value as EquipmentCategory })}
            options={EQUIPMENT_CATEGORIES} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status}
            onChange={(e) => set({ status: e.target.value as EquipmentStatus })}
            options={STATUS_OPTIONS} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>Make</Label>
            <Input value={form.make} onChange={(e) => set({ make: e.target.value })} />
          </div>
          <div className="w-20">
            <Label>Year</Label>
            <Input type="number" value={form.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        <div>
          <Label>Model</Label>
          <Input value={form.model} onChange={(e) => set({ model: e.target.value })} />
        </div>
        <div>
          <Label>Serial / VIN</Label>
          <Input value={form.serialNumber} onChange={(e) => set({ serialNumber: e.target.value })} />
        </div>
        <div>
          <Label>Plate</Label>
          <Input value={form.plate} onChange={(e) => set({ plate: e.target.value })} />
        </div>
        <div>
          <Label>Hour meter</Label>
          <Input type="number" value={form.hourMeter ?? ''} onChange={(e) => set({ hourMeter: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <Label>Odometer</Label>
          <Input type="number" value={form.odometer ?? ''} onChange={(e) => set({ odometer: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <Label>DOT inspection due</Label>
          <Input type="date" value={form.dotInspectionDue} onChange={(e) => set({ dotInspectionDue: e.target.value })} />
        </div>
        <div>
          <Label>Calibration due</Label>
          <Input type="date" value={form.calibrationDue} onChange={(e) => set({ calibrationDue: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
      <Button
        disabled={busy || !online || !form.assetNumber.trim() || !form.description.trim()}
        onClick={() => {
          setBusy(true);
          void onSave(form).finally(() => setBusy(false));
        }}
      >
        Save
      </Button>
    </div>
  );
}

function BulkImport({ existing, onDone }: { existing: Equipment[]; onDone: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const known = new Set(existing.map((e) => e.assetNumber.toUpperCase()));
      const now = nowISO();
      let added = 0;
      let skipped = 0;
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^(\S+)[\s\t]+(.+)$/);
        if (!m) {
          skipped++;
          continue;
        }
        const [, code, description] = m;
        if (known.has(code.toUpperCase())) {
          skipped++;
          continue;
        }
        known.add(code.toUpperCase());
        const identity = parseIdentity(description.trim());
        await db.equipment.put({
          id: generateId(),
          assetNumber: code,
          description: description.trim(),
          category: inferCategory(code, description),
          status: 'active',
          isActive: true,
          ...identity,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        } as Equipment);
        added++;
      }
      setResult(`Imported ${added} asset${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (blank/duplicate)` : ''}.`);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
      <p className="text-sm font-medium">Bulk import</p>
      <p className="text-xs text-gray-400">
        One asset per line: <span className="font-mono">CODE description</span>. Category,
        make, model, and year are worked out automatically — review after import.
      </p>
      <textarea
        className="w-full h-40 rounded-lg border border-gray-300 p-2 font-mono text-xs"
        placeholder={'P002\tGMC 2016 Sierra 1500 Pickup\nR1004\tFurukawa 9ES 2002 Rock Drill'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>
          Import
        </Button>
        <Button variant="ghost" onClick={onDone}>Close</Button>
        {result && <p className="text-sm text-gray-500">{result}</p>}
      </div>
    </div>
  );
}
