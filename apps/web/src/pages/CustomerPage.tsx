// One customer, on the adaptive record shell: company & billing, contacts,
// sites, jobs, compliance & terms. Tabs on wide screens, one collapsible
// scroll on phones — same sections either way.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSite } from '@/lib/jobContext';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { can } from '@/lib/perms';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { LifecycleMenu } from '@/components/records/LifecycleMenu';
import { formatDate, generateId, nowISO } from '@/lib/utils';
import type { Customer, CustomerContact, CustomerStatus } from '@/db/schema';
import { AddressFields, emptyAddress } from '@/components/forms/AddressFields';
import { RecordShell } from '@/components/layout/RecordShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'gc', label: 'General contractor' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'developer', label: 'Developer' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'other', label: 'Other' },
];
const STATUS_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export function daysUntil(iso?: string): number | undefined {
  if (!iso) return undefined;
  const target = new Date(`${iso}T00:00:00`);
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
}

/** Expiry countdown — green when comfortable, amber <30 days, red when past */
export function ExpiryPill({ date, label }: { date?: string; label?: string }) {
  const days = daysUntil(date);
  if (days === undefined) return null;
  const cls =
    days < 0
      ? 'bg-red-100 text-red-700'
      : days <= 30
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';
  const text = days < 0 ? `expired ${-days}d ago` : days === 0 ? 'expires today' : `${days}d left`;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label ? `${label} ` : ''}
      {text}
    </span>
  );
}

