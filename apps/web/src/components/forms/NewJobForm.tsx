// ONE New job flow (Round S7b, Matthew: "the hierarchy is Customer > Site >
// Job and should be entered in that order"). Used by the Jobs lens and by
// the New work day dialog — same fields, same order, everywhere a job is
// created: Customer → Site → the job itself.
import { useState } from 'react';
import { createJob } from '@/hooks/useBlastDay';
import type { WorkType } from '@/db/schema';
import { WORK_TYPES, WORK_TYPE_LABEL } from '@/lib/prefs';
import { CustomerSitePicker, emptyPick, pickReady, type CustomerSitePick } from './CustomerSitePicker';
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

export function NewJobForm({
  initial,
  onCreated,
  onCancel,
  title = 'New job',
}: {
  /** Customer / site already chosen upstream (the day dialog's cascade) */
  initial?: { customerId?: string; siteId?: string };
  onCreated: (jobId: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  const [pick, setPick] = useState<CustomerSitePick>(() => emptyPick(initial));
  const [form, setForm] = useState({
    name: '',
    operation: 'construction' as Operation,
    customerPO: '',
    typeOfRock: '',
    typeOfTerrain: '',
    defaultTypeOfWork: '' as WorkType | '',
  });
  const [busy, setBusy] = useState(false);
  const ready = form.name.trim().length > 0 && pickReady(pick);

  const create = async () => {
    setBusy(true);
    try {
      const id = await createJob({
        name: form.name.trim(),
        operation: form.operation,
        typeOfRock: form.typeOfRock,
        typeOfTerrain: form.typeOfTerrain,
        customerPO: form.customerPO,
        ...(form.defaultTypeOfWork ? { defaultTypeOfWork: form.defaultTypeOfWork } : {}),
        customerId: pick.customerId,
        siteId: pick.siteId,
        customer: pick.customerName,
        address: pick.address,
        city: pick.city,
        state: pick.state,
        kFactor: pick.kFactor,
      });
      onCreated(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-new-job-form>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{title}</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">1 · Customer and site</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomerSitePicker value={pick} onChange={setPick} />
      </div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-1">2 · The job</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Job name *</Label>
          <Input
            data-new-job-name
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Route 3 widening"
          />
        </div>
        <div>
          <Label>Operation</Label>
          <Select
            value={form.operation}
            onChange={(e) => setForm({ ...form, operation: e.target.value as Operation })}
            options={OPERATION_OPTIONS}
          />
        </div>
        <div>
          <Label>Default type of work</Label>
          <Select
            data-new-job-work
            value={form.defaultTypeOfWork}
            onChange={(e) => setForm({ ...form, defaultTypeOfWork: e.target.value as WorkType | '' })}
            options={[
              { value: '', label: 'Follow the role default' },
              ...WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] })),
            ]}
          />
        </div>
        <div>
          <Label>Customer PO</Label>
          <Input value={form.customerPO} onChange={(e) => setForm({ ...form, customerPO: e.target.value })} />
        </div>
        <div>
          <Label>Rock</Label>
          <Input value={form.typeOfRock} onChange={(e) => setForm({ ...form, typeOfRock: e.target.value })} placeholder="Granite" />
        </div>
        <div>
          <Label>Terrain</Label>
          <Input value={form.typeOfTerrain} onChange={(e) => setForm({ ...form, typeOfTerrain: e.target.value })} placeholder="Bench" />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Job # is assigned automatically (this year's next number) — editable on the job page, where
        hazards, precautions and contacts live too.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!ready || busy} onClick={() => void create()} data-new-job-create>
          {busy ? 'Creating…' : 'Create job'}
        </Button>
      </div>
    </div>
  );
}
