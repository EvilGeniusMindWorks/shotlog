// Jobs (S26, Matthew, Oct 5 2026, shape A): the work, as a flat list — number,
// name, customer › site, status, last worked — with one search and one
// "Set up…" door that asks what you are setting up before anything else.
// Customers (who pays) is its own page now; this one never lands on them.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { relativeDay, useJobActivity } from '@/lib/jobActivity';
import { can } from '@/lib/perms';
import { townOf } from '@/lib/siteFacts';
import { LifecycleFilter, applyLifecycle, type LifecycleFilterValue } from '@/components/records/LifecycleFilter';
import { NewJobForm } from '@/components/forms/NewJobForm';
import { NewSiteForm } from '@/components/forms/NewSiteForm';
import { SetupChooser, type SetupDoor } from '@/components/forms/SetupChooser';
import { createCustomer } from '@/lib/jobContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import type { Job } from '@/db/schema';

type Door = SetupDoor | 'pick-site' | null;

export function JobsPage() {
  const navigate = useNavigate();
  const isAdmin = can('customers', 'PUT');
  const [lifecycle, setLifecycle] = useState<LifecycleFilterValue>('active');
  const [search, setSearch] = useState('');
  const [chooser, setChooser] = useState(false);
  const [door, setDoor] = useState<Door>(null);
  const [pickedSite, setPickedSite] = useState<string | undefined>();
  const [cust, setCust] = useState({ name: '', contact: '', phone: '' });
  const activity = useJobActivity();
  const jobsQuery = useLiveQuery(async () => db.jobs.toArray());
  const sites = useLiveQuery(async () => db.sites.toArray()) ?? [];
  const customers = useLiveQuery(async () => db.customers.toArray()) ?? [];
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = applyLifecycle(jobsQuery ?? [], lifecycle).filter((j) => (lifecycle === 'active' ? (j.jobStatus ? j.jobStatus !== 'complete' : j.isActive) : true));
    const has = (...vals: (string | undefined)[]) => vals.some((v) => v && v.toLowerCase().includes(q));
    return list
      .filter((j) => !q || has(j.name, j.jobNumber, customerById.get(j.customerId ?? '')?.name ?? j.customer, siteById.get(j.siteId ?? '')?.name, j.city))
      .map((j) => ({ j, last: activity?.get(j.id)?.lastWorked ?? '' }))
      .sort((a, b) => b.last.localeCompare(a.last) || b.j.updatedAt.localeCompare(a.j.updatedAt));
  }, [jobsQuery, lifecycle, q, activity, customerById, siteById]);

  const path = (j: Job) => {
    const c = j.customerId ? customerById.get(j.customerId) : undefined;
    const s = j.siteId ? siteById.get(j.siteId) : undefined;
    return [c?.name ?? j.customer, s?.name ?? (j.city ? townOf(j) : '')].filter(Boolean).join(' › ');
  };
  const pick = (d: SetupDoor) => {
    setChooser(false);
    setDoor(d === 'job' ? 'pick-site' : d);
  };
  const createCustomerNow = async () => {
    const id = await createCustomer({
      name: cust.name.trim(),
      phone: cust.phone.trim(),
      customerContacts: cust.contact.trim() ? [{ id: crypto.randomUUID(), name: cust.contact.trim(), phone: cust.phone.trim(), role: 'Main contact', isPrimary: true }] : [],
    });
    setDoor(null);
    navigate(`/customers/${id}`);
  };

  return (
    <div className="p-4 max-w-3xl mx-auto" data-jobs-list-page>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Jobs</h2>
          <p className="text-xs text-gray-400">The work: one line per job, last worked first. Customers and sites have their own page.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setChooser(true)} data-jobs-setup>
            <Plus className="h-4 w-4 mr-1" /> Set up…
          </Button>
        )}
      </div>

      {chooser && <SetupChooser onPick={pick} onClose={() => setChooser(false)} />}

      {door === 'customer' && (
        <Card className="mb-4" data-new-customer-form>
          <CardHeader><CardTitle className="text-base">New customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3"><Label className="text-xs">Name *</Label><Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="A company, a town, or a person" data-new-customer-name /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Main contact</Label><Input value={cust.contact} onChange={(e) => setCust({ ...cust, contact: e.target.value })} data-new-customer-contact /></div>
              <div><Label className="text-xs">Phone</Label><Input value={cust.phone} inputMode="tel" onChange={(e) => setCust({ ...cust, phone: e.target.value })} data-new-customer-phone /></div>
            </div>
            <p className="text-xs text-gray-400">Billing, terms and insurance can wait; they live on the customer's page. Sites and jobs are added there too.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDoor(null)}>Cancel</Button>
              <Button size="sm" disabled={!cust.name.trim()} onClick={() => void createCustomerNow()} data-new-customer-create>Create the customer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {door === 'site' && (
        <div className="mb-4"><NewSiteForm onCreated={(sid) => { setDoor(null); navigate(`/sites/${sid}`); }} onCancel={() => setDoor(null)} /></div>
      )}

      {door === 'pick-site' && (
        <Card className="mb-4" data-pick-site>
          <CardHeader><CardTitle className="text-base">New job · which site?</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden max-h-72 overflow-y-auto">
              {sites.filter((s) => !s.archivedAt).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                <button key={s.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-gray-50 min-h-[44px]" onClick={() => { setPickedSite(s.id); setDoor('job'); }} data-pick-site-row={s.id}>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-gray-400">{customerById.get(s.customerId)?.name ?? '—'} · {[s.address, townOf(s)].filter(Boolean).join(', ')} · K {s.kFactor}</p>
                </button>
              ))}
              {sites.filter((s) => !s.archivedAt).length === 0 && <p className="px-3 py-3 text-sm text-gray-400">No sites yet. Set up a customer and a site first, or use the all-three door.</p>}
            </div>
            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setDoor(null)}>Cancel</Button></div>
          </CardContent>
        </Card>
      )}

      {(door === 'job' || door === 'all') && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <NewJobForm
              title={door === 'all' ? 'New customer, site and job' : `New job at ${siteById.get(pickedSite ?? '')?.name ?? 'the site'}`}
              initial={door === 'job' && pickedSite ? { siteId: pickedSite, customerId: siteById.get(pickedSite)?.customerId } : undefined}
              onCancel={() => setDoor(null)}
              onCreated={(id) => { setDoor(null); navigate(`/jobs/${id}?open=contact-sheet`); }}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Input className="h-9 flex-1 min-w-[180px] text-sm" placeholder="Search jobs by number, name, customer or site…" value={search} onChange={(e) => setSearch(e.target.value)} data-jobs-search />
        {!q && <LifecycleFilter value={lifecycle} onChange={setLifecycle} />}
      </div>

      {jobsQuery === undefined ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 px-1" data-jobs-empty>{q ? 'Nothing matches.' : lifecycle === 'archived' ? 'No archived jobs.' : 'No jobs yet. Set up… starts one.'}</p>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white" data-jobs-list>
          {rows.map(({ j, last }) => (
            <button key={j.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-3 min-h-[52px]" onClick={() => navigate(`/jobs/${j.id}`)} data-jobs-row={j.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{j.jobNumber ? `${j.jobNumber} · ` : ''}{j.name}</span>
                <span className="block text-xs text-gray-500 truncate">{path(j) || '—'}</span>
              </span>
              <Badge variant={(j.jobStatus ?? (j.isActive ? 'active' : 'complete')) === 'active' ? 'compliant' : 'draft'}>{j.jobStatus ?? (j.isActive ? 'active' : 'complete')}</Badge>
              <span className="text-xs text-gray-400 w-20 text-right shrink-0">{last ? relativeDay(last) : 'no days'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
