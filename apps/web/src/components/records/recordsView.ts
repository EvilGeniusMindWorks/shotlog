// S21 (Matthew, Sep 16 2026: "everything looks messy with so much there"):
// what the Records list shows is the office's choice, remembered on the
// device — the optional columns, the density, whether the tree is showing.
export type OptionalColumn = 'customer' | 'shots' | 'lbs' | 'holes' | 'rig' | 'approvedBy';
export type Density = 'comfortable' | 'compact';

export const OPTIONAL_COLUMNS: { key: OptionalColumn; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'shots', label: 'Shots' },
  { key: 'lbs', label: 'Lbs' },
  { key: 'holes', label: 'Holes' },
  { key: 'rig', label: 'Rig' },
  { key: 'approvedBy', label: 'Approved by' },
];

export interface RecordsView {
  columns: OptionalColumn[];
  density: Density;
  tree: boolean;
}

const KEY = 'shotlog-records-view';
const DEFAULT: RecordsView = { columns: [], density: 'comfortable', tree: true };

export function loadRecordsView(): RecordsView {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<RecordsView>;
    const known = new Set(OPTIONAL_COLUMNS.map((c) => c.key));
    return {
      columns: Array.isArray(v.columns) ? (v.columns.filter((c) => known.has(c as OptionalColumn)) as OptionalColumn[]) : [],
      density: v.density === 'compact' ? 'compact' : 'comfortable',
      tree: v.tree !== false,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveRecordsView(v: RecordsView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* a private window forgets; the list still works */
  }
}
