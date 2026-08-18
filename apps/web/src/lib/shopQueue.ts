// The shop's ONE worklist (Round 4): tickets and due services merged,
// ordered by the SHOP — downtime cost and job criticality are shop
// knowledge, so the order is theirs. Default: downs first, then oldest.
// The chosen order lives on this bench's device; unknown/new items slot
// in at their default position.

export interface WorklistItem {
  /** 'ticket:<id>' or 'service:<equipmentId>:<type>' */
  key: string;
  down: boolean;
  /** ISO date used for the oldest-first default */
  date: string;
}

const ORDER_KEY = 'shotlog-shop-order';

export function defaultOrder<T extends WorklistItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(b.down) - Number(a.down) || a.date.localeCompare(b.date),
  );
}

export function readSavedOrder(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveOrder(keys: string[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(keys));
  } catch {
    // best-effort
  }
}

export function clearSavedOrder(): void {
  try {
    localStorage.removeItem(ORDER_KEY);
  } catch {
    // best-effort
  }
}

/** Saved order applied over the default: known keys keep the shop's
 *  sequence; new items splice in at their default rank. */
export function applyOrder<T extends WorklistItem>(items: T[], saved: string[]): T[] {
  const base = defaultOrder(items);
  if (saved.length === 0) return base;
  const rank = new Map(saved.map((k, i) => [k, i]));
  const known = base.filter((x) => rank.has(x.key)).sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  const fresh = base.filter((x) => !rank.has(x.key));
  // Merge: fresh items keep their default position relative to the list
  const out: T[] = [];
  let k = 0;
  for (const item of base) {
    if (rank.has(item.key)) {
      // consume the next known item in the shop's order
      out.push(known[k++]);
    } else {
      out.push(item);
    }
  }
  void fresh;
  return out;
}
