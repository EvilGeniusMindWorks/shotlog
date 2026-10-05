// S26 push 2: jobs a blaster set up from the field, on the office's home until
// the office finishes and confirms the setup. Each card says who, when, and
// what still holds a blasting day.
import { useNavigate } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { blastingGate } from '@/lib/dayGate';
import { gateKeys, useSetupFields } from '@/lib/setupFields';
import { Button } from '@/components/ui/button';

export function FieldSetupCards() {
  const navigate = useNavigate();
  const fields = useSetupFields();
  const rows = useLiveQuery(async () => {
    const jobs = (await db.jobs.filter((j) => Boolean(j.setupFromField) && !j.setupConfirmedAt && !j.archivedAt).toArray()).sort((a, b) => (b.setupFromField?.at ?? '').localeCompare(a.setupFromField?.at ?? ''));
    return Promise.all(jobs.map(async (j) => ({ j, site: j.siteId ? await db.sites.get(j.siteId) : undefined, customer: j.customerId ? await db.customers.get(j.customerId) : undefined })));
  }) ?? [];
  if (rows.length === 0) return null;
  const keys = gateKeys(fields);
  return (
    <section className="space-y-2" data-field-setup-cards data-field-setup-count={rows.length}>
      {rows.map(({ j, site, customer }) => {
        const missing = blastingGate(site, keys, customer).filter((l) => !l.ok).map((l) => l.text.split(' · ')[0].toLowerCase());
        return (
          <div key={j.id} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm flex items-center gap-3 flex-wrap" data-field-setup-card={j.id}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">Set up from the field · {j.setupFromField?.name} · {j.setupFromField ? new Date(j.setupFromField.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</p>
              <p className="text-xs text-amber-900/80 truncate">{j.jobNumber ? `${j.jobNumber} · ` : ''}{j.name} · {customer?.name ?? j.customer}{site ? ` · ${[site.address, site.city].filter(Boolean).join(', ')}` : ''}{missing.length ? ` · missing: ${missing.join(', ')}` : ''}</p>
            </div>
            <Button size="sm" variant="safety" onClick={() => navigate(`/jobs/${j.id}`)} data-field-setup-finish>Finish the setup</Button>
          </div>
        );
      })}
    </section>
  );
}
