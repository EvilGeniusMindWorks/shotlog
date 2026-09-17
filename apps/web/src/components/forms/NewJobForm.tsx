// New job is ONE sheet in three steps (S22, Matthew: "can you build a quick
// guided workflow for customer / site / job creation?" and "too many clicks"):
// the customer (search, or type a new name — billing can wait), the site (the
// customer's address, an existing site, or a typed address), the job (the
// name filled from the site, the number automatic, the type of work). A step
// already known is skipped: from a customer page the sheet opens on the site,
// from a site page or the day dialog's site on the job. Used by the Jobs
// page, the customer and site pages, and the New work day dialog.
// S7b's order stands: customer → site → job, always.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery, db } from '@/db';
import { createJob } from '@/hooks/useBlastDay';
import { nextJobNumber } from '@/lib/jobContext';
import { townOf } from '@/lib/siteFacts';
import type { WorkType } from '@/db/schema';
import { WORK_TYPES, WORK_TYPE_LABEL } from '@/lib/prefs';
import { pickWhyNot, type CustomerSitePick } from './CustomerSitePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

type Operation = 'construction' | 'quarry' | 'trench' | 'open';
type Step = 1 | 2 | 3;
const STEP_LABEL: Record<Step, string> = { 1: 'Customer', 2: 'Site', 3: 'Job' };