export function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Blasters set up customers/sites/jobs too (2026-08-17) — gate on the
  // capability, not the admin role
  const isAdmin = can('customers', 'PATCH');
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

  const status: CustomerStatus = customer.status ?? (customer.isActive ? 'active' : 'inactive');
  const openJobs = jobs.filter((j) => (j.jobStatus ? j.jobStatus === 'active' : j.isActive)).length;
  const coiDays = daysUntil(customer.coiExpires);
  const contacts = customer.customerContacts ?? [];
  const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];

  return (
    <RecordShell
      breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        { label: 'Customers', to: '/jobs?lens=customers' },
      ]}
      title={customer.name}
      badge={
        customer.archivedAt ? (
          <Badge variant="draft">Archived</Badge>
        ) : (
          <Badge variant={status === 'active' ? 'compliant' : status === 'prospect' ? 'secondary' : 'draft'}>
            {status}
          </Badge>
        )
      }
      actions={
        <LifecycleMenu
          table="customers"
          record={customer}
          label={customer.name}
          kind="customer"
          onDeleted={() => navigate('/jobs?lens=customers')}
        />
      }
      subline={[
        TYPE_OPTIONS.find((t) => t.value === customer.customerType)?.label,
        customer.phone,
      ]
        .filter(Boolean)
        .join(' · ')}
      stats={[
        { label: 'Sites', value: String(sites.length) },
        { label: 'Jobs', value: String(jobs.length) },
        { label: 'Open jobs', value: String(openJobs) },
        { label: 'COI', value: coiDays === undefined ? '—' : coiDays < 0 ? 'EXP' : `${coiDays}d` },
      ]}
      sections={[
        {
          id: 'company',
          label: 'Company & billing',
          summary: [customer.billing?.city, customer.billing?.state].filter(Boolean).join(', ') || customer.billingAddress || customer.phone || '—',
          render: () => <CompanyCard customer={customer} readOnly={!isAdmin} />,
        },
        {
          id: 'contacts',
          label: 'Contacts',
          count: contacts.length,
          summary: primary ? `${primary.name}${primary.phone ? ` · ${primary.phone}` : ''}` : 'none yet',
          render: () => <ContactsCard customer={customer} readOnly={!isAdmin} />,
        },
        {
          id: 'sites',
          label: 'Sites',
          count: sites.length,
          summary: sites.map((s) => s.name).slice(0, 2).join(', ') || 'none yet',
          render: () => (
            <SitesCard customerId={customer.id} sites={sites} jobs={jobs} isAdmin={isAdmin} />
          ),
        },
        {
          id: 'jobs',
          label: 'Jobs',
          count: jobs.length,
          summary: `${openJobs} open`,
          render: () => (
            <div className="space-y-2">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 min-h-[44px]"
                  onClick={() => navigate(`/jobs/${j.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {j.jobNumber ? `${j.jobNumber} · ` : ''}
                      {j.name}
                    </span>
                    <span className="block text-xs text-gray-400">{formatDate(j.createdAt.slice(0, 10))}</span>
                  </span>
                  <Badge variant={(j.jobStatus ?? (j.isActive ? 'active' : 'complete')) === 'active' ? 'compliant' : 'draft'}>
                    {j.jobStatus ?? (j.isActive ? 'active' : 'inactive')}
                  </Badge>
                </button>
              ))}
              {jobs.length === 0 && <p className="text-sm text-gray-400">No jobs yet.</p>}
            </div>
          ),
        },
        {
          id: 'compliance',
          label: 'Compliance & terms',
          summary: [
            customer.paymentTerms,
            customer.poRequired ? 'PO required' : undefined,
            coiDays !== undefined ? `COI ${coiDays < 0 ? 'expired' : `${coiDays}d`}` : undefined,
          ]
            .filter(Boolean)
            .join(' · ') || '—',
          defaultOpen: false,
          render: () => <ComplianceCard customer={customer} readOnly={!isAdmin} />,
        },
      ]}
    />
  );
}

const gridCls = (readOnly: boolean) =>
  readOnly
    ? 'pointer-events-none select-none opacity-70 grid grid-cols-1 sm:grid-cols-2 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-3';

function CompanyCard({ customer, readOnly }: { customer: Customer; readOnly: boolean }) {
  const { draft, setField } = useDraftRecord(db.customers, customer);
  return (
    <div className={gridCls(readOnly)}>
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={draft.customerType ?? ''}
            onChange={(e) => setField('customerType', (e.target.value || undefined) as Customer['customerType'])}
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={draft.status ?? (draft.isActive ? 'active' : 'inactive')}
            onChange={(e) => {
              const status = e.target.value as CustomerStatus;
              setField('status', status);
              setField('isActive', status !== 'inactive');
            }}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Phone</Label>
        <Input value={draft.phone ?? ''} onChange={(e) => setField('phone', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Website</Label>
        <Input value={draft.website ?? ''} onChange={(e) => setField('website', e.target.value)} />
      </div>
      <AddressFields
        labelPrefix="Billing"
        value={draft.billing ?? { ...emptyAddress(), street1: draft.billingAddress ?? '' }}
        onChange={(next) => setField('billing', next)}
      />
      <div className="sm:col-span-2">
        <Label className="text-xs">Notes</Label>
        <Input value={draft.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} />
      </div>
    </div>
  );
}

function ContactsCard({ customer, readOnly }: { customer: Customer; readOnly: boolean }) {
  const contacts = customer.customerContacts ?? [];
  const write = (next: CustomerContact[]) =>
    void db.customers.update(customer.id, { customerContacts: next, updatedAt: nowISO() });
  const patch = (cid: string, p: Partial<CustomerContact>) =>
    write(contacts.map((c) => (c.id === cid ? { ...c, ...p } : c)));
  return (
    <div className="space-y-3">
      {contacts.map((c) => (
        <div key={c.id} className={readOnly ? 'pointer-events-none opacity-70 rounded-lg border border-gray-200 p-3' : 'rounded-lg border border-gray-200 p-3'}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Input value={c.role} placeholder="PM, billing…" onChange={(e) => patch(c.id, { role: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={c.phone ?? ''} onChange={(e) => patch(c.id, { phone: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={c.email ?? ''} onChange={(e) => patch(c.id, { email: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={!!c.isPrimary}
                onChange={(e) =>
                  write(contacts.map((x) => ({ ...x, isPrimary: x.id === c.id ? e.target.checked : false })))
                }
              />
              Primary contact
            </label>
            <Button size="sm" variant="ghost" onClick={() => write(contacts.filter((x) => x.id !== c.id))}>
              <Trash2 className="h-4 w-4 text-gray-400" />
            </Button>
          </div>
        </div>
      ))}
      {contacts.length === 0 && <p className="text-sm text-gray-400">No contacts yet.</p>}
      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            write([...contacts, { id: generateId(), name: '', role: '', isPrimary: contacts.length === 0 }])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add contact
        </Button>
      )}
    </div>
  );
}

function SitesCard({
  customerId,
  sites,
  jobs,
  isAdmin,
}: {
  customerId: string;
  sites: { id: string; name: string; city: string; state: string; kFactor: number }[];
  jobs: { siteId?: string }[];
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [site, setSite] = useState({ name: '', addr: emptyAddress(), kFactor: 180 });
  return (
    <div className="space-y-2">
      {adding && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Site name</Label>
              <Input
                value={site.name}
                placeholder="defaults to address"
                onChange={(e) => setSite({ ...site, name: e.target.value })}
              />
            </div>
            <AddressFields value={site.addr} onChange={(addr) => setSite({ ...site, addr })} />
            <div>
              <Label className="text-xs">Site K</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={site.kFactor || ''}
                onChange={(e) => setSite({ ...site, kFactor: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!site.addr.street1.trim() && !site.name.trim()}
              onClick={() =>
                void createSite(customerId, {
                  name: site.name,
                  address: site.addr.street1,
                  street2: site.addr.street2?.trim() || undefined,
                  city: site.addr.city,
                  state: site.addr.state,
                  zip: site.addr.zip?.trim() || undefined,
                  kFactor: site.kFactor,
                }).then((sid) => navigate(`/sites/${sid}`))
              }
            >
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
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[s.city, s.state].filter(Boolean).join(', ') || '—'} · K {s.kFactor}
            </span>
          </span>
          <Badge variant="secondary">{jobs.filter((j) => j.siteId === s.id).length} jobs</Badge>
        </button>
      ))}
      {sites.length === 0 && !adding && (
        <p className="text-sm text-gray-400">
          No sites yet — add one here, or they're created automatically with jobs.
        </p>
      )}
      {isAdmin && !adding && (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Site
        </Button>
      )}
    </div>
  );
}

function ComplianceCard({ customer, readOnly }: { customer: Customer; readOnly: boolean }) {
  const { draft, setField } = useDraftRecord(db.customers, customer);
  return (
    <div className={gridCls(readOnly)}>
      <div>
        <Label className="text-xs">Payment terms</Label>
        <Input
          value={draft.paymentTerms ?? ''}
          placeholder="Net 30"
          onChange={(e) => setField('paymentTerms', e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">
          COI expires <ExpiryPill date={draft.coiExpires} />
        </Label>
        <Input
          type="date"
          value={draft.coiExpires ?? ''}
          onChange={(e) => setField('coiExpires', e.target.value || undefined)}
        />
      </div>
      <div className="flex items-center gap-4 sm:col-span-2 py-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!draft.poRequired}
            onChange={(e) => setField('poRequired', e.target.checked)}
          />
          PO required on jobs
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!draft.taxExempt}
            onChange={(e) => setField('taxExempt', e.target.checked)}
          />
          Tax exempt
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!draft.w9OnFile}
            onChange={(e) => setField('w9OnFile', e.target.checked)}
          />
          W-9 on file
        </label>
      </div>
      {draft.taxExempt && (
        <div className="sm:col-span-2">
          <Label className="text-xs">Tax exemption cert</Label>
          <Input
            value={draft.taxCertNote ?? ''}
            placeholder="Cert number / where it's filed"
            onChange={(e) => setField('taxCertNote', e.target.value)}
          />
        </div>
      )}
      <div>
        <Label className="text-xs">Rate notes</Label>
        <Input value={draft.rateNotes ?? ''} onChange={(e) => setField('rateNotes', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Prequal notes</Label>
        <Input
          value={draft.prequalNotes ?? ''}
          onChange={(e) => setField('prequalNotes', e.target.value)}
        />
      </div>
    </div>
  );
}
