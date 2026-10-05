// S26 push 3: the generic inputs of the New job sheet — one per row Admin ›
// Setup fields asks for "at setup" that has no field of its own on the sheet.
// Text, a date, a number, a few lines, yes/no, the two dates of a job, or the
// onsite contact's name and phone. Each carries data-new-job-extra=<row key>.
import type { SetupFieldDef, SetupExtraValues } from '@/lib/setupFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function SetupExtraInputs({ fields, values, onChange }: { fields: SetupFieldDef[]; values: SetupExtraValues; onChange: (next: SetupExtraValues) => void }) {
  if (fields.length === 0) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <>
      {fields.map((f) => {
        const input = f.input!;
        if (input.kind === 'dates') {
          return (
            <div key={f.key} className="grid grid-cols-2 gap-2 sm:col-span-2" data-new-job-extra={f.key}>
              <div>
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={values[`${f.key}:start`] ?? ''} onChange={(e) => set(`${f.key}:start`, e.target.value)} data-new-job-extra-start />
              </div>
              <div>
                <Label className="text-xs">Target date</Label>
                <Input type="date" value={values[`${f.key}:target`] ?? ''} onChange={(e) => set(`${f.key}:target`, e.target.value)} data-new-job-extra-target />
              </div>
            </div>
          );
        }
        if (input.kind === 'contact') {
          return (
            <div key={f.key} className="grid grid-cols-2 gap-2 sm:col-span-2" data-new-job-extra={f.key}>
              <div>
                <Label className="text-xs">{f.label}</Label>
                <Input value={values[`${f.key}:name`] ?? ''} onChange={(e) => set(`${f.key}:name`, e.target.value)} placeholder="Name" data-new-job-extra-name />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input type="tel" value={values[`${f.key}:phone`] ?? ''} onChange={(e) => set(`${f.key}:phone`, e.target.value)} placeholder="413-555-0100" data-new-job-extra-phone />
              </div>
            </div>
          );
        }
        if (input.kind === 'yesno') {
          const v = values[f.key] ?? '';
          return (
            <div key={f.key} data-new-job-extra={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden mt-1">
                {(['yes', 'no'] as const).map((o) => (
                  <button key={o} type="button" className={`px-3 py-1.5 text-sm ${v === o ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`} onClick={() => set(f.key, v === o ? '' : o)} data-new-job-extra-pick={o}>
                    {o === 'yes' ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (input.kind === 'textarea') {
          return (
            <div key={f.key} className="sm:col-span-2" data-new-job-extra={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Textarea rows={2} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={input.placeholder} data-new-job-extra-input />
            </div>
          );
        }
        return (
          <div key={f.key} data-new-job-extra={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Input
              type={input.kind === 'date' ? 'date' : input.kind === 'number' ? 'number' : 'text'}
              inputMode={input.kind === 'number' ? 'decimal' : undefined}
              value={values[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={input.placeholder}
              data-new-job-extra-input
            />
          </div>
        );
      })}
    </>
  );
}
