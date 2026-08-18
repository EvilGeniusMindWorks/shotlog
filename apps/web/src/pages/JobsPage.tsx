// The Jobs section, three lenses on one list screen (nav decision: no new
// top-level items) — Jobs · Customers · Sites via segmented control, lens
// carried in the URL so breadcrumbs and the sidebar sub-items can link in.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { createCustomer, createSite, getJobViews } from '@/lib/jobContext';
import { CustomerSitePicker, emptyPick, pickReady, type CustomerSitePick } from '@/components/forms/CustomerSitePicker';
import { createJob } from '@/hooks/useBlastDay';
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
import { Plus, MapPin, Info } from 'lucide-react';
import type { Job } from '@/db/schema';
import { formatDate } from '@/lib/utils';

const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

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
  // Heal pre-hierarchy jobs: server links customer/site records (idempotent)
  useEffect(() => {
    if (getSessionUser()?.role === 'admin' && navigator.onLine) {
      void authedFetch('/admin/backfill-hierarchy', { method: 'POST' }).catch(() => undefined);
    }
  }, []);
  // undefined = still hydrating from the local DB — skeleton, never "No jobs yet"
  const jobsQuery = useLiveQuery(async () => getJobViews(await db.jobs.orderBy('updatedAt').reverse().toArray()));
  const q = search.trim().toLowerCase();
  const jobs = applyLifecycle(jobsQuery ?? [], lifecycle).filter(
    (j) =>
      !q ||
      [j.name, j.jobNumber, j.customer, j.city, j.state]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
  );
  const [showNew, setShowNew] = useState(false);
  const [peek, setPeek] = useState<Job | undefined>();
  const [form, setForm] = useState({
    name: '', operation: 'construction' as const, typeOfRock: '', typeOfTerrain: '', customerPO: '',
  });
  const [pick, setPick] = useState<CustomerSitePick>(emptyPick());

  const handleCreate = async () => {
    await createJob({
      name: form.name,
      operation: form.operation,
      typeOfRock: form.typeOfRock,
      typeOfTerrain: form.typeOfTerrain,
      customerPO: form.customerPO,
      customerId: pick.customerId,
      siteId: pick.siteId,
      customer: pick.customerName,
      address: pick.address,
      city: pick.city,
      state: pick.state,
      kFactor: pick.kFactor,
    });
    setShowNew(false);
    setForm({ name: '', operation: 'construction', typeOfRock: '', typeOfTerrain: '', customerPO: '' });
    setPick(emptyPick());
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900">Jobs</h2>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {(['jobs', 'customers', 'sites'] as const).map((l) => (
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
        <div className="flex items-center justify-end gap-2 mb-2">
          <Input
            className="h-8 max-w-[180px] text-sm"
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <LifecycleFilter value={lifecycle} onChange={setLifecycle} />
        </div>
      )}

      {lens === 'customers' && <CustomersLens />}
      {lens === 'sites' && <SitesLens />}

      {lens === 'jobs' && showNew && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">New Job</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Job Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
              <CustomerSitePicker value={pick} onChange={setPick} />
              <div><Label>Operation</Label><Select value={form.operation} onChange={(e) => setForm({...form, operation: e.target.value as typeof form.operation})} options={OPERATION_OPTIONS} /></div>
              <div><Label>Customer PO</Label><Input value={form.customerPO} onChange={(e) => setForm({...form, customerPO: e.target.value})} /></div>
              <div><Label>Rock Type</Label><Input value={form.typeOfRock} onChange={(e) => setForm({...form, typeOfRock: e.target.value})} /></div>
              <div><Label>Terrain</Label><Input value={form.typeOfTerrain} onChange={(e) => setForm({...form, typeOfTerrain: e.target.value})} /></div>
            </div>
            <p className="text-xs text-gray-400">Job # is assigned automatically (this year's next number) — editable on the job page.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={!form.name || !pickReady(pick)} onClick={handleCreate}>Create Job</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lens === 'jobs' && (
      <div className="space-y-2">
        {(showAllJobs || q ? jobs : jobs.slice(0, 15)).map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
            onClick={() => navigate(`/jobs/${job.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {job.jobNumber ? `${job.jobNumber} · ` : ''}
                    {job.name}
                  </p>
                  <p className="text-sm text-gray-500 truncate">{job.customer}</p>
                  {job.city && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {job.city}, {job.state}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{job.operation}</Badge>
                  <Badge variant={job.archivedAt ? 'draft' : job.isActive ? 'compliant' : 'draft'}>
                    {job.archivedAt ? 'archived' : (job.jobStatus ?? (job.isActive ? 'active' : 'inactive'))}
                  </Badge>
                  <button
                    className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-navy hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPeek(job);
                    }}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!showAllJobs && !q && jobs.length > 15 && (
          <button
            className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
            onClick={() => setShowAllJobs(true)}
          >
            Show all {jobs.length} jobs ▸
          </button>
        )}
        {jobsQuery === undefined && <ListSkeleton rows={3} />}
        {jobsQuery !== undefined && jobs.length === 0 && (
          <p className="text-center py-8 text-gray-400">
            {lifecycle === 'archived' ? 'No archived jobs.' : 'No jobs yet. Create one to get started.'}
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
            { label: 'Last activity', value: formatDate(peek.updatedAt.slice(0, 10)) },
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
  const q = search.trim().toLowerCase();
  const customers = applyLifecycle(
    useLiveQuery(async () =>
      (await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [],
    lifecycle,
  ).filter((c) => !q || c.name.toLowerCase().includes(q));
  const counts = useLiveQuery(async () => {
    const sites = await db.sites.toArray();
    const jobs = await db.jobs.toArray();
    const bySite = new Map<string, number>();
    const byJob = new Map<string, number>();
    for (const s of sites) bySite.set(s.customerId, (bySite.get(s.customerId) ?? 0) + 1);
    for (const j of jobs) if (j.customerId) byJob.set(j.customerId, (byJob.get(j.customerId) ?? 0) + 1);
    return { bySite, byJob };
  });
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
      {customers.map((c) => (
        <Card
          key={c.id}
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => navigate(`/customers/${c.id}`)}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-gray-400">
                {counts?.bySite.get(c.id) ?? 0} site{(counts?.bySite.get(c.id) ?? 0) === 1 ? '' : 's'} ·{' '}
                {counts?.byJob.get(c.id) ?? 0} job{(counts?.byJob.get(c.id) ?? 0) === 1 ? '' : 's'}
              </p>
            </div>
            <Badge variant={c.archivedAt ? 'draft' : c.isActive ? 'compliant' : 'draft'}>
              {c.archivedAt ? 'archived' : (c.status ?? (c.isActive ? 'active' : 'inactive'))}
            </Badge>
          </CardContent>
        </Card>
      ))}
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
  const q = search.trim().toLowerCase();
  const sites = applyLifecycle(
    useLiveQuery(async () =>
      (await db.sites.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [],
    lifecycle,
  ).filter(
    (s) => !q || [s.name, s.city, s.address].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
  );
  const customers =
    useLiveQuery(async () =>
      (await db.customers.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [];
  const jobCounts = useLiveQuery(async () => {
    const jobs = await db.jobs.toArray();
    const m = new Map<string, number>();
    for (const j of jobs) if (j.siteId) m.set(j.siteId, (m.get(j.siteId) ?? 0) + 1);
    return m;
  });
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
      {(showAllSites || q ? sites : sites.slice(0, 15)).map((s) => (
        <Card
          key={s.id}
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => navigate(`/sites/${s.id}`)}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold truncate">{s.name}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[s.city, s.state].filter(Boolean).join(', ') || '—'} · K {s.kFactor} ·{' '}
                {customerName(s.customerId)}
              </p>
            </div>
            <Badge variant="secondary">{jobCounts?.get(s.id) ?? 0} jobs</Badge>
          </CardContent>
        </Card>
      ))}
      {!showAllSites && !q && sites.length > 15 && (
        <button
          className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
          onClick={() => setShowAllSites(true)}
        >
          Show all {sites.length} sites ▸
        </button>
      )}
      {sites.length === 0 && (
        <p className="text-center py-8 text-gray-400">
          No sites yet — they're created automatically with jobs.
        </p>
      )}
    </div>
  );
}
