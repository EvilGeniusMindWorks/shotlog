// S20 (Matthew): the Do now list at the top of an incident — the steps for
// its kind with the job's sheet contacts filled in. A tap on Call opens the
// phone's dialler and records the reporter's confirmation with the time;
// Done records a plain confirmation. The log prints on the report: the
// record that the right people were told, and when.
import { Phone, Check } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import type { Incident } from '@/db/schema';
import { hhmm } from '@/lib/dayCard';
import { logIncidentStep } from '@/hooks/useIncidents';
import { renderDoNow, resolveIncidentContacts } from '@/lib/incidentDoNow';

export function DoNowStrip({ incident, readOnly }: { incident: Incident; readOnly: boolean }) {
  const job = useLiveQuery(() => (incident.jobId ? db.jobs.get(incident.jobId) : undefined), [incident.jobId]);
  const site = useLiveQuery(() => (job?.siteId ? db.sites.get(job.siteId) : undefined), [job?.siteId]);
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const steps = renderDoNow(incident.type, resolveIncidentContacts({ job, site, company }));
  const done = new Map((incident.callLog ?? []).map((e) => [e.key, e]));
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-3 space-y-1" data-do-now={incident.type}>
      <p className="text-[11px] font-bold tracking-widest uppercase text-red-800">Do now</p>
      {steps.map((s, i) => {
        const hit = done.get(s.key);
        return (
          <div key={s.key} className="flex items-start gap-2 py-1 border-t border-red-200/60 first:border-t-0" data-do-now-step={s.key} data-do-now-done={hit ? '1' : undefined}>
            <span className="text-red-800 font-bold w-4 shrink-0">{i + 1}</span>
            <span className="flex-1 min-w-0 text-sm text-red-950">
              {s.line}
              {hit && (
                <span className="block text-xs text-green-800" data-do-now-when={s.key}>
                  ✓ {s.action === 'call' ? 'called' : 'done'} {hhmm(hit.at)}{hit.byName ? ` · ${hit.byName}` : ''}
                </span>
              )}
            </span>
            {!readOnly && !hit && s.action === 'call' && s.tel && (
              <a
                href={`tel:${s.tel.replace(/[^\d+]/g, '')}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-red-700 text-red-800 bg-white px-2.5 py-1 text-xs font-semibold"
                data-do-now-call={s.key}
                onClick={() => void logIncidentStep(incident, s.key, s.line)}
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {!readOnly && !hit && (s.action === 'confirm' || !s.tel) && (
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-red-700 text-red-800 bg-white px-2.5 py-1 text-xs font-semibold"
                data-do-now-confirm={s.key}
                onClick={() => void logIncidentStep(incident, s.key, s.line)}
              >
                <Check className="h-3.5 w-3.5" /> Done
              </button>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-red-900/70 pt-1">A tap records that you did it, with the time — the phone places the call, this report keeps who was told and when.</p>
    </div>
  );
}
