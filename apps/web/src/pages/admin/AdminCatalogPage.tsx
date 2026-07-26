// Product catalog management. Reads come from the live synced replica;
// writes go through admin REST (online-only, immediate errors) and fan
// back out to every device via sync.
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch } from '@/lib/session';
import type { ProductCatalogItem } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipSelect } from '@/components/ui/chip-select';

const CATEGORY_OPTIONS = [
  { value: 'bulk', label: 'Bulk' },
  { value: 'anfo', label: 'ANFO' },
  { value: 'anfo_wr', label: 'ANFO WR' },
  { value: 'gel_dynamite', label: 'Gel/Dynamite' },
  { value: 'emulsion', label: 'Emulsion' },
  { value: 'booster', label: 'Booster' },
  { value: 'booster_electronic', label: 'Electronic Booster' },
  { value: 'cartridge', label: 'Cartridge' },
];

interface ProductForm {
  manufacturer: string;
  productName: string;
  category: string;
  weightMultiplier: string;
  unitType: string;
}

const EMPTY_FORM: ProductForm = {
  manufacturer: '',
  productName: '',
  category: 'cartridge',
  weightMultiplier: '',
  unitType: 'stick',
};

export function AdminCatalogPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const products = useLiveQuery(() => db.productCatalog.toArray()) ?? [];
  const manufacturers = useMemo(
    () => [...new Set(products.map((p) => p.manufacturer))].sort(),
    [products],
  );

  const visible = products
    .filter((p) => showInactive || p.isActive)
    .filter(
      (p) =>
        !search ||
        p.productName.toLowerCase().includes(search.toLowerCase()) ||
        p.manufacturer.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.sortOrder - b.sortOrder);

  const call = async (path: string, method: string, body: unknown) => {
    setError(null);
    const res = await authedFetch(path, { method, body: JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(parsed?.error ?? `request failed (${res.status})`);
      return false;
    }
    return true;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-500">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          show deactivated
        </label>
        <div className="flex-1" />
        <Button onClick={() => setAdding(!adding)} disabled={!online}>
          <Plus className="h-4 w-4 mr-1" /> Add Product
        </Button>
      </div>

      {error && <p className="text-sm text-violation">{error}</p>}

      {adding && (
        <ProductFormCard
          title="New product"
          initial={EMPTY_FORM}
          manufacturers={manufacturers}
          online={online}
          onSave={async (form) => {
            const ok = await call('/admin/catalog', 'POST', {
              manufacturer: form.manufacturer.trim(),
              productName: form.productName.trim(),
              category: form.category,
              weightMultiplier: parseFloat(form.weightMultiplier),
              unitType: form.unitType.trim(),
            });
            if (ok) setAdding(false);
          }}
        />
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {visible.map((p) => (
          <div key={p.id} className={p.isActive ? 'p-3' : 'p-3 opacity-50'}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.productName}</p>
                <p className="text-xs text-gray-400">
                  {p.manufacturer} · {p.weightMultiplier} lbs/{p.unitType}
                </p>
              </div>
              <Badge variant="secondary">
                {CATEGORY_OPTIONS.find((c) => c.value === p.category)?.label ?? p.category}
              </Badge>
              {!p.isActive && <Badge variant="local">deactivated</Badge>}
              <Button variant="ghost" size="icon" title="Edit" disabled={!online}
                onClick={() => setEditingId(editingId === p.id ? null : p.id)}>
                <Pencil className="h-4 w-4 text-gray-400" />
              </Button>
              <Button variant="ghost" size="sm" disabled={!online}
                onClick={() => void call(`/admin/catalog/${p.id}`, 'PUT', { isActive: !p.isActive })}>
                {p.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
            {editingId === p.id && (
              <ProductFormCard
                title={`Edit — ${p.productName}`}
                initial={{
                  manufacturer: p.manufacturer,
                  productName: p.productName,
                  category: p.category,
                  weightMultiplier: String(p.weightMultiplier),
                  unitType: p.unitType,
                }}
                manufacturers={manufacturers}
                online={online}
                onSave={async (form) => {
                  const ok = await call(`/admin/catalog/${p.id}`, 'PUT', {
                    manufacturer: form.manufacturer.trim(),
                    productName: form.productName.trim(),
                    category: form.category,
                    weightMultiplier: parseFloat(form.weightMultiplier),
                    unitType: form.unitType.trim(),
                  });
                  if (ok) setEditingId(null);
                }}
              />
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="p-4 text-sm text-gray-400">No products match.</p>}
      </div>
      <p className="text-xs text-gray-400">
        Weight multiplier is pounds per {`{unit}`} — it drives every explosive weight
        calculation, so double-check it against the manufacturer sheet.
      </p>
    </div>
  );
}

function ProductFormCard({
  title,
  initial,
  manufacturers,
  online,
  onSave,
}: {
  title: string;
  initial: ProductForm;
  manufacturers: string[];
  online: boolean;
  onSave: (form: ProductForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const [busy, setBusy] = useState(false);
  const valid =
    form.manufacturer.trim() &&
    form.productName.trim() &&
    form.unitType.trim() &&
    parseFloat(form.weightMultiplier) > 0;

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3 space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Manufacturer</Label>
          <Input
            list="catalog-manufacturers"
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
          />
          <datalist id="catalog-manufacturers">
            {manufacturers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Product name</Label>
          <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Category</Label>
          <ChipSelect value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATEGORY_OPTIONS} />
        </div>
        <div>
          <Label>Weight (lbs per unit)</Label>
          <Input type="number" inputMode="decimal" value={form.weightMultiplier}
            onChange={(e) => setForm({ ...form, weightMultiplier: e.target.value })} />
        </div>
        <div>
          <Label>Unit (stick, bag, each, ft...)</Label>
          <Input value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value })} />
        </div>
      </div>
      <Button disabled={!valid || busy || !online}
        onClick={() => {
          setBusy(true);
          void onSave(form).finally(() => setBusy(false));
        }}>
        Save
      </Button>
    </div>
  );
}
