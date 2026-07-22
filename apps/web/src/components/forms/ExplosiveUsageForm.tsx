import { useState, useMemo } from 'react';
import { Plus, Trash2, Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { distributeByHoles } from '@shotlog/shared';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ExplosiveUsage, ExplosiveLineItem, Shot, ProductCatalogItem } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Props {
  explosiveUsage: ExplosiveUsage;
  shots: Shot[];
}

export function ExplosiveUsageForm({ explosiveUsage, shots }: Props) {
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [expandedAllocations, setExpandedAllocations] = useState<Set<number>>(new Set());

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
    setShowProductPicker(false);
  };

  const updateProduct = (index: number, field: keyof ExplosiveLineItem, value: number) => {
    const products = [...explosiveUsage.products];
    const item = { ...products[index] };
    if (field === 'quantity') {
      item.quantity = value;
      item.totalWeight = value * item.weightMultiplier;
    }
    products[index] = item;
    updateUsage({ products, totalPoundsShot: calcTotal(products) });
  };

  // shotAllocations holds MANUAL OVERRIDES only. Effective per-shot quantities
  // are computed live: overridden shots keep their value, the rest of the
  // total auto-distributes by hole-count ratio (top-down entry, Spec §4.6.3).
  const holeCounts = useMemo(
    () => shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles })),
    [shots],
  );

  const overrideAllocation = (index: number, shotId: string, qty: number) => {
    const products = [...explosiveUsage.products];
    const item = { ...products[index] };
    item.shotAllocations = { ...item.shotAllocations, [shotId]: qty };
    products[index] = item;
    updateUsage({ products });
  };

  const resetAllocation = (index: number, shotId: string) => {
    const products = [...explosiveUsage.products];
    const item = { ...products[index] };
    const { [shotId]: _removed, ...rest } = item.shotAllocations;
    item.shotAllocations = rest;
    products[index] = item;
    updateUsage({ products });
  };

  const removeProduct = (index: number) => {
    const products = explosiveUsage.products.filter((_, i) => i !== index);
    updateUsage({ products, totalPoundsShot: calcTotal(products) });
  };

  const toggleAllocation = (index: number) => {
    setExpandedAllocations((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Explosive Usage</CardTitle>
        <Button size="sm" onClick={() => setShowProductPicker(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {explosiveUsage.products.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No explosive products added yet. Tap "Add Item" to start.
          </p>
        ) : (
          explosiveUsage.products.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.productName}</p>
                  <p className="text-xs text-gray-500">
                    {item.manufacturer} — {item.category.replace('_', ' ')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeProduct(idx)}>
                  <Trash2 className="h-4 w-4 text-gray-400" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Total Qty ({item.unitType}s)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={item.quantity || ''}
                    onChange={(e) => updateProduct(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </div>
                <div className="text-right">
                  <Label className="text-xs text-gray-400">Weight</Label>
                  <p className="font-mono text-lg font-semibold">
                    {item.totalWeight > 0 ? item.totalWeight.toFixed(1) : '0'} lbs
                  </p>
                </div>
              </div>

              {/* Per-shot allocation: auto-distributed by hole count, tap to override */}
              {shots.length > 1 &&
                (() => {
                  const dist = distributeByHoles(item.quantity, holeCounts, item.shotAllocations);
                  return (
                    <div>
                      <button
                        className="text-xs text-navy flex items-center gap-1"
                        onClick={() => toggleAllocation(idx)}
                      >
                        {expandedAllocations.has(idx) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Per-Shot Allocation
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Auto
                        </Badge>
                      </button>
                      {expandedAllocations.has(idx) && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pl-4 border-l-2 border-gray-100">
                          {shots.map((shot) => {
                            const overridden = item.shotAllocations[shot.id] !== undefined;
                            return (
                              <div key={shot.id}>
                                <div className="flex items-center gap-1">
                                  <Label className="text-xs">
                                    Shot #{shot.shotNumber}
                                    <span className="text-gray-400 font-normal">
                                      {' '}
                                      · {shot.totals.numHoles} holes
                                    </span>
                                  </Label>
                                  {overridden && (
                                    <button
                                      title="Reset to auto"
                                      className="text-gray-400 hover:text-gray-600"
                                      onClick={() => resetAllocation(idx, shot.id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                                <Input
                                  type="number"
                                  step="1"
                                  inputMode="decimal"
                                  value={dist.allocations[shot.id] ?? ''}
                                  onChange={(e) =>
                                    overrideAllocation(
                                      idx,
                                      shot.id,
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className={overridden ? 'border-safety font-semibold' : ''}
                                  placeholder="0"
                                />
                              </div>
                            );
                          })}
                          {dist.remaining !== 0 && (
                            <div>
                              <Label className="text-xs text-red-500">
                                {dist.remaining < 0 ? 'Over-allocated' : 'Unallocated'}
                              </Label>
                              <p className="h-10 flex items-center font-mono text-sm text-red-600">
                                {Math.abs(dist.remaining)} {item.unitType}s
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          ))
        )}

        {/* Detonator section */}
        <div className="border-t border-gray-200 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Lead Line (LF)</Label>
              <Input
                type="number"
                step="1"
                value={explosiveUsage.leadLine || ''}
                onChange={(e) => updateUsage({ leadLine: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">Type of Cover</Label>
              <Input
                value={explosiveUsage.coverType}
                onChange={(e) => updateUsage({ coverType: e.target.value })}
                placeholder="Dirt, Mats"
              />
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="bg-navy-50 rounded-lg p-3 flex items-center justify-between">
          <span className="font-semibold text-navy">TOTAL POUNDS SHOT</span>
          <span className="font-mono text-xl font-bold text-navy">
            {explosiveUsage.totalPoundsShot.toFixed(1)} lbs
          </span>
        </div>
      </CardContent>

      {showProductPicker && (
        <ProductPickerDialog onSelect={addProduct} onClose={() => setShowProductPicker(false)} />
      )}
    </Card>
  );
}

function calcTotal(products: ExplosiveLineItem[]): number {
  return products.reduce((sum, p) => sum + p.totalWeight, 0);
}

function ProductPickerDialog({
  onSelect,
  onClose,
}: {
  onSelect: (p: ProductCatalogItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  // NOTE: boolean fields can't be indexed in IndexedDB — use filter(), not where()
  const products = useLiveQuery(() => db.productCatalog.filter((p) => p.isActive).toArray()) ?? [];

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, search]);

  // Group by manufacturer
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
            <h3 className="font-semibold">Select Product</h3>
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
