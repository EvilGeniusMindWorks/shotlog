// The Jobs section, three lenses on one list screen (nav decision: no new
// top-level items) — Jobs · Customers · Sites via segmented control, lens
// carried in the URL so breadcrumbs and the sidebar sub-items can link in.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { daysUntil, relativeDay, rollUp, useJobActivity, type JobActivity } from '@/lib/jobActivity';
import { todayISO } from '@/lib/utils';
import { useLiveQuery, db } from '@/db';
import { createCustomer, createSite, getJobViews } from '@/lib/jobContext';
import { NewJobForm } from '@/components/forms/NewJobForm';
import { authedFetch, getSessionUser } from '@/lib/session';
import { AddressFields, emptyAddress } from '@/components/forms/AddressFields';
import { PeekSheet } from '@/components/layout/PeekSheet';
import { can } from '@/lib/perms';
import {
  LifecycleFilter,
  applyLifecycle,
  type LifecycleFilterValue,
} from '@/components/records/LifecycleFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { Job } from '@/db/schema';
import { formatDate } from '@/lib/utils';

// ── S4 list rows (jobs study, Matthew's three calls) ────────────────────────
// Row = number · name (wraps to two lines) · customer · town, ST; right
// column = last worked (relative) + day count. Chips only when they say
// something: status when not active, operation when not the company's
// usual one, a blue "starts <date>" when a start/target date is ahead.
// Tap opens the record; long-press (or right-click) opens the peek sheet —
// the ⓘ button is gone.

type JobSort = 'lastWorked' | 'scheduled' | 'name' | 'customer' | 'number';
const JOB_SORT_OPTIONS = [
  { value: 'lastWorked', label: 'Sort: Last worked' },
  { value: 'scheduled', label: 'Sort: Scheduled' },
  { value: 'name', label: 'Sort: Name' },
  { value: 'customer', label: 'Sort: Customer' },
  { value: 'number', label: 'Sort: Job number' },
];

/** The job's upcoming start/target date, when it is still ahead of today */
function upcomingStart(job: Job): string | undefined {
  const today = todayISO();
  const d = [job.startDate, job.targetDate].filter((x): x is string => Boolean(x && x >= today)).sort()[0];
  return d;
}

/** Long-press (500ms) → onLong; a normal tap → onTap. Right-click = long. */
function useLongPress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      onLong();
    },
  };
}

function ListRow({
  title,
  number,
  sub,
  chips,
  activity,
  onTap,
  onLong,
  testId,
}: {
  title: string;
  number?: string;
  sub: string;
  chips?: ReactNode;
  activity: JobActivity;
  onTap: () => void;
  onLong: () => void;
  testId?: string;
}) {
  const press = useLongPress(onTap, onLong);
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full flex items-start gap-3 px-3 py-2.5 bg-white border-b border-gray-100 last:border-b-0 text-left hover:bg-gray-50 active:bg-gray-100 select-none cursor-pointer"
      onKeyDown={(e) => e.key === 'Enter' && onTap()}
      data-list-row={testId}
      {...press}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug line-clamp-2">
          {number && <span className="font-mono font-normal text-gray-500 mr-1.5">{number}</span>}
          {title}
        </p>
        <p className="text-sm text-gray-500 truncate">{sub}</p>
        {chips && <div className="flex flex-wrap gap-1 mt-1">{chips}</div>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-gray-800">{relativeDay(activity.lastWorked)}</p>
        <p className="text-xs text-gray-400">{activity.days === 0 ? 'no days' : `${activity.days} day${activity.days === 1 ? '' : 's'}`}</p>
      </div>
    </div>
  );
}

function StartsChip({ date }: { date: string }) {
  const d = daysUntil(date);
  return (
    <Badge variant="submitted" className="font-medium">
      starts {d === 0 ? 'today' : d === 1 ? 'tomorrow' : formatDate(date)}
    </Badge>
  );
}


type Lens = 'jobs' | 'customers' | 'sites';
const LENS_LABEL: Record<Lens, string> = { jobs: 'Jobs', customers: 'Customers', sites: 'Sites' };

