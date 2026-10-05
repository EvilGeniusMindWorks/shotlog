// S26 (Matthew, Oct 5 2026, shape A): the one New site form — from a
// customer's page (the customer already set) or from "Set up…" (pick the
// customer first). An address with its ZIP, the site K, and town memory:
// when another site in the same town already carries the fire chief,
// police, fire and town hall rows, the new site gets them too, and says so.
import { useMemo, useState } from 'react';
import { useLiveQuery, db } from '@/db';
import { createSite, townContactsFrom } from '@/lib/jobContext';
import { AddressFields, emptyAddress } from '@/components/forms/AddressFields';
import { UseCustomerAddress } from '@/components/forms/UseCustomerAddress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { Customer } from '@/db/schema';

export function NewSiteForm({
  customer,
  onCreated,
  onCancel,
}: {
  /** Set when opened from the customer's page; otherwise the form asks */
  customer?: Customer;
  onCreated: (siteId: string) => void;
  onCancel: () => void;
}) {
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.archivedAt && c.isActive !== false).toArray()) ?? [];
  const sites = useLiveQuery(() => db.sites.filter((s) => !s.archivedAt).toArray()) ?? [];
  const [customerId, setCustomerId] = useState<string>(customer?.id ?? '');
  const picked = customer ?? customers.find((c) => c.id === customerId);
  const [site, setSite] = useState({ name: '', addr: emptyAddress(), kFactor: 180 });
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // town memory: another site in this town with the town rows
  const memory = useMemo(() => townContactsFrom(sites, { city: site.addr.city, state: site.addr.state }), [sites, site.addr.city, site.addr.state]);
  const ready = Boolean(picked) && (site.addr.street1.trim().length > 0 || site.name.trim().length > 0) && site.addr.state.trim().length === 2;

  const create = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createSite(picked.id, {
        name: site.name,
        address: site.addr.street1,
        street2: site.addr.street2?.trim() || undefined,
        city: site.addr.city,
        state: site.addr.state,
        zip: site.addr.zip?.trim() || undefined,
        kFactor: site.kFactor,
      });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the site.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3" data-new-site-form>
      <p className="text-sm font-semibold">{picked ? `New site for ${picked.name}` : 'New site'}</p>
      {!customer && (
        <div>
          <Label className="text-xs">Customer *</Label>
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[{ value: '', label: 'Pick the customer…' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]}
            data-new-site-customer
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {picked && (
          <div className="sm:col-span-2">
            <UseCustomerAddress
              customer={picked}
              value={{ address: site.addr.street1, city: site.addr.city, state: site.addr.state, zip: site.addr.zip }}
              onUse={(a) => setSite({ ...site, addr: { ...site.addr, street1: a.address, city: a.city, state: a.state, zip: a.zip ?? '' } })}
            />
          </div>
        )}
        <AddressFields
          value={site.addr}
          onChange={(addr) => setSite((s) => ({ ...s, addr, name: nameTouched ? s.name : addr.street1 }))}
        />
        <div className="sm:col-span-2">
          <Label className="text-xs">Site name <span className="text-gray-400 font-normal">— follows the address until you change it</span></Label>
          <Input
            value={site.name}
            placeholder="defaults to the address"
            onChange={(e) => { setNameTouched(true); setSite({ ...site, name: e.target.value }); }}
            data-new-site-name
          />
        </div>
        <div>
          <Label className="text-xs">Site K</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={site.kFactor || ''}
            onChange={(e) => setSite({ ...site, kFactor: parseFloat(e.target.value) || 0 })}
            data-new-site-k
          />
        </div>
      </div>
      {memory ? (
        <p className="text-xs text-green-700" data-new-site-town-memory>
          {site.addr.city} · you have {memory.fromSiteName}. Fire chief, police, fire and town hall will be copied from it. Change them on the site afterwards.
        </p>
      ) : site.addr.city.trim() ? (
        <p className="text-xs text-gray-500" data-new-site-town-first>First site in {site.addr.city}: the town rows are typed, or suggested, on the site page.</p>
      ) : null}
      <p className="text-xs text-gray-400">Permits, structures and the hospital row live on the site page. Nothing else is needed to create it.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={!ready || busy} onClick={() => void create()} data-new-site-create>
          Create site
        </Button>
      </div>
    </div>
  );
}
