// Where's my equipment (Round 4, shop study §2): every asset's location
// derived PASSIVELY from filed paperwork — latest checklist / drill log /
// daily-report hours → job → site. No GPS hardware. The manual "at the
// yard" gesture covers the haul-back gap; a field record newer than it
// wins (the machine went back out). Pins come from a one-time address
// geocode saved to the site (plus a device cache for roles that can't
// write sites) — offline afterward.
import { db } from '@/db';
import { projectTable } from '@/db/projections';
import type { Equipment, Site } from '@/db/schema';
import { matchesAsset } from '@/lib/equipmentHistory';
import { resolveJobContext } from '@/lib/jobContext';
import { can } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';

export interface AssetLocation {
  equipment: Equipment;
  kind: 'site' | 'yard' | 'unknown';
  /** "South Pit" / "The yard" */
  label: string;
  jobName?: string;
  siteId?: string;
  geo?: { lat: number; lng: number };
  /** What placed it there: 'drill log' | 'checklist' | 'equip hours' | 'set by shop' */
  source: string;
  /** ISO date of the placing record */
  when?: string;
  /** Whole days since the placing record (0 = today) */
  ageDays: number | null;
  down: boolean;
}

export function staleness(ageDays: number | null): 'fresh' | 'aging' | 'stale' {
  if (ageDays == null) return 'stale';
  if (ageDays < 2) return 'fresh';
  if (ageDays < 30) return 'aging';
  return 'stale';
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000));
}

export async function buildAssetLocations(): Promise<AssetLocation[]> {
  const fleet = await db.equipment
    .filter((e) => e.isActive && e.status !== 'retired')
    .toArray();
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j]));
  const sites = new Map((await db.sites.toArray()).map((s) => [s.id, s]));
  const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c]));
  const days = new Map((await db.blastDays.toArray()).map((d) => [d.id, d]));
  const reports = new Map((await db.dailyReports.toArray()).map((r) => [r.id, r.blastDayId]));

  // Blob-free projections: checklists and drill logs carry signature
  // images — the locator only needs ids, dates, and the job link
  const checklists = await projectTable<{
    equipmentId: string;
    jobId: string | null;
    date: string;
  }>('drillChecklists', { equipmentId: 'equipmentId', jobId: 'jobId', date: 'date' });
  const drillLogs = await projectTable<{
    drillRigEquipmentId: string | null;
    jobId: string;
    blastDayId: string | null;
    date: string | null;
    createdAt: string;
  }>('drillLogs', {
    drillRigEquipmentId: 'drillRigEquipmentId',
    jobId: 'jobId',
    blastDayId: 'blastDayId',
    date: 'date',
    createdAt: 'createdAt',
  });
  const entries = await projectTable<{
    equipmentId: string | null;
    assetNumber: string | null;
    dailyReportId: string;
  }>('equipmentEntries', {
    equipmentId: 'equipmentId',
    assetNumber: 'assetNumber',
    dailyReportId: 'dailyReportId',
  });
  const openOOS = new Set(
    (await db.repairTickets.filter((t) => t.status === 'open' && t.outOfService).toArray()).map(
      (t) => t.equipmentId,
    ),
  );

  const out: AssetLocation[] = [];
  for (const equip of fleet) {
    // Latest field record naming this asset, with the job it happened at.
    // (Explicit wide type: TS narrows closure-assigned vars to their
    // initializer otherwise.)
    type Best = { date: string; jobId?: string; source: string } | null;
    let best = null as Best;
    const consider = (date: string | undefined, jobId: string | undefined, source: string) => {
      if (!date) return;
      if (!best || date > best.date) best = { date, jobId, source };
    };
    for (const c of checklists)
      if (c.equipmentId === equip.id) consider(c.date, c.jobId ?? undefined, 'checklist');
    for (const l of drillLogs)
      if (l.drillRigEquipmentId === equip.id) {
        const day = l.blastDayId ? days.get(l.blastDayId) : undefined;
        consider(l.date ?? day?.date ?? l.createdAt.slice(0, 10), day?.jobId ?? l.jobId, 'drill log');
      }
    for (const e of entries)
      if (matchesAsset({ equipmentId: e.equipmentId ?? undefined, assetNumber: e.assetNumber ?? '' }, equip)) {
        const day = days.get(reports.get(e.dailyReportId) ?? '');
        if (day) consider(day.date, day.jobId, 'equip hours');
      }

    const down = equip.status === 'in_shop' || openOOS.has(equip.id);
    const yardAt = equip.atYardAt?.slice(0, 10);
    if (yardAt && (!best || yardAt >= best.date)) {
      out.push({
        equipment: equip,
        kind: 'yard',
        label: 'The yard',
        source: 'set by shop',
        when: yardAt,
        ageDays: daysSince(yardAt),
        down,
      });
      continue;
    }
    if (!best) {
      out.push({
        equipment: equip,
        kind: 'unknown',
        label: 'No records yet',
        source: '—',
        ageDays: null,
        down,
      });
      continue;
    }
    const placed = best as { date: string; jobId?: string; source: string };
    const job = placed.jobId ? jobs.get(placed.jobId) : undefined;
    const ctx = job
      ? resolveJobContext(job, job.siteId ? sites.get(job.siteId) : undefined, job.customerId ? customers.get(job.customerId) : undefined)
      : undefined;
    const site = job?.siteId ? sites.get(job.siteId) : undefined;
    out.push({
      equipment: equip,
      kind: 'site',
      label: ctx?.siteName || job?.name || 'Unknown site',
      jobName: job?.name,
      siteId: site?.id,
      geo: site?.geo,
      source: placed.source,
      when: placed.date,
      ageDays: daysSince(placed.date),
      down,
    });
  }
  // Down first, then stalest last-seen first among sites, yard at the end
  out.sort((a, b) => {
    const rank = (x: AssetLocation) => (x.down ? 0 : x.kind === 'site' ? 1 : x.kind === 'unknown' ? 2 : 3);
    return rank(a) - rank(b) || (b.ageDays ?? -1) - (a.ageDays ?? -1);
  });
  return out;
}

export async function markAtYard(equip: Equipment): Promise<void> {
  const me = getSessionUser();
  await db.equipment.update(equip.id, {
    atYardAt: nowISO(),
    atYardByName: me?.name ?? '',
    updatedAt: nowISO(),
  });
}

// ── One-time site geocode ──────────────────────────────────────────────────
// Saved onto the site when this device may write sites; cached locally
// either way so the map works offline after the first online view.

const GEO_CACHE_KEY = 'shotlog-site-geo';

function readCache(): Record<string, { lat: number; lng: number }> {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function cachedGeo(siteId: string): { lat: number; lng: number } | undefined {
  return readCache()[siteId];
}

export async function geocodeSite(site: Site): Promise<{ lat: number; lng: number } | null> {
  if (site.geo) return site.geo;
  const cached = cachedGeo(site.id);
  if (cached) return cached;
  if (!navigator.onLine) return null;
  const q = [site.address, site.city, site.state, site.zip].filter(Boolean).join(', ');
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    const results = (await res.json()) as { lat: string; lon: string }[];
    if (!results[0]) return null;
    const geo = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    const cache = readCache();
    cache[site.id] = geo;
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // cache is best-effort
    }
    if (can('sites', 'PATCH')) {
      await db.sites.update(site.id, { geo, updatedAt: nowISO() });
    }
    return geo;
  } catch {
    return null;
  }
}