export function JobsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('lens');
  const lens: Lens = raw === 'customers' || raw === 'sites' ? raw : 'jobs';
  const setLens = (l: Lens) => setParams(l === 'jobs' ? {} : { lens: l }, { replace: true });
  // Blasters set up jobs too (2026-08-17) — capability, not role
  const isAdmin = can('jobs', 'PUT');
  const [lifecycle, setLifecycle] = useState<LifecycleFilterValue>('active');
  const [search, setSearch] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [sort, setSort] = useState<JobSort>('lastWorked');
  const activity = useJobActivity();
  // Heal pre-hierarchy jobs: server links customer/site records (idempotent)
  useEffect(() => {
    if (getSessionUser()?.role === 'admin' && navigator.onLine) {
      void authedFetch('/admin/backfill-hierarchy', { method: 'POST' }).catch(() => undefined);
    }
  }, []);
  // undefined = still hydrating from the local DB — skeleton, never "No jobs yet"
  const jobsQuery = useLiveQuery(async () => getJobViews(await db.jobs.orderBy('updatedAt').reverse().toArray()));
  const q = search.trim().toLowerCase();
  // "Company default" operation = the one most jobs use; its chip is silent
  const defaultOperation = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobsQuery ?? []) counts.set(j.operation, (counts.get(j.operation) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'construction';
  }, [jobsQuery]);
  const act = (id: string): JobActivity => activity?.get(id) ?? { days: 0 };
  const jobs = applyLifecycle(jobsQuery ?? [], lifecycle)
    .filter(
      (j) =>
        !q ||
        [j.name, j.jobNumber, j.customer, j.city, j.state]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'customer':
          return (a.customer ?? '').localeCompare(b.customer ?? '') || a.name.localeCompare(b.name);
        case 'number':
          return (b.jobNumber ?? '').localeCompare(a.jobNumber ?? '', undefined, { numeric: true });
        case 'scheduled': {
          // Upcoming starts first (soonest on top), then everything else by last worked
          const ua = upcomingStart(a);
          const ub = upcomingStart(b);
          if (ua && ub) return ua.localeCompare(ub);
          if (ua) return -1;
          if (ub) return 1;
          return (act(b.id).lastWorked ?? '').localeCompare(act(a.id).lastWorked ?? '');
        }
        default:
          return (act(b.id).lastWorked ?? '').localeCompare(act(a.id).lastWorked ?? '') || b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  const [showNew, setShowNew] = useState(false);
  const [peek, setPeek] = useState<Job | undefined>();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900">Jobs</h2>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden" data-lens-tabs>
          {/* S7b: the hierarchy reads left to right — Customers · Sites · Jobs
              (the rail still lands on Jobs, the list the field opens all day) */}
          {(['customers', 'sites', 'jobs'] as const).map((l) => (
            <button
              key={l}
              className={
                lens === l
                  ? 'px-3 py-1.5 text-sm font-medium bg-navy text-white'
                  : 'px-3 py-1.5 text-sm font-medium bg-white text-gray-600'
              }
              onClick={() => setLens(l)}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>
        {isAdmin && lens === 'jobs' && (
          <Button onClick={() => setShowNew(!showNew)}>
            <Plus className="h-4 w-4 mr-1" /> New Job
          </Button>
        )}
      </div>

      {lens === 'jobs' && (
        <div className="flex items-center justify-end gap-2 mb-2 flex-wrap">
          <Input
            className="h-8 flex-1 min-w-[140px] max-w-[240px] text-sm"
            placeholder="Search jobs, customers, towns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <LifecycleFilter value={lifecycle} onChange={setLifecycle} />
          <Select
            className="h-8 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as JobSort)}
            options={JOB_SORT_OPTIONS}
            data-jobs-sort
          />
        </div>
      )}

      {lens === 'customers' && <CustomersLens />}
      {lens === 'sites' && <SitesLens />}

      {lens === 'jobs' && showNew && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <NewJobForm onCreated={() => setShowNew(false)} onCancel={() => setShowNew(false)} />
          </CardContent>
        </Card>
      )}

      {lens === 'jobs' && (
      <div className="space-y-2">
        <div className="rounded-xl border border-gray-200 overflow-hidden" data-jobs-list>
        {(showAllJobs || q ? jobs : jobs.slice(0, 15)).map((job) => {
          const status = job.archivedAt ? 'archived' : (job.jobStatus ?? (job.isActive ? 'active' : 'inactive'));
          const start = upcomingStart(job);
          const chips = [
            status !== 'active' && (
              <Badge key="status" variant={status === 'archived' || status === 'inactive' ? 'draft' : status === 'complete' ? 'approved' : 'warning'}>
                {status.replace('_', ' ')}
              </Badge>
            ),
            job.operation !== defaultOperation && <Badge key="op" variant="secondary">{job.operation}</Badge>,
            start && <StartsChip key="start" date={start} />,
          ].filter(Boolean);
          return (
            <ListRow
              key={job.id}
              testId={job.id}
              number={job.jobNumber}
              title={job.name}
              sub={[job.customer, job.city ? `${job.city}${job.state ? `, ${job.state}` : ''}` : ''].filter(Boolean).join(' · ')}
              chips={chips.length > 0 ? chips : undefined}
              activity={act(job.id)}
              onTap={() => navigate(`/jobs/${job.id}`)}
              onLong={() => setPeek(job)}
            />
          );
        })}
        </div>
        {!showAllJobs && !q && jobs.length > 15 && (
          <button
            className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
            onClick={() => setShowAllJobs(true)}
            data-jobs-more
          >
            Show all {jobs.length} jobs ▸
          </button>
        )}
        {jobsQuery === undefined && <ListSkeleton rows={3} />}
        {jobsQuery !== undefined && jobs.length === 0 && (
          <p className="text-center py-8 text-gray-400">
            {lifecycle === 'archived' ? 'No archived jobs.' : 'No jobs yet — tap New job. A job carries its customer, site and K factor so days never re-type them.'}
          </p>
        )}
      </div>
      )}

      {peek && (
        <PeekSheet
          title={`${peek.jobNumber ? `${peek.jobNumber} · ` : ''}${peek.name}`}
          subtitle={peek.customer}
          badge={
            <Badge variant={peek.isActive ? 'compliant' : 'draft'}>
              {peek.jobStatus ?? (peek.isActive ? 'active' : 'inactive')}
            </Badge>
          }
          facts={[
            { label: 'Customer', value: peek.customer ?? '' },
            { label: 'Location', value: [peek.city, peek.state].filter(Boolean).join(', ') },
            { label: 'Operation', value: peek.operation },
            { label: 'Customer PO', value: peek.customerPO ?? '' },
            { label: 'Site K', value: peek.kFactor ? String(peek.kFactor) : '' },
            { label: 'Last worked', value: act(peek.id).lastWorked ? formatDate(act(peek.id).lastWorked!) : 'never' },
            { label: 'Work days', value: String(act(peek.id).days) },
            ...(upcomingStart(peek) ? [{ label: 'Starts', value: formatDate(upcomingStart(peek)!) }] : []),
          ]}
          onOpen={() => navigate(`/jobs/${peek.id}`)}
          onClose={() => setPeek(undefined)}
        />
      )}
    </div>
  );
}

/** Customer → sites → jobs browse (the office lens; field flow stays flat) */
function CustomersLens() {
  const navigate = useNavigate();
  const isAdmin = can('customers', 'PUT');
  const [adding, setAdding] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleFilterValue>('active');
  const [search, setSearch] = useState('');
  const [cust, setCust] = useState({ name: '', phone: '', billing: emptyAddress(), notes: '' });
  const [showAll, setShowAll] = useState(false);
  const [peek, setPeek] = useState<{ id: string; name: string } | undefined>();
  const q = search.trim().toLowerCase();
  const activity = useJobActivity();
  const counts = useLiveQuery(async () => {
    const sites = await db.sites.toArray();
    const jobs = await db.jobs.toArray();
    const bySite = new Map<string, number>();
    const jobIds = new Map<string, string[]>();
    const town = new Map<string, string>();
    for (const s of sites) {
      bySite.set(s.customerId, (bySite.get(s.customerId) ?? 0) + 1);
      if (!town.has(s.customerId) && s.city) town.set(s.customerId, `${s.city}${s.state ? `, ${s.state}` : ''}`);
    }
    for (const j of jobs) if (j.customerId) jobIds.set(j.customerId, [...(jobIds.get(j.customerId) ?? []), j.id]);
    return { bySite, jobIds, town };
  });
  // Same row as Jobs (S4): last worked leads, so the list sorts by it
  const customers = applyLifecycle(
    useLiveQuery(async () => db.customers.toArray()) ?? [],
    lifecycle,
  )
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .map((c) => ({ c, activity: rollUp(activity, counts?.jobIds.get(c.id) ?? []) }))
    .sort((a, b) => (b.activity.lastWorked ?? '').localeCompare(a.activity.lastWorked ?? '') || a.c.name.localeCompare(b.c.name));
  return (
    <div className="space-y-2">
      <div className="flex justify-end items-center gap-2">
        <Input
          className="h-8 max-w-[160px] text-sm"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <LifecycleFilter value={lifecycle} onChange={setLifecycle} />
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4 mr-1" /> New Customer
          </Button>
        )}
      </div>
      {adding && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></div>
              <AddressFields labelPrefix="Billing" value={cust.billing} onChange={(billing) => setCust({ ...cust, billing })} />
              <div className="sm:col-span-2"><Label>Notes</Label><Input value={cust.notes} onChange={(e) => setCust({ ...cust, notes: e.target.value })} /></div>
            </div>
            <p className="text-xs text-gray-400">Contacts, terms, and compliance live on the customer's page once it's created.</p>
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
                Create Customer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="rounded-xl border border-gray-200 overflow-hidden" data-customers-list>
      {(showAll || q ? customers : customers.slice(0, 15)).map(({ c, activity: a }) => {
        const status = c.archivedAt ? 'archived' : (c.status ?? (c.isActive ? 'active' : 'inactive'));
        const nSites = counts?.bySite.get(c.id) ?? 0;
        const nJobs = counts?.jobIds.get(c.id)?.length ?? 0;
        return (
          <ListRow
            key={c.id}
            testId={c.id}
            title={c.name}
            sub={[counts?.town.get(c.id), `${nSites} site${nSites === 1 ? '' : 's'} · ${nJobs} job${nJobs === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            chips={status !== 'active' ? <Badge variant="draft">{status}</Badge> : undefined}
            activity={a}
            onTap={() => navigate(`/customers/${c.id}`)}
            onLong={() => setPeek({ id: c.id, name: c.name })}
          />
        );
      })}
      </div>
      {!showAll && !q && customers.length > 15 && (
        <button className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy" onClick={() => setShowAll(true)} data-customers-more>
          Show all {customers.length} customers ▸
        </button>
      )}
      {peek && (
        <PeekSheet
          title={peek.name}
          facts={[
            { label: 'Sites', value: String(counts?.bySite.get(peek.id) ?? 0) },
            { label: 'Jobs', value: String(counts?.jobIds.get(peek.id)?.length ?? 0) },
            { label: 'Last worked', value: relativeDay(rollUp(activity, counts?.jobIds.get(peek.id) ?? []).lastWorked) },
          ]}
          onOpen={() => navigate(`/customers/${peek.id}`)}
          onClose={() => setPeek(undefined)}
        />
      )}
      {customers.length === 0 && (
        <p className="text-center py-8 text-gray-400">
          No customers yet — they're created automatically with jobs.
        </p>
      )}
    </div>
  );
}

/** Every site across customers — the place-first lens */
function SitesLens() {
  const navigate = useNavigate();
  const isAdmin = can('sites', 'PUT');
  const [adding, setAdding] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleFilterValue>('active');
  const [search, setSearch] = useState('');
  const [showAllSites, setShowAllSites] = useState(false);
  const [form, setForm] = useState({ customerId: '', name: '', addr: emptyAddress(), kFactor: 180 });
  const [peek, setPeek] = useState<{ id: string; name: string } | undefined>();
  const q = search.trim().toLowerCase();
  const activity = useJobActivity();
  const customers =
    useLiveQuery(async () =>
      (await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [];
  const jobIdsBySite = useLiveQuery(async () => {
    const jobs = await db.jobs.toArray();
    const m = new Map<string, string[]>();
    for (const j of jobs) if (j.siteId) m.set(j.siteId, [...(m.get(j.siteId) ?? []), j.id]);
    return m;
  });
  // Same row as Jobs (S4): sorted by last worked
  const sites = applyLifecycle(useLiveQuery(async () => db.sites.toArray()) ?? [], lifecycle)
    .filter(
      (s) => !q || [s.name, s.city, s.address].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
    )
    .map((s) => ({ s, activity: rollUp(activity, jobIdsBySite?.get(s.id) ?? []) }))
    .sort((a, b) => (b.activity.lastWorked ?? '').localeCompare(a.activity.lastWorked ?? '') || a.s.name.localeCompare(b.s.name));
  const customerName = (cid: string) => customers.find((c) => c.id === cid)?.name ?? '—';
  return (
    <div className="space-y-2">
      <div className="flex justify-end items-center gap-2">
        <Input
          className="h-8 max-w-[160px] text-sm"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <LifecycleFilter value={lifecycle} onChange={setLifecycle} />
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4 mr-1" /> New Site
          </Button>
        )}
      </div>
      {adding && (
        <Card>
          <CardHeader><CardTitle className="text-base">New Site</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Customer *</Label>
                <Select
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  options={[
                    { value: '', label: 'Pick a customer…' },
                    ...customers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Site name</Label>
                <Input value={form.name} placeholder="defaults to address"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <AddressFields value={form.addr} onChange={(addr) => setForm({ ...form, addr })} />
              <div>
                <Label>Site K</Label>
                <Input type="number" inputMode="decimal" value={form.kFactor || ''}
                  onChange={(e) => setForm({ ...form, kFactor: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button
                disabled={!form.customerId || (!form.addr.street1.trim() && !form.name.trim())}
                onClick={() =>
                  void createSite(form.customerId, {
                    name: form.name,
                    address: form.addr.street1,
                    street2: form.addr.street2?.trim() || undefined,
                    city: form.addr.city,
                    state: form.addr.state,
                    zip: form.addr.zip?.trim() || undefined,
                    kFactor: form.kFactor,
                  }).then((sid) => navigate(`/sites/${sid}`))
                }
              >
                Create Site
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="rounded-xl border border-gray-200 overflow-hidden" data-sites-list>
      {(showAllSites || q ? sites : sites.slice(0, 15)).map(({ s, activity: a }) => (
        <ListRow
          key={s.id}
          testId={s.id}
          title={s.name}
          sub={[[s.city, s.state].filter(Boolean).join(', '), customerName(s.customerId), `K ${s.kFactor}`].filter(Boolean).join(' · ')}
          activity={a}
          onTap={() => navigate(`/sites/${s.id}`)}
          onLong={() => setPeek({ id: s.id, name: s.name })}
        />
      ))}
      </div>
      {!showAllSites && !q && sites.length > 15 && (
        <button
          className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
          onClick={() => setShowAllSites(true)}
          data-sites-more
        >
          Show all {sites.length} sites ▸
        </button>
      )}
      {peek && (
        <PeekSheet
          title={peek.name}
          facts={[
            { label: 'Jobs', value: String(jobIdsBySite?.get(peek.id)?.length ?? 0) },
            { label: 'Last worked', value: relativeDay(rollUp(activity, jobIdsBySite?.get(peek.id) ?? []).lastWorked) },
          ]}
          onOpen={() => navigate(`/sites/${peek.id}`)}
          onClose={() => setPeek(undefined)}
        />
      )}
      {sites.length === 0 && (
        <p className="text-center py-8 text-gray-400">
          No sites yet — they're created automatically with jobs.
        </p>
      )}
    </div>
  );
}
