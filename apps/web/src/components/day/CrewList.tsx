// The crew on a day (Round S14): one row per person with the state of each
// of their papers; tap a row for that person's papers — read any of them,
// Accept a drill log they signed complete, Remind when their card is
// missing. From eight people: a summary line, a Needs something / All
// filter and search; rows that need something float up. Blasters are the
// supervisors at Baystate; the separate supervisor role sees the same.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import type { BlastDay } from '@/db/schema';
import { remindForCard, type CrewModel, type CrewPerson } from '@/lib/dayHub';
import { drillLogRoute } from '@/hooks/useDrillPlans';
import { hhmm } from '@/lib/dayCard';
import { canDrillLogTransition } from '@/lib/perms';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const BIG_CREW = 8;

function cardWord(p: CrewPerson): string {
  if (!p.card) return p.reminded ? `card not filed · reminded ${hhmm(p.reminded.at)}` : 'card not filed';
  if (p.card.status === 'draft') return 'card in draft';
  if (p.card.status === 'approved') return 'card approved';
  return 'card filed';
}

function personParts(p: CrewPerson): string {
  const parts: string[] = [];
  for (const c of p.checklists) parts.push(`checklist ${c.asset}${c.checklist.stopHours != null ? ' stopped' : ' filed'}`);
  for (const l of p.logs) {
    const holes = p.holesByLog.get(l.id) ?? 0;
    parts.push(`log ${holes} holes${l.status === 'complete' ? ' · signed complete' : l.status === 'accepted' ? ' · accepted' : ''}`);
  }
  parts.push(cardWord(p));
  return parts.join(' · ');
}

export function CrewList({
  day,
  model,
  canAct,
}: {
  day: BlastDay;
  model: CrewModel;
  canAct: boolean;
}) {
  const navigate = useNavigate();
  const big = model.people.length >= BIG_CREW;
  const anyNeeds = model.people.some((p) => p.needs);
  const [filter, setFilter] = useState<'needs' | 'all'>(anyNeeds ? 'needs' : 'all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      model.people.filter(
        (p) => (!big || filter === 'all' || p.needs) && (!q || p.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [model.people, big, filter, q],
  );
  const person = open ? model.people.find((p) => p.key === open) : undefined;

  if (model.people.length === 0) {
    return (
      <div className="pt-2" data-crew-list data-crew-count="0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Crew today</p>
        <p className="text-sm text-gray-400 py-1">Nobody else yet — people appear as they confirm the card, file a checklist, start a log or add a card.</p>
      </div>
    );
  }

  return (
    <div className="pt-2" data-crew-list data-crew-count={model.people.length}>
      <div className="flex items-baseline gap-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> Crew today · {model.people.length}
        </p>
        {model.waiting > 0 && <span className="text-xs font-semibold text-amber-700">· {model.waiting} waiting on you</span>}
      </div>
      {big && (
        <>
          <p className="text-xs text-gray-600 mt-0.5" data-crew-summary>
            Cards {model.cardsFiled} of {model.people.length + 1} filed · {model.openLogs} drill log{model.openLogs === 1 ? '' : 's'} open
            {model.waiting > 0 ? ` · ${model.waiting} waiting on you` : ''}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
              <button
                type="button"
                className={`px-3 py-1.5 ${filter === 'needs' ? 'bg-navy text-white' : 'text-gray-600'}`}
                data-crew-filter="needs"
                onClick={() => setFilter('needs')}
              >
                Needs something
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 border-l border-gray-200 ${filter === 'all' ? 'bg-navy text-white' : 'text-gray-600'}`}
                data-crew-filter="all"
                onClick={() => setFilter('all')}
              >
                All
              </button>
            </div>
            <Input placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" data-crew-search />
          </div>
        </>
      )}
      <div className="mt-1.5 space-y-1.5">
        {rows.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left min-h-[48px] ${
              p.needs ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
            }`}
            data-crew-row={p.name}
            data-crew-needs={p.needs ? '1' : undefined}
            onClick={() => setOpen(p.key)}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">{p.name}{p.onSiteAt ? <span className="text-gray-400 font-normal"> · on site {hhmm(p.onSiteAt)}</span> : null}</span>
              <span className="block text-xs text-gray-600 truncate">{personParts(p)}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-400 py-1">{q ? 'No one by that name.' : 'Nobody needs anything.'}</p>}
      </div>

      {person && (
        <ConsequenceSheet onClose={() => setOpen(null)}>
          <div data-person-sheet={person.name}>
            <h3 className="font-bold text-lg">{person.name}</h3>
            <p className="text-xs text-gray-500 mb-3">Their papers today. Read any of them; edit only what a blaster does.</p>
            {person.checklists.map((c) => (
              <button
                key={c.checklist.id}
                type="button"
                className="w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 mb-2 text-left min-h-[48px]"
                onClick={() => navigate(`/drill-checklist-print/${c.checklist.id}`)}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Rig checklist</span>
                  <span className="block text-sm font-medium">{c.asset}{c.checklist.stopHours != null ? ' · stopped' : ' · filed'}{c.checklist.startingHours != null ? ` · ${c.checklist.startingHours}${c.checklist.stopHours != null ? ` → ${c.checklist.stopHours}` : ''}` : ''}</span>
                </span>
                <span className="text-sm text-gray-500">View ›</span>
              </button>
            ))}
            {person.logs.map((l) => {
              const holes = person.holesByLog.get(l.id) ?? 0;
              const acceptable = l.status === 'complete' && canAct && canDrillLogTransition('complete', 'accepted');
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 mb-2 text-left min-h-[48px] ${acceptable ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
                  data-person-log={l.id}
                  onClick={() => {
                    // Accepting FILES the log (the office copy) — the same
                    // route the review screen uses; S14's shortcut skipped it
                    if (acceptable) navigate(`${drillLogRoute(l)}/submit`);
                    else navigate(`/blast-day/${day.id}/drill-log/${l.id}`);
                  }}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Drill log</span>
                    <span className="block text-sm font-medium">
                      {holes} holes{l.status === 'complete' ? ' · signed complete, waiting on you' : l.status === 'accepted' ? ` · accepted${l.acceptedBy ? ` by ${l.acceptedBy}` : ''}` : ''}
                    </span>
                  </span>
                  <span className={`text-sm ${acceptable ? 'font-semibold text-navy' : 'text-gray-500'}`} data-person-log-action={acceptable ? 'accept' : 'view'}>
                    {acceptable ? 'Accept ›' : 'View ›'}
                  </span>
                </button>
              );
            })}
            <div className="w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 mb-2 min-h-[48px]">
              <span className="flex-1 min-w-0">
                <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Time card</span>
                <span className="block text-sm font-medium">{cardWord(person)}</span>
              </span>
              {!person.card && canAct && person.userId && !person.reminded ? (
                <Button size="sm" data-person-remind onClick={() => void remindForCard(day, person.userId!, person.name)}>
                  Remind
                </Button>
              ) : person.card ? (
                <button type="button" className="text-sm text-gray-500" onClick={() => navigate(`/blast-day/${day.id}?view=daily-report`)}>
                  View ›
                </button>
              ) : person.reminded ? (
                <span className="text-xs text-gray-500">reminded {hhmm(person.reminded.at)}</span>
              ) : null}
            </div>
            <Button variant="outline" className="w-full mt-1" onClick={() => setOpen(null)}>
              Back to the day
            </Button>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}
