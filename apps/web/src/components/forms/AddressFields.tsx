// Full postal address entry — every address in the app is a field SET
// (street 1 / street 2 / city / state / zip), never a single line.
import type { PostalAddress } from '@/db/schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const emptyAddress = (): PostalAddress => ({
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
});

export function formatAddress(a?: PostalAddress): string {
  if (!a) return '';
  return [a.street1, a.street2, [a.city, a.state].filter(Boolean).join(', '), a.zip]
    .filter(Boolean)
    .join(', ');
}

export function AddressFields({
  value,
  onChange,
  labelPrefix,
}: {
  value: PostalAddress;
  onChange: (next: PostalAddress) => void;
  labelPrefix?: string;
}) {
  const set = (patch: Partial<PostalAddress>) => onChange({ ...value, ...patch });
  const p = labelPrefix ? `${labelPrefix} ` : '';
  return (
    <>
      <div className="sm:col-span-2">
        <Label className="text-xs">{p}Street</Label>
        <Input value={value.street1} onChange={(e) => set({ street1: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">{p}Street 2</Label>
        <Input
          value={value.street2 ?? ''}
          placeholder="Suite, floor, PO box…"
          onChange={(e) => set({ street2: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">City</Label>
        <Input value={value.city} onChange={(e) => set({ city: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <div className="w-16">
          <Label className="text-xs">State</Label>
          <Input
            value={value.state}
            maxLength={2}
            onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) })}
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Zip</Label>
          <Input
            value={value.zip}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => set({ zip: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
