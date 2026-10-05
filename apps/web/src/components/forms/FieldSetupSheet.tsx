// S26 push 2 (Matthew, Oct 5 2026: "nice for the blaster using his phone"):
// a day at a NEW job, from the field, in four questions — who for, where,
// what, who is onsite. Enough to start; the job is marked "set up from the
// field" and the office finishes it from its chair.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery, db } from '@/db';
import { createCustomer, createSite } from '@/lib/jobContext';
import { createJob } from '@/hooks/useBlastDay';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { getFix, isFix, GPS_FAILURE_TEXT, type GpsFix, type GpsFailure } from '@/lib/gps';
import { WORK_TYPES, WORK_TYPE_LABEL } from '@/lib/prefs';
import type { WorkType } from '@/db/schema';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = 1 | 2 | 3 | 4;

export function FieldSetupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (jobId: string) => void }) {
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.archivedAt && c.isActive !== false).toArray()) ?? [];
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const [step, setStep] = useState<Step>(1);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [address, setAddress] = useState({ street: '', city: '', state: '' });
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [workType, setWorkType] = useState<WorkType>('drill_to_blast');
  const [onsite, setOnsite] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address.state && company?.state) setAddress((a) => ({ ...a, state: company.state }));
  }, [company?.state, address.state]);

  const q = customerName.trim().toLowerCase();
  const match = useMemo(() => (q && !customerId ? customers.find((c) => c.name.toLowerCase().includes(q)) : undefined), [q, customerId, customers]);
  const picked = customerId ? customers.find((c) => c.id === customerId) : undefined;
  const whereReady = Boolean(fix) || (address.street.trim().length > 2 && address.state.trim().length === 2);

  const locate = async () => {
    setLocating(true);
    setGpsNote(null);
    const r = await getFix({ timeoutMs: 12000 });
    setLocating(false);
    if (isFix(r)) { setFix(r); setGpsNote(`Here · ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}${r.accuracy ? ` · ±${Math.round(r.accuracy)} m` : ''}`); }
    else setGpsNote(GPS_FAILURE_TEXT[r as GpsFailure]);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = getSessionUser();
      const cid = customerId ?? (await createCustomer({ name: customerName.trim(), ...(onsite.name.trim() ? { customerContacts: [{ id: generateId(), name: onsite.name.trim(), phone: onsite.phone.trim(), role: 'Onsite', isPrimary: true }] } : {}) }));
      const street = address.street.trim() || (fix ? `Near ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : 'New site');
      const sid = await createSite(cid, {
        name: street,
        address: street,
        city: address.city.trim(),
        state: (address.state.trim() || company?.state || 'MA').toUpperCase(),
        kFactor: 180,
        ...(fix ? { geo: { lat: fix.lat, lng: fix.lng } } : {}),
      });
      const jobId = await createJob({
        name: address.street.trim() ? `${address.street.trim()}${address.city.trim() ? ` · ${address.city.trim()}` : ''}` : `${picked?.name ?? customerName.trim()} · new job`,
        customer: picked?.name ?? customerName.trim(),
        customerId: cid,
        siteId: sid,
        defaultTypeOfWork: workType,
        operation: 'construction',
        typeOfRock: '',
        typeOfTerrain: '',
        ...(onsite.name.trim() ? { contacts: [{ id: generateId(), role: 'onsite', label: 'Onsite contact', name: onsite.name.trim(), phone: onsite.phone.trim() }] } : {}),
        setupFromField: { userId: me?.id, name: me?.name ?? 'the field', at: nowISO() },
      });
      onCreated(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up the job.');
      setBusy(false);
    }
  };

  const bar = (
    <div className="flex gap-1 mb-2" aria-hidden>
      {[1, 2, 3, 4].map((n) => <span key={n} className={`flex-1 h-1 rounded ${n < step ? 'bg-navy' : n === step ? 'bg-safety-orange' : 'bg-gray-200'}`} />)}
    </div>
  );

  return (
    <ConsequenceSheet onClose={onClose}>
      <div data-field-setup data-field-step={step}>
        {bar}
        {step === 1 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">Who is this job for?</h3>
            <Input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerId(undefined); }} placeholder="Type a name" autoFocus data-field-customer />
            {match ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
                <span><b>{match.name}</b>?</span>
                <Button size="sm" onClick={() => { setCustomerId(match.id); setCustomerName(match.name); }} data-field-use-customer>Yes</Button>
                <Button size="sm" variant="outline" onClick={() => setCustomerId('__new')}>No, a new one</Button>
              </div>
            ) : picked ? (
              <p className="text-sm text-green-700">✓ {picked.name}</p>
            ) : customerName.trim() ? (
              <p className="text-xs text-gray-500">New customer. The office adds the rest later.</p>
            ) : (
              <p className="text-xs text-gray-500">Recent: {customers.slice(0, 3).map((c) => c.name).join(' · ') || '—'}</p>
            )}
            <Button className="w-full" disabled={!customerName.trim()} onClick={() => { if (customerId === '__new') setCustomerId(undefined); setStep(2); }} data-field-next>Next</Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">Where?</h3>
            <Button variant={fix ? 'outline' : 'default'} className="w-full" disabled={locating} onClick={() => void locate()} data-field-gps>{locating ? 'Finding you…' : fix ? 'Use where I am ✓' : 'Use where I am'}</Button>
            {gpsNote && <p className={`text-xs ${fix ? 'text-green-700' : 'text-amber-700'}`} data-field-gps-note>{gpsNote}</p>}
            <div className="grid grid-cols-1 gap-2">
              <div><Label className="text-xs">Or the address</Label><Input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="118 Ridge Road" data-field-street /></div>
              <div className="grid grid-cols-[1fr_4rem] gap-2">
                <Input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Town" data-field-city />
                <Input value={address.state} maxLength={2} onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="MA" data-field-state />
              </div>
            </div>
            <p className="text-xs text-gray-500">The town's rows and the hospital come from the town once it is known. The office fills in what is missing.</p>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button className="flex-1" disabled={!whereReady} onClick={() => setStep(3)} data-field-next>Next</Button></div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">What are we doing?</h3>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((t) => (
                <button key={t} type="button" className={`rounded-full border px-3 py-1.5 text-sm ${workType === t ? 'bg-navy text-white border-navy' : 'border-gray-200 bg-white'}`} onClick={() => setWorkType(t)} data-field-work={t}>{WORK_TYPE_LABEL[t]}</button>
              ))}
            </div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button className="flex-1" onClick={() => setStep(4)} data-field-next>Next</Button></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">Who is onsite?</h3>
            <Input value={onsite.name} onChange={(e) => setOnsite({ ...onsite, name: e.target.value })} placeholder="Name" data-field-onsite-name />
            <Input value={onsite.phone} inputMode="tel" onChange={(e) => setOnsite({ ...onsite, phone: e.target.value })} placeholder="Phone" data-field-onsite-phone />
            <p className="text-xs text-green-700">That is enough to start. The office sees "set up from the field" and fills in the rest.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(3)}>Back</Button><Button className="flex-1" variant="safety" disabled={busy} onClick={() => void create()} data-field-create>Set up and start a day</Button></div>
          </div>
        )}
        <Button variant="ghost" className="w-full mt-2" onClick={onClose}>Close</Button>
      </div>
    </ConsequenceSheet>
  );
}
