import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { db } from '@/db';
import { generateId, nowISO, cn } from '@/lib/utils';
import type { ColumnLayer, TypicalColumn } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export const LAYER_STYLES: Record<
  ColumnLayer['layerType'],
  { label: string; color: string; dashed?: boolean }
> = {
  stemming: { label: 'Stemming', color: '#a0aec0' },
  explosive: { label: 'Explosive', color: '#e53e3e' },
  booster: { label: 'Booster', color: '#dd6b20' },
  air_deck: { label: 'Air Deck', color: '#63b3ed', dashed: true },
  subdrill: { label: 'Sub Drill', color: '#4a5568' },
};

const LAYER_OPTIONS = Object.entries(LAYER_STYLES).map(([value, s]) => ({
  value,
  label: s.label,
}));

export function TypicalColumnBuilder({ shotId }: { shotId: string }) {
  const columns =
    useLiveQuery(
      async () =>
        (await db.typicalColumns.where('shotId').equals(shotId).toArray()).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      [shotId],
    ) ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [addType, setAddType] = useState<ColumnLayer['layerType']>('stemming');

  const active = columns.find((c) => c.id === activeId) ?? columns[0];

  const addColumn = async () => {
    const now = nowISO();
    const id = generateId();
    await db.typicalColumns.add({
      id,
      shotId,
      name: `Column ${columns.length + 1}`,
      holeDepth: 0,
      holeDiameter: 0,
      layers: [],
      snapshotImage: null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
    setActiveId(id);
  };

  const update = (updates: Partial<TypicalColumn>) => {
    if (!active) return;
    void db.typicalColumns.update(active.id, { ...updates, updatedAt: nowISO() });
  };

  const deleteColumn = async () => {
    if (!active) return;
    if (!confirm(`Delete ${active.name}?`)) return;
    await db.typicalColumns.delete(active.id);
    setActiveId(null);
  };

  // Layers are stored bottom-up (layerOrder 0 = bottom); edited top-down
  const topDown = active ? [...active.layers].sort((a, b) => b.layerOrder - a.layerOrder) : [];

  const saveLayers = (nextTopDown: ColumnLayer[]) => {
    update({
      layers: nextTopDown.map((layer, i) => ({
        ...layer,
        layerOrder: nextTopDown.length - 1 - i,
      })),
    });
  };

  const addLayer = () => {
    // Append below existing layers — blasters describe columns top-down
    // (stemming first), so adding in speaking order builds correctly
    saveLayers([
      ...topDown,
      {
        layerOrder: 0, // re-assigned by saveLayers
        layerType: addType,
        lengthFt: 0,
        productId: null,
        productName: null,
        notes: null,
      },
    ]);
  };

  const totalDepth = topDown.reduce((s, l) => s + l.lengthFt, 0);

  if (columns.length === 0) {
    return (
      <button
        className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors"
        onClick={addColumn}
      >
        <Plus className="h-5 w-5" /> Add Typical Column
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Column tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 pb-2">
        {columns.map((col) => (
          <button
            key={col.id}
            className={cn(
              'min-h-[40px] px-3 rounded-t-md text-sm font-medium border-b-2 -mb-[9px]',
              active?.id === col.id
                ? 'border-navy text-navy bg-navy-50'
                : 'border-transparent text-gray-500',
            )}
            onClick={() => {
              setActiveId(col.id);
              setRenaming(false);
            }}
          >
            {col.name}
          </button>
        ))}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={addColumn} title="Add column">
          <Plus className="h-4 w-4" />
        </Button>
        {active && (
          <>
            <Button variant="ghost" size="icon" className="h-9 w-9 ml-auto" onClick={() => setRenaming(true)} title="Rename">
              <Pencil className="h-4 w-4 text-gray-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={deleteColumn} title="Delete column">
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          </>
        )}
      </div>

      {renaming && active && (
        <Input
          autoFocus
          defaultValue={active.name}
          onBlur={(e) => {
            update({ name: e.target.value.trim() || active.name });
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      )}

      {active && (
        <div className="flex gap-4">
          {/* Layer editor */}
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Select
                value={addType}
                onChange={(e) => setAddType(e.target.value as ColumnLayer['layerType'])}
                options={LAYER_OPTIONS}
              />
              <Button size="sm" className="shrink-0" onClick={addLayer}>
                <Plus className="h-4 w-4 mr-1" /> Add Layer
              </Button>
            </div>

            {topDown.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">
                Add layers top-down: stemming, explosive, booster…
              </p>
            )}
            {topDown.map((layer, i) => {
              const style = LAYER_STYLES[layer.layerType];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                  style={{
                    backgroundColor: `${style.color}22`,
                    borderLeft: `4px ${style.dashed ? 'dashed' : 'solid'} ${style.color}`,
                  }}
                >
                  <span className="text-sm font-medium flex-1">{style.label}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="w-20 h-9 text-right font-mono"
                    value={layer.lengthFt || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const next = [...topDown];
                      next[i] = { ...layer, lengthFt: parseFloat(e.target.value) || 0 };
                      saveLayers(next);
                    }}
                  />
                  <span className="text-xs text-gray-500">ft</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...topDown];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      saveLayers(next);
                    }}
                  >
                    <ArrowUp className="h-4 w-4 text-gray-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={i === topDown.length - 1}
                    onClick={() => {
                      const next = [...topDown];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      saveLayers(next);
                    }}
                  >
                    <ArrowDown className="h-4 w-4 text-gray-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => saveLayers(topDown.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Live proportional visual */}
          <div className="w-24 shrink-0 text-center">
            <div className="text-[10px] text-gray-400 mb-1">Collar</div>
            <ColumnVisual layers={topDown} heightPx={Math.max(160, topDown.length * 40)} />
            <div className="text-xs font-bold font-mono mt-1">
              {totalDepth > 0 ? `${totalDepth.toFixed(1)}'` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Proportional borehole visual — bands sized by layer depth (top-down input) */
export function ColumnVisual({
  layers,
  heightPx,
  widthPx = 56,
}: {
  layers: ColumnLayer[];
  heightPx: number;
  widthPx?: number;
}) {
  const total = layers.reduce((s, l) => s + l.lengthFt, 0);
  if (total <= 0) {
    return (
      <div
        className="border-2 border-gray-300 rounded-b-lg mx-auto flex items-center justify-center text-[10px] text-gray-300"
        style={{ width: widthPx, height: heightPx }}
      >
        empty
      </div>
    );
  }
  return (
    <div
      className="border-2 border-gray-700 rounded-b-lg mx-auto overflow-hidden flex flex-col"
      style={{ width: widthPx, height: heightPx }}
    >
      {layers.map((layer, i) => {
        const style = LAYER_STYLES[layer.layerType];
        return (
          <div
            key={i}
            className="flex items-center justify-center text-white font-bold"
            style={{
              flexGrow: layer.lengthFt,
              flexBasis: 0,
              backgroundColor: style.color,
              fontSize: 9,
              border: style.dashed ? '1px dashed white' : undefined,
              minHeight: layer.lengthFt > 0 ? 12 : 0,
            }}
          >
            {layer.lengthFt > 0 && (
              <span className="leading-tight text-center">
                {style.label.slice(0, 4)}
                <br />
                {layer.lengthFt}'
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
