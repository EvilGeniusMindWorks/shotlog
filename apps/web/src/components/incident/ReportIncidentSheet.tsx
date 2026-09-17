// S20 (Matthew): Report an incident — from the day's tile (the day is
// known), from the home's + (which day?) or from Admin › Incidents (any open
// day, or none). Which day, then what kind; the incident opens with the
// day's job, customer and site already on it.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import type { BlastDay, IncidentType } from '@/db/schema';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';
import { createIncident } from '@/hooks/useIncidents';
import { INCIDENT_KINDS } from '@/lib/incidentDoNow';
import { homeIsMineFirst, myDayIds } from '@/lib/mine';
import { formatDate, todayISO } from '@/lib/utils';

const NONE = '__none__';

export function ReportIncidentSheet({ day, onClose }: { day?: BlastDay; onClose: () => void }) {
  const navigate = useNavigate();
  const [dayId, setDayId] = useState<string | undefined>(day?.id);
  const [busy, setBusy] = useState(false);
  // recent open days — mine on a field home, everyone's for the office
  const days = useLiveQuery(async () => {
    if (day) return [];
    const mineFirst = homeIsMineFirst();
    const mine = mineFirst ? await myDayIds() : null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const from = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const all = (await db.blastDays.toArray()).filter((d) => d.status !== 'approved' && !d.closed && d.date >= from && (!mine || mine.has(d.id)));
    const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));
    return all
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({ id: d.id, label: `${d.name || jobs.get(d.jobId) || 'Work day'} · ${d.date === todayISO() ? 'today' : formatDate(d.date)}` }));
  }, [day?.id]);
  const picked = dayId ?? (days && days.length > 0 && days[0] && days[0].label.endsWith('today') ? days[0].id : undefined);
  const go = async (kind: IncidentType) => {
    if (busy) return;
    setBusy(true);
    const links = picked && picked !== NONE ? { blastDayId: picked } : {};
    const id = await createIncident(kind, links);
    onClose();
    navigate(`/incident/${id}`);
  };
  return (
    <ConsequenceSheet onClose={onClose}>
      <div data-report-incident>
        <h3 className="font-bold text-lg">Report an incident</h3>
        {!day && (
          <div className="mt-2 space-y-1" data-report-incident-days>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Which day?</p>
            {(days ?? []).map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm cursor-pointer" data-report-incident-day={d.id}>
                <input type="radio" name="incident-day" checked={picked === d.id} onChange={() => setDayId(d.id)} />
                <span className="truncate">{d.label}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm cursor-pointer" data-report-incident-day="none">
              <input type="radio" name="incident-day" checked={picked === NONE} onChange={() => setDayId(NONE)} />
              <span>Not tied to a work day</span>
            </label>
          </div>
        )}
        {day && <p className="text-sm text-gray-600 mt-1">On {day.name || 'this work day'} · {formatDate(day.date)}</p>}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3">What kind?</p>
        <div className="mt-1 space-y-1">
          {INCIDENT_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[44px] disabled:opacity-50"
              disabled={busy || (!day && !picked)}
              data-report-incident-kind={k.value}
              onClick={() => void go(k.value)}
            >
              <span className="font-semibold text-sm">{k.label}</span>
              {k.hint && <span className="block text-xs text-gray-500">{k.hint}</span>}
            </button>
          ))}
        </div>
        <Button variant="outline" className="w-full mt-3" onClick={onClose}>
          Close
        </Button>
      </div>
    </ConsequenceSheet>
  );
}
