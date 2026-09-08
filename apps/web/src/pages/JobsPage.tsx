// The Jobs section (S8b — Matthew's Option 1, the drill-down): the nav item
// stays "Jobs" and lands on CUSTOMERS. Tap a customer → its page (About
// cards first, then its sites); tap a site → its page (About first, then
// its jobs); tap a job → the job page. The Customers · Sites · Jobs switch,
// the sidebar sub-items and the flat jobs list are gone: recent-job chips
// plus ONE search that finds customers, sites and jobs replace them.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { relativeDay, rollUp, useJobActivity } from '@/lib/jobActivity';
import { useLiveQuery, db } from '@/db';
import { createCustomer } from '@/lib/jobContext';
import { authedFetch, getSessionUser } from '@/lib/session';
import { AddressFields, emptyAddress } from '@/components/forms/AddressFields';
import { PeekSheet } from '@/components/layout/PeekSheet';
import { can } from '@/lib/perms';
import {
  LifecycleFilter,
  applyLifecycle,
  type LifecycleFilterValue,
} from '@/components/records/LifecycleFilter';
import { ListRow, dayCount } from '@/components/jobs/ListRow';
import { WINDOW } from '@/components/jobs/WindowedList';
import { townOf } from '@/lib/siteFacts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import type { Customer, Job, Site } from '@/db/schema';

const RECENT_DAYS = 14;
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Hit {
  kind: 'job' | 'site' | 'customer';
  id: string;
  title: string;
  number?: string;
  sub: string;
  to: string;
  right?: string;
  rightSub?: string;
}

