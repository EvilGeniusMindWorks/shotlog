// Round S11 (Sep 13 2026): Matthew — weights to four decimals everywhere; PF stays two.

/** Explosive weight for on-screen display: four fixed decimals, US thousands separators. */
export function fmtLbs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** Explosive weight for CSV export: four fixed decimals, no thousands separators. */
export function fmtLbsCsv(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return n.toFixed(4);
}

/** Catalog weight-per-unit multiplier: up to four decimals, trailing zeros trimmed. */
export function fmtMultiplier(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(4).replace(/\.?0+$/, '') || '0';
}

/** Powder Factor: always two fixed decimals. */
export function fmtPF(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}
