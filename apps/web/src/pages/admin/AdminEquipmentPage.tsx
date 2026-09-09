// Equipment registry: full asset identity + compliance dates, with a
// bulk-paste importer for "CODE  Description" lists. S8b (Matthew: "group
// the types so it's not such a long list… search and filter… by repair
// status"): four grouped tabs with counts, type chips inside a tab, search
// across groups, stacking filter chips. The repair queue is NOT here — it
// is the shop's list (shop home). Writable by admin/supervisor/mechanic
// (the matrix enforces server-side); the mechanic's Fleet item opens this.
import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Pencil, Plus, Upload } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { useOpenTickets } from '@/hooks/useMaintenance';
import { generateId, nowISO } from '@/lib/utils';
import { cn } from '@/lib/utils';
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

/** S8b grouping B: nothing is "miscellaneous"; the seismograph's calibration
 *  sits with the mats, not next to a crusher. Legacy buckets fold in. */
export const EQUIPMENT_GROUPS: { id: string; label: string; cats: EquipmentCategory[] }[] = [
  { id: 'drilling', label: 'Drilling', cats: ['rock_drill', 'compressor', 'bore_tracking', 'equip_drill'] },
  { id: 'trucks', label: 'Trucks & trailers', cats: ['pickup', 'service_truck', 'trailer', 'fuel_trailer', 'vehicle'] },
  { id: 'machines', label: 'Machines', cats: ['crusher', 'conveyor', 'excavator', 'tractor'] },
  { id: 'blast', label: 'Blast gear', cats: ['blast_mats', 'seismograph', 'mats_seismo'] },
];
const LEGACY_CATS: EquipmentCategory[] = ['vehicle', 'equip_drill', 'mats_seismo'];
type FilterKey = 'active' | 'in_shop' | 'retired' | 'repair' | 'oos' | 'due';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'in_shop', label: 'In shop' },
  { key: 'retired', label: 'Retired' },
  { key: 'repair', label: 'Repair open' },
  { key: 'oos', label: 'Out of service' },
  { key: 'due', label: 'Due ≤30 d' },
];
const NO_FILTERS: Record<FilterKey, boolean> = { active: false, in_shop: false, retired: false, repair: false, oos: false, due: false };
const TAB_KEY = 'shotlog-equipment-tab';
export const categoryLabel = (c: EquipmentCategory) => EQUIPMENT_CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const groupOf = (c: EquipmentCategory) => EQUIPMENT_GROUPS.find((g) => g.cats.includes(c))?.id ?? 'machines';

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
  const navigate = useNavigate();
  const equipment = useLiveQuery(() => db.equipment.toArray()) ?? [];
  const openTickets = useOpenTickets();
  // asset id → whether any open ticket has it out of service
  // machine → is any open ticket out-of-service (badge colour); ticketId → the ticket to open (S9a)
  const ticketed = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const t of openTickets) m.set(t.equipmentId, (m.get(t.equipmentId) ?? false) || t.outOfService);
    return m;
  }, [openTickets]);
  const ticketFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of [...openTickets].sort((a, b) => Number(b.outOfService) - Number(a.outOfService))) if (!m.has(t.equipmentId)) m.set(t.equipmentId, t.id);
    return m;
  }, [openTickets]);
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem(TAB_KEY) ?? 'all';
    } catch {
      return 'all';
    }
  });
  const [type, setType] = useState<EquipmentCategory | null>(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>(NO_FILTERS);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pickTab = (id: string) => {
    setTab(id);
    setType(null);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* private mode */
    }
  };
  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;
  const anyFilter = FILTERS.some((f) => filters[f.key]);
  const dueDays = (e: Equipment): number | null => {
    const ds = [daysUntil(e.dotInspectionDue), daysUntil(e.calibrationDue)].filter((d): d is number => d !== null);
    return ds.length ? Math.min(...ds) : null;
  };
  // Search + filter chips (status · repair · due), before tabs: the tab
  // counts follow so the office sees where the filtered items sit
  const passes = (e: Equipment): boolean => {
    if (!e.isActive) return false;
    if (searching && ![e.assetNumber, e.description, e.make, e.model, e.plate, e.serialNumber].some((v) => v?.toLowerCase().includes(needle))) return false;
    const st: EquipmentStatus = e.status ?? 'active';
    const picked = (['active', 'in_shop', 'retired'] as const).filter((k) => filters[k]);
    const allowed: EquipmentStatus[] = picked.length ? picked : ['active', 'in_shop'];
    if (!allowed.includes(st)) return false;
    if (filters.repair && !ticketed.has(e.id)) return false;
    if (filters.oos && !ticketed.get(e.id)) return false;
    if (filters.due) {
      const d = dueDays(e);
      if (d === null || d > 30) return false;
    }
    return true;
  };
  const matched = equipment
    .filter(passes)
    .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }));
  const present = equipment.filter((e) => e.isActive);
  const tabs = [
    { id: 'all', label: 'All', count: matched.length },
    ...EQUIPMENT_GROUPS.filter((g) => present.some((e) => g.cats.includes(e.category))).map((g) => ({
      id: g.id,
      label: g.label,
      count: matched.filter((e) => g.cats.includes(e.category)).length,
    })),
  ];
  const curTab = tabs.some((t) => t.id === tab) ? tab : 'all';
  const group = EQUIPMENT_GROUPS.find((g) => g.id === curTab);
  // Searching spans every group so nothing hides behind a tab
  const rows = matched.filter((e) => (searching || !group || group.cats.includes(e.category)) && (!type || searching || e.category === type));
  const typeChips = group && !searching ? group.cats.filter((c) => matched.some((e) => e.category === c)) : [];
  const total = present.filter((e) => (e.status ?? 'active') !== 'retired').length;
  const filtered = searching || anyFilter;
  const newCategory: EquipmentCategory | undefined = type ?? group?.cats[0];

  return (
    <div className="space-y-3" data-equipment-page>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900" data-equipment-count>
          Equipment · {filtered ? `${matched.length} of ${total}` : total}
        </h3>
        <Input
          className="h-8 text-sm flex-1 min-w-[160px] max-w-[280px]"
          placeholder="Search code, description, make, plate…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-equip-search
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setImporting(!importing)} data-equip-import>
          <Upload className="h-4 w-4 mr-1" /> Import list
        </Button>
        <Button size="sm" onClick={() => setAdding(!adding)} data-equip-new>
          <Plus className="h-4 w-4 mr-1" /> New{newCategory ? ` · ${categoryLabel(newCategory).replace(/s$/, '').replace(/ \(legacy\)$/, '')}` : ''}
        </Button>
      </div>

      {/* Grouped tabs, like Catalog by manufacturer */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto items-center" data-equip-tabs>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickTab(t.id)}
            data-equip-tab={t.id}
            data-count={t.count}
            className={cn(
              'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              curTab === t.id && !searching
                ? 'border-safety-orange text-safety-orange'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
            <span className="ml-1 text-xs opacity-70">{t.count}</span>
          </button>
        ))}
        {searching && <span className="ml-2 text-[11px] text-gray-400 whitespace-nowrap">searching all groups</span>}
      </div>

      {typeChips.length > 1 && (
        <div className="flex flex-wrap gap-1.5" data-equip-types>
          {typeChips.map((c) => (
            <button
              key={c}
              type="button"
              data-equip-type={c}
              onClick={() => setType(type === c ? null : c)}
              className={cn(
                'inline-flex items-center min-h-[30px] px-2.5 rounded-full border text-xs font-medium',
                type === c ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
              )}
            >
              {categoryLabel(c)} <span className="ml-1 opacity-70">{matched.filter((e) => e.category === c).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5" data-equip-filters>
        <span className="text-[11px] text-gray-400 mr-1">Filter</span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-equip-filter={f.key}
            aria-pressed={filters[f.key]}
            onClick={() => setFilters({ ...filters, [f.key]: !filters[f.key] })}
            className={cn(
              'inline-flex items-center min-h-[30px] px-2.5 rounded-full border text-xs font-medium',
              filters[f.key] ? 'bg-navy text-white border-navy' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            {f.label}
          </button>
        ))}
        {filtered && (
          <button
            type="button"
            className="inline-flex items-center min-h-[30px] px-2.5 rounded-full border border-dashed border-gray-300 text-xs text-navy"
            onClick={() => {
              setFilters(NO_FILTERS);
              setQ('');
            }}
            data-equip-clear
          >
            Clear
          </button>
        )}
      </div>

      {importing && <BulkImport existing={equipment} onDone={() => setImporting(false)} />}
      {adding && (
        <EquipmentForm
          title={`New asset${newCategory ? ` — ${categoryLabel(newCategory)}` : ''}`}
          online={online}
          initialCategory={newCategory}
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

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" data-equip-list>
        {rows.map((item) => {
          const oos = ticketed.get(item.id);
          const legacy = LEGACY_CATS.includes(item.category);
          return (
            <div key={item.id} className={(item.status ?? 'active') === 'retired' ? 'p-3 opacity-50' : 'p-3'} data-equip-row={item.assetNumber} data-equip-cat={item.category}>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Name area → the asset's history page */}
                <button
                  className="flex items-center gap-2 min-w-0 flex-1 text-left hover:bg-gray-50 rounded-lg -m-1 p-1"
                  onClick={() => navigate(`/equipment/${item.id}`)}
                >
                  <span className="font-mono text-sm text-navy shrink-0 w-16">{item.assetNumber}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {categoryLabel(item.category).replace(' (legacy)', '')}
                      {legacy && <span className="italic"> · legacy — set the type</span>}
                      {[item.make, item.year, item.model].filter(Boolean).length > 0 && ` · ${[item.make, item.year, item.model].filter(Boolean).join(' ')}`}
                      {item.serialNumber && ` · SN ${item.serialNumber}`}
                      {item.plate && ` · ${item.plate}`}
                      {typeof item.hourMeter === 'number' && ` · ${item.hourMeter} hrs`}
                    </p>
                  </div>
                </button>
                {(item.status ?? 'active') !== 'active' && (
                  <Badge variant={item.status === 'in_shop' ? 'warning' : 'local'}>
                    {item.status === 'in_shop' ? 'in shop' : 'retired'}
                  </Badge>
                )}
                <DueChip label="DOT" date={item.dotInspectionDue} />
                <DueChip label="calibration" date={item.calibrationDue} />
                {ticketed.has(item.id) && (
                  <button
                    type="button"
                    title="Open the repair ticket"
                    data-equip-repair
                    onClick={() => navigate(`/tickets/${ticketFor.get(item.id)}`)}
                  >
                    <Badge variant={oos ? 'violation' : 'warning'}>{oos ? 'out of service' : 'repair open'}</Badge>
                  </button>
                )}
                {(item.category === 'rock_drill' || item.category === 'equip_drill') && (
                  <Button variant="ghost" size="icon" title="Daily checklist"
                    onClick={() => navigate(`/drill-checklist/${item.id}`)}>
                    <ClipboardCheck className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
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
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 p-4" data-equip-empty>
            {present.length === 0
              ? 'No equipment yet — add assets or import a list.'
              : filtered
                ? 'Nothing matches — clear a filter.'
                : 'Nothing in this group.'}
          </p>
        )}
      </div>
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
  initialCategory,
  online,
  onSave,
}: {
  title: string;
  initial?: Equipment;
  /** S8b: "+ New" on a tab presets the group's type */
  initialCategory?: EquipmentCategory;
  online: boolean;
  onSave: (values: FormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<FormValues>({
    assetNumber: initial?.assetNumber ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? initialCategory ?? 'pickup',
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