export function JobsPage() {
  const navigate = useNavigate();
  // Blasters set up customers/sites/jobs too (2026-08-17) — capability, not role
  const isAdmin = can('customers', 'PUT');
  const [lifecycle, setLifecycle] = useState<LifecycleFilterValue>('active');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [cust, setCust] = useState({ name: '', phone: '', billing: emptyAddress(), notes: '' });
  const [peek, setPeek] = useState<Customer | undefined>();
  const activity = useJobActivity();
  // Heal pre-hierarchy jobs: server links customer/site records (idempotent)
  useEffect(() => {
    if (getSessionUser()?.role === 'admin' && navigator.onLine) {
      void authedFetch('/admin/backfill-hierarchy', { method: 'POST' }).catch(() => undefined);
    }
  }, []);
  // undefined = still hydrating from the local DB — skeleton, never "No customers yet"
  const customersQuery = useLiveQuery(async () => db.customers.toArray());
  const sites = useLiveQuery(async () => db.sites.toArray()) ?? [];
  const jobs = useLiveQuery(async () => db.jobs.filter((j) => !j.archivedAt).toArray()) ?? [];

  const index = useMemo(() => {
    const sitesOf = new Map<string, Site[]>();
    const jobIdsOf = new Map<string, string[]>();
    const jobIdsAtSite = new Map<string, string[]>();
    const siteById = new Map(sites.map((s) => [s.id, s]));
    const customerById = new Map((customersQuery ?? []).map((c) => [c.id, c]));
    for (const s of sites) sitesOf.set(s.customerId, [...(sitesOf.get(s.customerId) ?? []), s]);
    for (const j of jobs) {
      if (j.customerId) jobIdsOf.set(j.customerId, [...(jobIdsOf.get(j.customerId) ?? []), j.id]);
      if (j.siteId) jobIdsAtSite.set(j.siteId, [...(jobIdsAtSite.get(j.siteId) ?? []), j.id]);
    }
    return { sitesOf, jobIdsOf, jobIdsAtSite, siteById, customerById };
  }, [sites, jobs, customersQuery]);

  // Recent: the jobs anyone here worked in the last two weeks — one tap
  const recent = useMemo(() => {
    if (!activity) return [];
    const floor = daysAgo(RECENT_DAYS);
    return jobs
      .map((j) => ({ job: j, last: activity.get(j.id)?.lastWorked ?? '' }))
      .filter((x) => x.last >= floor)
      .sort((a, b) => b.last.localeCompare(a.last) || b.job.updatedAt.localeCompare(a.job.updatedAt))
      .slice(0, 4)
      .map((x) => x.job);
  }, [jobs, activity]);

  const q = search.trim().toLowerCase();
  const jobPath = (j: Job) => {
    const s = j.siteId ? index.siteById.get(j.siteId) : undefined;
    const c = j.customerId ? index.customerById.get(j.customerId) : undefined;
    const customer = c?.name ?? j.customer;
    return [customer, s?.name ?? (j.city ? townOf(j) : '')].filter(Boolean).join(' › ');
  };
  // One search, three kinds — each hit shows its path so a known job is one
  // tap away without drilling
  const hits: Hit[] = useMemo(() => {
    if (!q) return [];
    const has = (...vals: (string | undefined)[]) => vals.some((v) => v && v.toLowerCase().includes(q));
    const act = (ids: string[]) => rollUp(activity, ids);
    const jobHits: Hit[] = jobs
      .filter((j) => has(j.name, j.jobNumber, j.customer, j.city))
      .slice(0, 8)
      .map((j) => {
        const a = activity?.get(j.id) ?? { days: 0 };
        return { kind: 'job', id: j.id, title: j.name, number: j.jobNumber, sub: `job · ${jobPath(j)}`, to: `/jobs/${j.id}`, right: relativeDay(a.lastWorked), rightSub: dayCount(a.days) };
      });
    const siteHits: Hit[] = sites
      .filter((s) => !s.archivedAt && has(s.name, s.city, s.address))
      .slice(0, 8)
      .map((s) => {
        const a = act(index.jobIdsAtSite.get(s.id) ?? []);
        return { kind: 'site', id: s.id, title: s.name, sub: `site · ${index.customerById.get(s.customerId)?.name ?? '—'} · K ${s.kFactor}`, to: `/sites/${s.id}`, right: relativeDay(a.lastWorked), rightSub: `${index.jobIdsAtSite.get(s.id)?.length ?? 0} jobs` };
      });
    const customerHits: Hit[] = (customersQuery ?? [])
      .filter((c) => !c.archivedAt && has(c.name))
      .slice(0, 8)
      .map((c) => {
        const a = act(index.jobIdsOf.get(c.id) ?? []);
        const n = index.sitesOf.get(c.id)?.length ?? 0;
        return { kind: 'customer', id: c.id, title: c.name, sub: `customer · ${n} site${n === 1 ? '' : 's'} · ${index.jobIdsOf.get(c.id)?.length ?? 0} jobs`, to: `/customers/${c.id}`, right: relativeDay(a.lastWorked), rightSub: dayCount(a.days) };
      });
    return [...jobHits, ...siteHits, ...customerHits];
  }, [q, jobs, sites, customersQuery, activity, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // The customers list: last worked leads, same row as everywhere in the section
  const customers = applyLifecycle(customersQuery ?? [], lifecycle)
    .map((c) => ({ c, activity: rollUp(activity, index.jobIdsOf.get(c.id) ?? []) }))
    .sort((a, b) => (b.activity.lastWorked ?? '').localeCompare(a.activity.lastWorked ?? '') || a.c.name.localeCompare(b.c.name));
  const openJobs = (id: string) =>
    (index.jobIdsOf.get(id) ?? []).filter((jid) => {
      const j = jobs.find((x) => x.id === jid);
      return j && (j.jobStatus ? j.jobStatus === 'active' : j.isActive);
    }).length;

  return (
    <div className="p-4 max-w-3xl mx-auto" data-jobs-page>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Jobs</h2>
          <p className="text-xs text-gray-400">Customers › sites › jobs. Tap a customer to see its sites.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAdding(!adding)} data-new-customer>
            <Plus className="h-4 w-4 mr-1" /> New customer
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Input
          className="h-9 flex-1 min-w-[180px] text-sm"
          placeholder="Search customers, sites, jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-jobs-search
        />
        {!q && <LifecycleFilter value={lifecycle} onChange={setLifecycle} />}
      </div>

      {adding && (
        <Card className="mb-4" data-new-customer-form>
          <CardHeader><CardTitle className="text-base">New customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></div>
              <AddressFields labelPrefix="Billing" value={cust.billing} onChange={(billing) => setCust({ ...cust, billing })} />
              <div className="sm:col-span-2"><Label>Notes</Label><Input value={cust.notes} onChange={(e) => setCust({ ...cust, notes: e.target.value })} /></div>
            </div>
            <p className="text-xs text-gray-400">Contacts, terms and compliance live on the customer's page once it's created — sites and jobs are added there.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button disabled={!cust.name.trim()}
                onClick={() =>
                  void createCustomer({
                    name: cust.name,
                    phone: cust.phone,
                    notes: cust.notes,
                    ...(cust.billing.street1 || cust.billing.city ? { billing: cust.billing } : {}),
                  }).then((id) => navigate(`/customers/${id}`))
                }>
                Create customer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {q ? (
        <div className="space-y-3" data-jobs-results>
          {(['job', 'site', 'customer'] as const).map((kind) => {
            const group = hits.filter((h) => h.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {kind === 'job' ? 'Jobs' : kind === 'site' ? 'Sites' : 'Customers'} · {group.length}
                </p>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {group.map((h) => (
                    <ListRow key={h.id} testId={h.id} title={h.title} number={h.number} sub={h.sub} right={h.right} rightSub={h.rightSub} onTap={() => navigate(h.to)} />
                  ))}
                </div>
              </div>
            );
          })}
          {hits.length === 0 && <p className="text-center py-8 text-gray-400">Nothing matches “{search.trim()}”.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {recent.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Recent jobs</p>
              <div className="flex flex-wrap gap-2" data-recent-jobs>
                {recent.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    className="inline-flex items-center min-h-[36px] px-3 rounded-full border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50"
                    data-recent-job={j.jobNumber ?? j.id}
                    onClick={() => navigate(`/jobs/${j.id}`)}
                  >
                    {j.jobNumber && <span className="font-mono text-gray-500 mr-1.5">{j.jobNumber}</span>}
                    {j.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Customers · {customers.length}
          </p>
          <div className="rounded-xl border border-gray-200 overflow-hidden" data-customers-list>
            {(showAll ? customers : customers.slice(0, WINDOW)).map(({ c, activity: a }) => {
              const status = c.archivedAt ? 'archived' : (c.status ?? (c.isActive ? 'active' : 'inactive'));
              const nSites = index.sitesOf.get(c.id)?.length ?? 0;
              const nJobs = index.jobIdsOf.get(c.id)?.length ?? 0;
              const open = openJobs(c.id);
              const town = index.sitesOf.get(c.id)?.map(townOf).find(Boolean) ?? townOf(c.billing ?? {});
              return (
                <ListRow
                  key={c.id}
                  testId={c.id}
                  title={c.name}
                  sub={[town, `${nSites} site${nSites === 1 ? '' : 's'} · ${nJobs} job${nJobs === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  chips={status !== 'active' ? <Badge variant="draft">{status}</Badge> : undefined}
                  right={relativeDay(a.lastWorked)}
                  rightSub={open > 0 ? `${open} open` : dayCount(a.days)}
                  onTap={() => navigate(`/customers/${c.id}`)}
                  onLong={() => setPeek(c)}
                />
              );
            })}
          </div>
          {!showAll && customers.length > WINDOW && (
            <button className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy" onClick={() => setShowAll(true)} data-customers-more>
              Show all {customers.length} customers ▸
            </button>
          )}
          {customersQuery === undefined && <ListSkeleton rows={3} />}
          {customersQuery !== undefined && customers.length === 0 && (
            <p className="text-center py-8 text-gray-400">
              {lifecycle === 'archived' ? 'No archived customers.' : 'No customers yet — tap New customer. Sites and jobs are added on the customer\'s page.'}
            </p>
          )}
        </div>
      )}

      {peek && (
        <PeekSheet
          title={peek.name}
          facts={[
            { label: 'Sites', value: String(index.sitesOf.get(peek.id)?.length ?? 0) },
            { label: 'Jobs', value: String(index.jobIdsOf.get(peek.id)?.length ?? 0) },
            { label: 'Last worked', value: relativeDay(rollUp(activity, index.jobIdsOf.get(peek.id) ?? []).lastWorked) },
          ]}
          onOpen={() => navigate(`/customers/${peek.id}`)}
          onClose={() => setPeek(undefined)}
        />
      )}
    </div>
  );
}
