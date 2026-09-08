// Small readable facts about a site for list rows and About cards (S8b).
import type { Site } from '@/db/schema';
import { daysUntil } from '@/lib/jobActivity';

/** "no permits" · "permit expired" · "permit 12d" · "permits ok" */
export function permitStatus(site: Pick<Site, 'permits'>): { text: string; warn: boolean } {
  const permits = site.permits ?? [];
  if (permits.length === 0) return { text: 'no permits', warn: false };
  const days = permits
    .map((p) => (p.expiresAt ? daysUntil(p.expiresAt) : undefined))
    .filter((d): d is number => d !== undefined);
  if (days.length === 0) return { text: `${permits.length} permit${permits.length === 1 ? '' : 's'}`, warn: false };
  const soonest = Math.min(...days);
  if (soonest < 0) return { text: 'permit expired', warn: true };
  if (soonest <= 30) return { text: `permit ${soonest}d`, warn: true };
  return { text: 'permits ok', warn: false };
}

export function townOf(s: { city?: string; state?: string }): string {
  return [s.city, s.state].filter(Boolean).join(', ');
}
