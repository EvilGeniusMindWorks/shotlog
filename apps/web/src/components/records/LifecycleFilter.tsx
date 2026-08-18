// The list-side of the lifecycle pattern: every list of archivable records
// gains Active / Archived / All (default Active — archived records leave
// default lists but stay fully viewable).
import type { Archivable } from '@/db/schema';

export type LifecycleFilterValue = 'active' | 'archived' | 'all';

export function applyLifecycle<T extends Archivable>(
  items: T[],
  filter: LifecycleFilterValue,
): T[] {
  if (filter === 'all') return items;
  if (filter === 'archived') return items.filter((r) => Boolean(r.archivedAt));
  return items.filter((r) => !r.archivedAt);
}

export function LifecycleFilter({
  value,
  onChange,
}: {
  value: LifecycleFilterValue;
  onChange: (v: LifecycleFilterValue) => void;
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
      {(['active', 'archived', 'all'] as const).map((v) => (
        <button
          key={v}
          className={
            value === v
              ? 'px-2.5 py-1 font-medium bg-gray-700 text-white'
              : 'px-2.5 py-1 font-medium bg-white text-gray-500 hover:bg-gray-50'
          }
          onClick={() => onChange(v)}
        >
          {v === 'active' ? 'Active' : v === 'archived' ? 'Archived' : 'All'}
        </button>
      ))}
    </div>
  );
}
