// "Use the customer's address" (Round S14, Matthew Sep 14 2026): a row above
// a site's address fields that copies the customer's billing address in one
// tap. The site keeps its own copy — a later change to the customer never
// moves a site. Absent when the customer has no billing address.
import { Check, ChevronRight } from 'lucide-react';
import type { Customer } from '@/db/schema';

export interface SiteAddressValues {
  address: string;
  city: string;
  state: string;
  zip?: string;
}

/** The customer's billing address as site fields, or null when there is none */
export function customerAddress(customer: Customer | undefined | null): SiteAddressValues | null {
  if (!customer) return null;
  const b = customer.billing;
  if (b && (b.street1?.trim() || b.city?.trim())) {
    return { address: b.street1?.trim() ?? '', city: b.city?.trim() ?? '', state: (b.state ?? '').trim().toUpperCase().slice(0, 2), zip: b.zip?.trim() || undefined };
  }
  if (customer.billingAddress?.trim()) return { address: customer.billingAddress.trim(), city: '', state: '' };
  return null;
}

export function sameAddress(a: SiteAddressValues, b: SiteAddressValues | null): boolean {
  if (!b) return false;
  const n = (s: string | undefined) => (s ?? '').trim().toLowerCase();
  return n(a.address) === n(b.address) && n(a.city) === n(b.city) && n(a.state) === n(b.state) && n(a.zip) === n(b.zip);
}

export function formatAddress(a: SiteAddressValues): string {
  return [a.address, [a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' · ');
}

export function UseCustomerAddress({
  customer,
  value,
  onUse,
  disabled,
}: {
  customer: Customer | undefined | null;
  value: SiteAddressValues;
  onUse: (a: SiteAddressValues) => void;
  disabled?: boolean;
}) {
  const addr = customerAddress(customer);
  if (!addr) return null;
  const same = sameAddress(value, addr);
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left min-h-[48px] ${
        same ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      data-use-customer-address
      data-same={same ? '1' : undefined}
      disabled={disabled}
      onClick={() => onUse(addr)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
          {same ? "Using the customer's address" : "Use the customer's address"}
        </p>
        <p className="text-sm font-medium truncate">{formatAddress(addr)}</p>
      </div>
      {same ? <Check className="h-4 w-4 text-green-700 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
    </button>
  );
}
