import { useMemo, useState } from 'react';
import { Flame, Pencil, Search, Target, Trash2, X, Zap } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import type {
  DetonatorLineItem,
  ExplosiveUsage,
  ExplosiveLineItem,
  ProductCatalogItem,
  ProductCategory,
  Shot,
} from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard, IconChip } from '@/components/ui/section-card';

const BOOSTER_CATEGORIES: ProductCategory[] = ['booster', 'booster_electronic'];

interface Props {
  explosiveUsage: ExplosiveUsage;
  shots: Shot[];
}

export function ExplosiveUsageForm({ explosiveUsage, shots: _shots }: Props) {
  const [picker, setPicker] = useState<'explosive' | 'booster' | null>(null);

  const updateUsage = (updates: Partial<ExplosiveUsage>) => {
    db.explosiveUsages.update(explosiveUsage.id, { ...updates, updatedAt: nowISO() });
  };

  const addProduct = (product: ProductCatalogItem) => {
    const item: ExplosiveLineItem = {
      productId: product.id,
      productName: product.productName,
      manufacturer: product.manufacturer,
      category: product.category,
      quantity: 0,
      unitType: product.unitType,
      weightMultiplier: product.weightMultiplier,
      totalWeight: 0,
      shotAllocations: {},
    };
    const products = [...explosiveUsage.products, item];
    updateUsage({ products, totalPoundsShot: calcTotal(products) });
    setPicker(null);
  };

  const setQuantity = (index: number, qty: number) => {
    const products = [...explosiveUsage.products];
    products[index] = {
      ...products[index],
      quantity: qty,
      totalWeight: qty * products[index].weightMultiplier,
    };
    updateUsage({ products, totalPoundsShot: calcTotal(products) });
  };

  const removeProduct = (index: number) => {
    const products = explosiveUsage.products.filter((_, i) => i !== index);
    updateUsage({ products, totalPoundsShot: calcTotal(products) });
  };

  const isBooster = (item: ExplosiveLineItem) =>
    BOOSTER_CATEGORIES.includes(item.category as ProductCategory);
  const explosives = explosiveUsage.products
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isBooster(item));
  const boosters = explosiveUsage.products
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isBooster(item));

  const explosivesLbs = explosives.reduce((s, { item }) => s + item.totalWeight, 0);
  const boosterLbs = boosters.reduce((s, { item }) => s + item.totalWeight, 0);
  const detCount = explosiveUsage.detonators.reduce((s, d) => s + d.quantity, 0);

  return (
    <>
      {/* ── Explosives ── */}
      <SectionCard
        title="Explosives"
        icon={<IconChip tint="red"><Flame className="h-4 w-4" /></IconChip>}
        subtitle="Blasting agents & high explosives"
        complete={explosives.length > 0 && explosives.every(({ item }) => item.quantity > 0)}
      >
        <p className="text-xs text-gray-400">
          Enter total quantity. Per-shot breakdown auto-calculated.
        </p>
        {explosives.map(({ item, index }) => (
          <ProductLine
            key={index}
            item={item}
            onQuantity={(q) => setQuantity(index, q)}
            onRemove={() => removeProduct(index)}
          />
        ))}
        <button
          className="text-sm font-semibold text-blue-600 min-h-[40px]"
          onClick={() => setPicker('explosive')}
        >
          + Add Product
        </button>
      </SectionCard>

      {/* ── Boosters ── */}
      <SectionCard
        title="Boosters"
        icon={<IconChip tint="orange"><Target className="h-4 w-4" /></IconChip>}
        subtitle={
          boosters.length > 0
            ? boosters.map(({ item }) => `${item.productName.match(/[\d/]+ ?lb/i)?.[0] ?? item.productName} × ${item.quantity} ea`).join(', ')
            : 'Cast primers'
        }
        complete={boosters.length === 0 ? undefined : boosters.every(({ item }) => item.quantity > 0)}
      >
        {boosters.map(({ item, index }) => (
          <ProductLine
            key={index}
            item={item}
            onQuantity={(q) => setQuantity(index, q)}
            onRemove={() => removeProduct(index)}
          />
        ))}
        <button
          className="text-sm font-semibold text-blue-600 min-h-[40px]"
          onClick={() => setPicker('booster')}
        >
          + Add Booster
        </button>
      </SectionCard>

      {/* ── Detonators & Lead ── */}
      <DetonatorsCard explosiveUsage={explosiveUsage} onUpdate={updateUsage} />

      {/* ── Total banner ── */}
      <div className="bg-navy rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-widest text-navy-200 uppercase">
            Total Pounds Shot
          </div>
          <div className="text-[11px] text-navy-300">Explosives + Boosters</div>
        </div>
        <span className="font-mono text-3xl font-bold text-safety-orange">
          {(explosivesLbs + boosterLbs).toFixed(1)}
        </span>
      </div>
      {detCount > 0 && (
        <p className="text-[11px] text-gray-400 text-right px-1 !mt-1">
          + {detCount} detonators (not in pounds total)
        </p>
      )}

      {picker && (
        <ProductPickerDialog
          boosters={picker === 'booster'}
          onSelect={addProduct}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

/** One product line: name + lbs/unit subtitle · qty · lbs · edit · delete */
function ProductLine({
  item,
  onQuantity,
  onRemove,
}: {
  item: ExplosiveLineItem;
  onQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(item.quantity === 0);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{item.productName}</div>
        <div className="text-[11px] text-gray-400">
          {item.weightMultiplier} lbs/{item.unitType}
        </div>
      </div>
      {editing ? (
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          className="w-20 h-9 text-right font-mono"
          defaultValue={item.quantity || ''}
          placeholder="0"
          onBlur={(e) => {
            onQuantity(parseFloat(e.target.value) || 0);
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <span className="font-mono font-bold text-[15px]">{item.quantity}</span>
      )}
      <span className="font-mono text-xs text-gray-500 w-16 text-right shrink-0">
        {item.totalWeight > 0 ? `${item.totalWeight.toFixed(1)} lbs` : '—'}
      </span>
      <button
        className="h-8 w-8 flex items-center justify-center text-gray-300 hover:text-gray-500"
        title="Edit quantity"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        className="h-8 w-8 flex items-center justify-center text-gray-300 hover:text-red-500"
        title="Remove"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Detonators by delay series + lead line (wireframe §4.7) */
function DetonatorsCard({
  explosiveUsage,
  onUpdate,
}: {
  explosiveUsage: ExplosiveUsage;
  onUpdate: (updates: Partial<ExplosiveUsage>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', quantity: '' });
  const dets = explosiveUsage.detonators;

  const subtitle =
    [
      dets.length > 0 && `${dets[0].name.split('—')[0].trim()} × ${dets.reduce((s, d) => s + d.quantity, 0)}`,
      explosiveUsage.leadLine > 0 && `Lead ${explosiveUsage.leadLine}'`,
    ]
      .filter(Boolean)
      .join(', ') || 'Delay series & lead wire';

  const addDetonator = () => {
    if (!form.name.trim()) return;
    const det: DetonatorLineItem = {
      name: form.name.trim(),
      unitLength: '',
      quantity: parseFloat(form.quantity) || 0,
      shipment1Qty: 0,
      shipment2Qty: 0,
    };
    onUpdate({ detonators: [...dets, det] });
    setForm({ name: '', quantity: '' });
    setAdding(false);
  };

  return (
    <SectionCard
      title="Detonators & Lead"
      icon={<IconChip tint="yellow"><Zap className="h-4 w-4" /></IconChip>}
      subtitle={subtitle}
      complete={dets.length > 0 ? true : undefined}
    >
      {dets.map((det, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
          <span className="text-sm font-semibold flex-1 truncate">{det.name}</span>
          <span className="font-mono font-bold text-[15px]">{det.quantity}</span>
          <span className="text-xs text-gray-400 w-8">ea</span>
          <button
            className="h-8 w-8 flex items-center justify-center text-gray-300 hover:text-red-500"
            title="Remove"
            onClick={() => onUpdate({ detonators: dets.filter((_, j) => j !== i) })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Lead line */}
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-sm font-semibold flex-1">Lead In Line</span>
        <Input
          type="number"
          inputMode="decimal"
          className="w-24 h-9 text-right font-mono"
          value={explosiveUsage.leadLine || ''}
          onChange={(e) => onUpdate({ leadLine: parseFloat(e.target.value) || 0 })}
          placeholder="0"
        />
        <span className="text-xs text-gray-400 w-8">LF</span>
      </div>

      {adding ? (
        <div className="flex gap-2 items-end border border-navy rounded-lg p-2">
          <div className="flex-1">
            <Label className="text-[10px] uppercase text-gray-500">Series (e.g. QR-12 — 9MS)</Label>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addDetonator()}
            />
          </div>
          <div className="w-20">
            <Label className="text-[10px] uppercase text-gray-500">Qty</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addDetonator()}
            />
          </div>
          <Button size="sm" onClick={addDetonator} disabled={!form.name.trim()}>
            Add
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setAdding(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          className="text-sm font-semibold text-blue-600 min-h-[40px]"
          onClick={() => setAdding(true)}
        >
          + Add Detonator / Lead
        </button>
      )}
    </SectionCard>
  );
}

function calcTotal(products: ExplosiveLineItem[]): number {
  return products.reduce((sum, p) => sum + p.totalWeight, 0);
}

function ProductPickerDialog({
  boosters,
  onSelect,
  onClose,
}: {
  boosters: boolean;
  onSelect: (p: ProductCatalogItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  // NOTE: boolean fields can't be indexed in IndexedDB — use filter(), not where()
  const products =
    useLiveQuery(() => db.productCatalog.filter((p) => p.isActive).toArray()) ?? [];

  const filtered = useMemo(() => {
    let list = products.filter(
      (p) => BOOSTER_CATEGORIES.includes(p.category) === boosters,
    );
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.manufacturer.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, search, boosters]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductCatalogItem[]>();
    for (const p of filtered) {
      const list = map.get(p.manufacturer) ?? [];
      list.push(p);
      map.set(p.manufacturer, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-xl sm:rounded-xl">
        <div className="p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{boosters ? 'Select Booster' : 'Select Product'}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 p-4">
          {Array.from(grouped.entries()).map(([mfr, items]) => (
            <div key={mfr} className="mb-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {mfr}
              </h4>
              {items.map((p) => (
                <button
                  key={p.id}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 active:bg-gray-100 flex items-center justify-between"
                  onClick={() => onSelect(p)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.productName}</p>
                    <p className="text-xs text-gray-500">
                      {p.category.replace('_', ' ')} — {p.weightMultiplier} lbs/{p.unitType}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8">No products found</p>
          )}
        </div>
      </div>
    </div>
  );
}
