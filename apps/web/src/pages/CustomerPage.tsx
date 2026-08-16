// One customer: identity + their sites + every job under them.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSite } from '@/lib/jobContext';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { formatDate, nowISO } from '@/lib/utils';
import type { Customer } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = getSessionUser()?.role === 'admin';
  const [addingSite, setAddingSite] = useState(false);
  const [site, setSite] = useState({ name: '', address: '', city: '', state: '', kFactor: 180 });
  const customer = useLiveQuery(() => (id ? db.customers.get(id) : undefined), [id]);
  const sites =
    useLiveQuery(
      async () => (id ? db.sites.where('customerId').equals(id).sortBy('name') : []),
      [id],
    ) ?? [];
  const jobs =
    useLiveQuery(
      async () =>
        id
          ? (await db.jobs.filter((j) => j.customerId === id).toArray()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            )
          : [],
      [id],
    ) ?? [];

  if (!customer) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{customer.name}</h2>
          <p className="text-sm text-gray-500">
            {sites.length} site{sites.length === 1 ? '' : 's'} · {jobs.length} job
            {jobs.length === 1 ? '' : 's'}
          </p>
        </div>
        <Badge variant={customer.isActive ? 'compliant' : 'draft'}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        <CustomerConfigCard customer={customer} />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Sites</CardTitle>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setAddingSite(!addingSite)}>
                New Site
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {addingSite && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Site name</Label>
                    <Input value={site.name} placeholder="defaults to address"
                      onChange={(e) => setSite({ ...site, name: e.target.value })} /></div>
                  <div><Label className="text-xs">Address</Label>
                    <Input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} /></div>
                  <div><Label className="text-xs">City</Label>
                    <Input value={site.city} onChange={(e) => setSite({ ...site, city: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <div className="w-16"><Label className="text-xs">State</Label>
                      <Input value={site.state} maxLength={2}
                        onChange={(e) => setSite({ ...site, state: e.target.value.toUpperCase().slice(0, 2) })} /></div>
                    <div className="flex-1"><Label className="text-xs">Site K</Label>
                      <Input type="number" inputMode="decimal" value={site.kFactor || ''}
                        onChange={(e) => setSite({ ...site, kFactor: parseFloat(e.target.value) || 0 })} /></div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAddingSite(false)}>Cancel</Button>
                  <Button size="sm" disabled={!site.address.trim() && !site.name.trim()}
                    onClick={() => void createSite(customer.id, site).then((sid) => navigate(`/sites/${sid}`))}>
                    Create Site
                  </Button>
                </div>
              </div>
            )}
            {sites.map((s) => (
              <button
                key={s.id}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 min-h-[44px]"
                onClick={() => navigate(`/sites/${s.id}`)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{s.name}</span>
                  <span className="block text-xs text-gray-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[s.city, s.state].filter(Boolean).join(', ') || '—'} · K {s.kFactor}
                  </span>
                </span>
                <Badge variant="secondary">
                  {jobs.filter((j) => j.siteId === s.id).length} jobs
                </Badge>
              </button>
            ))}
            {sites.length === 0 && (
              <p className="text-sm text-gray-400">No sites yet — add one here, or they're created automatically with jobs.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((j) => (
              <button
                key={j.id}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 min-h-[44px]"
                onClick={() => navigate(`/jobs/${j.id}`)}
              >
                <span className="text-sm font-medium truncate">{j.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDate(j.createdAt.slice(0, 10))}</span>
                  <Badge variant={j.isActive ? 'compliant' : 'draft'}>
                    {j.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </span>
              </button>
            ))}
            {jobs.length === 0 && <p className="text-sm text-gray-400">No jobs yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CustomerConfigCard({ customer }: { customer: Customer }) {
  const { draft, setField } = useDraftRecord(db.customers, customer);
  const readOnly = getSessionUser()?.role !== 'admin';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Customer
          {readOnly && (
            <span className="ml-2 text-xs font-normal text-gray-400">read-only</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          readOnly
            ? 'pointer-events-none select-none opacity-70 grid grid-cols-1 sm:grid-cols-2 gap-3'
            : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
        }
      >
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={draft.phone ?? ''} onChange={(e) => setField('phone', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Billing address</Label>
          <Input
            value={draft.billingAddress ?? ''}
            onChange={(e) => setField('billingAddress', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Input value={draft.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} />
        </div>
        {!readOnly && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) =>
                void db.customers.update(customer.id, {
                  isActive: e.target.checked,
                  updatedAt: nowISO(),
                })
              }
            />
            Active
          </label>
        )}
      </CardContent>
    </Card>
  );
}