export function NewJobForm({
  initial,
  onCreated,
  onCancel,
  title = 'New job',
}: {
  /** Customer / site already chosen upstream (the day dialog's cascade, a
   *  site's "+ New job") — the sheet opens on the first step still open */
  initial?: Partial<CustomerSitePick>;
  onCreated: (jobId: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.archivedAt && c.isActive !== false).toArray()) ?? [];
  const sites = useLiveQuery(() => db.sites.filter((s) => !s.archivedAt).toArray()) ?? [];
  const jobs = useLiveQuery(() => db.jobs.filter((j) => !j.archivedAt).toArray()) ?? [];
  const [step, setStep] = useState<Step>(initial?.siteId ? 3 : initial?.customerId ? 2 : 1);
  const [customerId, setCustomerId] = useState<string | undefined>(initial?.customerId);
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '');
  const [search, setSearch] = useState('');
  const [siteId, setSiteId] = useState<string | undefined>(initial?.siteId);
  const [typing, setTyping] = useState(false);
  const [site, setSite] = useState({ siteName: initial?.siteName ?? '', address: initial?.address ?? '', city: initial?.city ?? '', state: initial?.state ?? '', kFactor: initial?.kFactor ?? 180 });
  const [form, setForm] = useState({ name: '', operation: 'construction' as Operation, customerPO: '', defaultTypeOfWork: '' as WorkType | '' });
  const [nextNumber, setNextNumber] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nextNumber) return;
    void nextJobNumber().then(setNextNumber).catch(() => undefined);
  }, [step, nextNumber]);

  const customer = customerId ? customers.find((c) => c.id === customerId) : undefined;
  const customerSites = useMemo(() => (customerId ? sites.filter((s) => s.customerId === customerId) : []), [sites, customerId]);
  const pickedSite = siteId ? sites.find((s) => s.id === siteId) : undefined;
  const jobsAt = (sid: string) => jobs.filter((j) => j.siteId === sid).length;
  const q = search.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers).slice(0, 8),
    [customers, q],
  );
  const exact = customers.find((c) => c.name.trim().toLowerCase() === q);

  // the name a site gives its job: the site's own name, or its address
  const suggestedName = pickedSite ? pickedSite.name : site.siteName || site.address;
  const goToJob = (nameFrom?: string) => {
    const suggested = nameFrom ?? suggestedName;
    setForm((f) => ({ ...f, name: f.name || suggested }));
    setStep(3);
  };

  const pick: CustomerSitePick = { customerId, siteId, customerName: customer?.name ?? customerName, ...site };
  const siteWhy = pickWhyNot(pick);
  const ready = form.name.trim().length > 0 && siteWhy === null;
  const whyNot = !form.name.trim() ? 'Give the job a name.' : siteWhy;

  const useCustomerAddress = () => {
    const b = customer?.billing;
    if (!b) return;
    setSiteId(undefined);
    setTyping(true);
    setSite({ siteName: b.street1 || customer?.name || '', address: b.street1 || '', city: b.city || '', state: b.state || '', kFactor: 180 });
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await createJob({
        name: form.name.trim(),
        operation: form.operation,
        typeOfRock: '',
        typeOfTerrain: '',
        customerPO: form.customerPO,
        ...(form.defaultTypeOfWork ? { defaultTypeOfWork: form.defaultTypeOfWork } : {}),
        customerId,
        siteId,
        customer: customer?.name ?? customerName,
        address: pickedSite?.address ?? site.address,
        city: pickedSite?.city ?? site.city,
        state: pickedSite?.state ?? site.state,
        kFactor: pickedSite?.kFactor ?? site.kFactor,
        siteName: pickedSite?.name ?? site.siteName,
      });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the job.');
    } finally {
      setBusy(false);
    }
  };

  const chip = (label: string, onChange?: () => void, attrs?: Record<string, string>) => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs" {...attrs}>
      {label}
      {onChange && <button type="button" className="text-navy underline" onClick={onChange}>change</button>}
    </span>
  );

  return (
    <div className="space-y-3" data-new-job-form data-new-job-step={step}>
      {/* the chosen customer and site ride along as form values */}
      <input type="hidden" data-pick-customer value={customerId ?? ''} readOnly />
      <input type="hidden" data-pick-site value={siteId ?? ''} readOnly />
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm">{title} · {step} of 3 · {STEP_LABEL[step]}</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      {(step > 1 || customer || customerName) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {chip(customer?.name ?? (customerName ? `${customerName} · new` : '—'), step > 1 && !initial?.customerId ? () => { setStep(1); setSiteId(undefined); } : undefined, { 'data-new-job-customer-chip': customer?.id ?? 'new' })}
          {step > 2 && chip(pickedSite ? `${pickedSite.name} · ${townOf(pickedSite)}` : [site.siteName, townOf(site)].filter(Boolean).join(' · ') || '—', !initial?.siteId ? () => setStep(2) : undefined, { 'data-new-job-site-chip': pickedSite?.id ?? 'new' })}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <Label>Customer</Label>
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a few letters…"
            data-new-job-customer-search
          />
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {matches.map((c) => {
              const n = sites.filter((s) => s.customerId === c.id).length;
              const town = sites.find((s) => s.customerId === c.id) ? townOf(sites.find((s) => s.customerId === c.id)!) : townOf(c.billing ?? {});
              return (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 min-h-[44px]"
                  onClick={() => { setCustomerId(c.id); setCustomerName(''); setSiteId(undefined); setStep(2); }}
                  data-new-job-customer={c.id}
                >
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400">{[town, `${n} site${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p>
                </button>
              );
            })}
            {q && !exact && (
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 min-h-[44px] text-navy"
                onClick={() => { setCustomerId(undefined); setCustomerName(search.trim()); setSiteId(undefined); setTyping(true); setStep(2); }}
                data-new-job-new-customer
              >
                <p className="text-sm font-medium">+ New customer “{search.trim()}”</p>
                <p className="text-xs text-gray-400">billing details later, on the customer's page</p>
              </button>
            )}
            {matches.length === 0 && !q && <p className="px-3 py-2.5 text-sm text-gray-400">No customers yet — type the name to make one.</p>}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <Label>Site</Label>
          {customer && customerSites.length > 0 && !typing && (
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {customerSites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 min-h-[44px]"
                  onClick={() => { setSiteId(s.id); goToJob(s.name); }}
                  data-new-job-site={s.id}
                >
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-gray-400">{[s.address, townOf(s)].filter(Boolean).join(', ')} · K {s.kFactor} · {jobsAt(s.id)} job{jobsAt(s.id) === 1 ? '' : 's'}</p>
                </button>
              ))}
            </div>
          )}
          {!typing && (
            <div className="flex gap-2 flex-wrap">
              {customer?.billing?.street1 && (
                <Button variant="outline" size="sm" onClick={useCustomerAddress} data-new-job-use-address>Use the customer's address</Button>
              )}
              <Button variant={customerSites.length === 0 ? 'default' : 'outline'} size="sm" onClick={() => { setSiteId(undefined); setTyping(true); }} data-new-job-type-address>Type a new address</Button>
            </div>
          )}
          {typing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2 lg:col-span-2">
                <Label className="text-xs">Address *</Label>
                <Input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value, siteName: site.siteName || e.target.value })} placeholder="287 Waltham Street" data-new-job-site-address />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input value={site.city} onChange={(e) => setSite({ ...site, city: e.target.value })} data-new-job-site-city />
              </div>
              <div>
                <Label className="text-xs">State *</Label>
                <Input value={site.state} maxLength={2} onChange={(e) => setSite({ ...site, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="MA" data-new-job-site-state />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">Site name <span className="text-gray-400 font-normal">— defaults to the address</span></Label>
                <Input value={site.siteName} onChange={(e) => setSite({ ...site, siteName: e.target.value })} data-new-job-site-name />
              </div>
              <div>
                <Label className="text-xs">Site K</Label>
                <Input type="number" value={site.kFactor} onChange={(e) => setSite({ ...site, kFactor: Number(e.target.value) || 180 })} />
              </div>
              {customerSites.length > 0 && (
                <button type="button" className="text-xs text-navy underline text-left" onClick={() => setTyping(false)}>Pick one of {customer?.name}'s sites instead</button>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            {typing && siteWhy && <span className="text-xs text-gray-500" data-new-job-why>{siteWhy}</span>}
            {!initial?.customerId && <Button variant="outline" onClick={() => setStep(1)}>Back</Button>}
            {typing && <Button disabled={siteWhy !== null} onClick={() => goToJob()} data-new-job-next>Next: the job</Button>}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <Label>Job name *</Label>
              <Input data-new-job-name value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={suggestedName || 'Route 3 widening'} />
            </div>
            <div>
              <Label>Job # <span className="text-gray-400 font-normal">· automatic</span></Label>
              <Input value={nextNumber} readOnly className="bg-gray-50 text-gray-500" data-new-job-number />
            </div>
            <div>
              <Label>Type of work</Label>
              <Select
                data-new-job-work
                value={form.defaultTypeOfWork}
                onChange={(e) => setForm({ ...form, defaultTypeOfWork: e.target.value as WorkType | '' })}
                options={[{ value: '', label: 'Follow the role default' }, ...WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] }))]}
              />
            </div>
            <div>
              <Label>Customer PO <span className="text-gray-400 font-normal">· optional</span></Label>
              <Input value={form.customerPO} onChange={(e) => setForm({ ...form, customerPO: e.target.value })} />
            </div>
            <div>
              <Label>Operation</Label>
              <Select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value as Operation })} options={OPERATION_OPTIONS} />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Rock, terrain, hazards and the rest live on the job page; the job opens with a setup line for what is still to set.
          </p>
          <div className="flex items-center justify-end gap-3">
            {(whyNot || error) && (
              <span className={`text-xs ${error ? 'text-red-600' : 'text-gray-500'}`} data-new-job-why>{error ?? whyNot}</span>
            )}
            {!initial?.siteId && <Button variant="outline" onClick={() => setStep(2)}>Back</Button>}
            <Button disabled={!ready || busy} onClick={() => void create()} data-new-job-create>{busy ? 'Creating…' : 'Create the job'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
