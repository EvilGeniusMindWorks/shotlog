// Product catalog, organized by manufacturer. Manufacturers are
// first-class: add/rename/retire them, bulk-toggle their whole product
// line. Reads are live from sync; every write is admin REST.
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch } from '@/lib/session';
import { cn } from '@/lib/utils';
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
  productName: string;
  category: string;
  weightMultiplier: string;
  unitType: string;
}

const EMPTY_FORM: ProductForm = {
  productName: '',
  category: 'cartridge',
  weightMultiplier: '',
  unitType: 'stick',
};

export function AdminCatalogPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const manufacturers = useLiveQuery(() => db.manufacturers.toArray()) ?? [];
  const products = useLiveQuery(() => db.productCatalog.toArray()) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [showInactiveProducts, setShowInactiveProducts] = useState(false);
  const [addingMfr, setAddingMfr] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tabs = useMemo(
    () =>
      [...manufacturers]
        .filter((m) => showRetired || m.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [manufacturers, showRetired],
  );
  const current = tabs.find((m) => m.id === selectedId) ?? tabs[0] ?? null;

  const productsOf = (mfrId: string, mfrName: string) =>
    products
      .filter((p) => (p.manufacturerId ? p.manufacturerId === mfrId : p.manufacturer === mfrName))
      .filter((p) => showInactiveProducts || p.isActive)
      .filter((p) => !search || p.productName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.productName.localeCompare(b.productName));

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
      {/* Manufacturer tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto items-center">
        {tabs.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className={cn(
              'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              current?.id === m.id
                ? 'border-safety-orange text-safety-orange'
                : 'border-transparent text-gray-500 hover:text-gray-800',
              !m.isActive && 'line-through opacity-60',
            )}
          >
            {m.name}
          </button>
        ))}
        <button
          className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 whitespace-nowrap"
          onClick={() => {
            setAddingMfr(!addingMfr);
            setNameInput('');
          }}
        >
          <Plus className="h-4 w-4 inline" /> manufacturer
        </button>
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap pr-1">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          retired
        </label>
      </div>

      {error && <p className="text-sm text-violation">{error}</p>}

      {addingMfr && (
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex-1 max-w-xs">
            <Label>New manufacturer name</Label>
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          </div>
          <Button
            disabled={!online || !nameInput.trim()}
            onClick={async () => {
              if (await call('/admin/manufacturers', 'POST', { name: nameInput.trim() })) {
                setAddingMfr(false);
              }
            }}
          >
            Add
          </Button>
          <Button variant="ghost" onClick={() => setAddingMfr(false)}>Cancel</Button>
        </div>
      )}

      {current && (
        <>
          {/* Manufacturer actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder={`Search ${current.name} products`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <label className="flex items-center gap-1.5 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={showInactiveProducts}
                onChange={(e) => setShowInactiveProducts(e.target.checked)}
              />
              show deactivated
            </label>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" disabled={!online}
              onClick={() => {
                setRenaming(!renaming);
                setNameInput(current.name);
              }}>
              Rename
            </Button>
            <Button variant="ghost" size="sm" disabled={!online}
              onClick={() => void call(`/admin/manufacturers/${current.id}`, 'PUT', { isActive: !current.isActive })}>
              {current.isActive ? 'Retire' : 'Reactivate'}
            </Button>
            <Button variant="outline" size="sm" disabled={!online}
              onClick={() => void call(`/admin/manufacturers/${current.id}/set-products-active`, 'POST', { active: false })}>
              Deactivate line
            </Button>
            <Button variant="outline" size="sm" disabled={!online}
              onClick={() => void call(`/admin/manufacturers/${current.id}/set-products-active`, 'POST', { active: true })}>
              Reactivate line
            </Button>
            <Button onClick={() => setAdding(!adding)} disabled={!online}>
              <Plus className="h-4 w-4 mr-1" /> Add Product
            </Button>
          </div>

          {renaming && (
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex-1 max-w-xs">
                <Label>Rename {current.name}</Label>
                <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
              </div>
              <Button
                disabled={!online || !nameInput.trim() || nameInput.trim() === current.name}
                onClick={async () => {
                  if (await call(`/admin/manufacturers/${current.id}`, 'PUT', { name: nameInput.trim() })) {
                    setRenaming(false);
                  }
                }}
              >
                Rename line
              </Button>
              <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            </div>
          )}

          {!current.isActive && (
            <p className="text-sm text-gray-500 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2">
              {current.name} is retired — its products are hidden from field pickers.
            </p>
          )}

          {adding && (
            <ProductFormCard
              title={`New ${current.name} product`}
              initial={EMPTY_FORM}
              online={online}
              onSave={async (form) => {
                const ok = await call('/admin/catalog', 'POST', {
                  manufacturer: current.name,
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
            {productsOf(current.id, current.name).map((p) => (
              <div key={p.id} className={p.isActive ? 'p-3' : 'p-3 opacity-50'}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.productName}</p>
                    <p className="text-xs text-gray-400">
                      {p.weightMultiplier} lbs/{p.unitType}
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
                      productName: p.productName,
                      category: p.category,
                      weightMultiplier: String(p.weightMultiplier),
                      unitType: p.unitType,
                    }}
                    online={online}
                    onSave={async (form) => {
                      const ok = await call(`/admin/catalog/${p.id}`, 'PUT', {
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
            {productsOf(current.id, current.name).length === 0 && (
              <p className="p-4 text-sm text-gray-400">No products match.</p>
            )}
          </div>
        </>
      )}
      {!current && (
        <p className="text-sm text-gray-400 p-4">No manufacturers yet — add one to start the catalog.</p>
      )}
      <p className="text-xs text-gray-400">
        Weight multiplier is pounds per unit — it drives every explosive weight calculation,
        so double-check it against the manufacturer sheet.
      </p>
    </div>
  );
}

function ProductFormCard({
  title,
  initial,
  online,
  onSave,
}: {
  title: string;
  initial: ProductForm;
  online: boolean;
  onSave: (form: ProductForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductForm>(initial);
  const [busy, setBusy] = useState(false);
  const valid = form.productName.trim() && form.unitType.trim() && parseFloat(form.weightMultiplier) > 0;

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3 space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Product name</Label>
          <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label>Weight (lbs per unit)</Label>
            <Input type="number" inputMode="decimal" value={form.weightMultiplier}
              onChange={(e) => setForm({ ...form, weightMultiplier: e.target.value })} />
          </div>
          <div className="flex-1">
            <Label>Unit</Label>
            <Input value={form.unitType} onChange={(e) => setForm({ ...form, unitType: e.target.value })} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Label>Category</Label>
          <ChipSelect value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATEGORY_OPTIONS} />
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
