// A drill-down level's list (S8b, Matthew: "I also don't want super long
// scrolling lists"): a header with the count and the level's + New action,
// a filter box once the list is long enough to need one, 15 rows and a
// "Show all N" line. The rows are the caller's (ListRow).
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';

export const WINDOW = 15;

export function WindowedList<T>({
  label,
  items,
  matches,
  render,
  action,
  form,
  empty,
  filterAt = 8,
  filterPlaceholder = 'Filter…',
  testId,
}: {
  label: string;
  items: T[];
  /** Does the item match the typed filter? */
  matches: (item: T, q: string) => boolean;
  render: (item: T) => ReactNode;
  /** The level's "+ New …" button */
  action?: ReactNode;
  /** The inline add form, when open — rendered above the rows */
  form?: ReactNode;
  empty: ReactNode;
  /** Show the filter box once the list has this many rows */
  filterAt?: number;
  filterPlaceholder?: string;
  testId: string;
}) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const needle = q.trim().toLowerCase();
  const filtered = needle ? items.filter((i) => matches(i, needle)) : items;
  const shown = all || needle ? filtered : filtered.slice(0, WINDOW);
  return (
    <div className="space-y-2" data-windowed-list={testId}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex-1" data-list-label>
          {label} · {items.length}
        </p>
        {items.length >= filterAt && (
          <Input
            className="h-8 text-sm max-w-[200px]"
            placeholder={filterPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-list-filter
          />
        )}
        {action}
      </div>
      {form}
      {shown.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden" data-list-rows>
          {shown.map(render)}
        </div>
      )}
      {!all && !needle && filtered.length > WINDOW && (
        <button
          type="button"
          className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
          onClick={() => setAll(true)}
          data-list-more
        >
          Show all {filtered.length} ▸
        </button>
      )}
      {items.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-gray-400 px-1">Nothing matches “{q.trim()}”.</p>
      )}
      {items.length === 0 && <div className="text-sm text-gray-400 px-1">{empty}</div>}
    </div>
  );
}
