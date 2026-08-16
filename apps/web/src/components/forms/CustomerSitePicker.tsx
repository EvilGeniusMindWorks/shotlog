// Customer + Site selection for job creation: pick existing ones from
// dropdowns, or flip either to "new" and type it — the create flow turns
// the typed values into real records. One component, both job forms.
import { useState } from 'react';
import { useLiveQuery, db } from '@/db';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const NEW = '__new';

export interface CustomerSitePick {
  /** Set when an EXISTING record is picked */
  customerId?: string;
  siteId?: string;
  /** Typed values (used when creating new) */
  customerName: string;
  address: string;
  city: string;
  state: string;
  kFactor: number;
}

export function emptyPick(): CustomerSitePick {
  return { customerName: '', address: '', city: '', state: '', kFactor: 180 };
}

export function pickReady(p: CustomerSitePick): boolean {
  return Boolean(p.customerId || p.customerName.trim());
}

export function CustomerSitePicker({
  value,
  onChange,
}: {
  value: CustomerSitePick;
  onChange: (next: CustomerSitePick) => void;
}) {
  const customers =
    useLiveQuery(async () =>
      (await db.customers.filter((c) => c.isActive).toArray()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    ) ?? [];
  const sites =
    useLiveQuery(
      async () =>
        value.customerId
          ? (await db.sites.where('customerId').equals(value.customerId).toArray())
              .filter((s) => s.isActive)
              .sort((a, b) => a.name.localeCompare(b.name))
          : [],
      [value.customerId],
    ) ?? [];
  // '' = nothing chosen yet; NEW = typing a new one
  const [customerMode, setCustomerMode] = useState(value.customerId ?? (customers.length ? '' : NEW));
  const [siteMode, setSiteMode] = useState(value.siteId ?? NEW);
  const newCustomer = customerMode === NEW;
  const newSite = newCustomer || siteMode === NEW;

  return (
    <>
      <div>
        <Label>Customer *</Label>
        <Select
          value={customerMode}
          onChange={(e) => {
            const v = e.target.value;
            setCustomerMode(v);
            setSiteMode(NEW);
            if (v === NEW || v === '') {
              onChange({ ...value, customerId: undefined, siteId: undefined });
            } else {
              const c = customers.find((x) => x.id === v);
              onChange({ ...value, customerId: v, siteId: undefined, customerName: c?.name ?? '' });
            }
          }}
          options={[
            { value: '', label: 'Pick customer…' },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
            { value: NEW, label: '+ New customer' },
          ]}
        />
        {newCustomer && (
          <Input
            className="mt-1"
            placeholder="Customer name"
            value={value.customerName}
            onChange={(e) => onChange({ ...value, customerName: e.target.value })}
          />
        )}
      </div>
      <div>
        <Label>Site / Location</Label>
        {!newCustomer ? (
          <Select
            value={siteMode}
            disabled={!value.customerId}
            onChange={(e) => {
              const v = e.target.value;
              setSiteMode(v);
              if (v === NEW) onChange({ ...value, siteId: undefined });
              else {
                const s = sites.find((x) => x.id === v);
                onChange({
                  ...value,
                  siteId: v,
                  address: s?.address ?? '',
                  city: s?.city ?? '',
                  state: s?.state ?? '',
                });
              }
            }}
            options={[
              ...sites.map((s) => ({ value: s.id, label: s.name })),
              { value: NEW, label: '+ New site' },
            ]}
          />
        ) : (
          <p className="text-xs text-gray-400 pt-2.5">New customer — enter the site below.</p>
        )}
      </div>
      {newSite && (
        <>
          <div>
            <Label>Address</Label>
            <Input value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>City</Label>
              <Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
            </div>
            <div className="w-16">
              <Label>State</Label>
              <Input
                value={value.state}
                maxLength={2}
                onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase().slice(0, 2) })}
              />
            </div>
          </div>
          <div>
            <Label>Site K Factor</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={value.kFactor || ''}
              onChange={(e) => onChange({ ...value, kFactor: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </>
      )}
    </>
  );
}
