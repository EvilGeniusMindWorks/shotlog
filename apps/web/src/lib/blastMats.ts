// Blast mats belong to the log, not the shot (Round S18, Matthew: "I'll put
// the total for all shots on the log"). Older logs carry a Yes/No and a count
// per shot; they read through here until someone answers on the log.
import type { ExplosiveUsage, Shot } from '@/db/schema';

export function logBlastMats(usage: ExplosiveUsage | undefined, shots: Shot[]): { mats: boolean | undefined; count: number | undefined } {
  if (usage && usage.blastMats !== undefined) return { mats: usage.blastMats, count: usage.blastMatCount };
  const known = shots.filter((s) => s.drillParams?.blastMats !== undefined);
  if (known.length === 0) return { mats: undefined, count: undefined };
  const count = known.reduce((n, s) => n + (s.drillParams.blastMatCount ?? 0), 0);
  return { mats: known.some((s) => s.drillParams.blastMats === true), count: count > 0 ? count : undefined };
}

/** "Yes · 12" · "No" · "—" for the print and the PDF */
export function blastMatsText(usage: ExplosiveUsage | undefined, shots: Shot[]): string {
  const { mats, count } = logBlastMats(usage, shots);
  if (mats === true) return `Yes${count ? ` · ${count}` : ''}`;
  if (mats === false) return 'No';
  return '—';
}
