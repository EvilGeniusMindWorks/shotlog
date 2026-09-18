// S23 push 2 (Matthew's v3 item 5, d4 = all three doors, d5 = one pattern one
// shot): the job's drilled patterns as a list to pick from — a drilled and
// accepted pattern makes a shot; one not accepted yet, still drilling, sent
// or draft is listed but cannot be picked, with the reason; "Drilled by
// others" makes a blank shot. Used by Add shot (many at once → "Make N
// shots") and by a shot's drilling card (one → lay it onto this shot).
import { useState } from 'react';
import { useLiveQuery } from '@/db';
import { shotCandidates, type ShotCandidate } from '@/hooks/useDrillPlans';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';

export function PatternPickSheet({
  jobId,
  many,
  allowBlank,
  title,
  onPick,
  onClose,
}: {
  jobId: string;
  /** several patterns at once (Add shot) or exactly one (this shot) */
  many: boolean;
  /** offer "Drilled by others — a blank shot" */
  allowBlank: boolean;
  title: string;
  onPick: (planIds: string[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const candidates = useLiveQuery(() => shotCandidates(jobId), [jobId]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (c: ShotCandidate) => {
    if (!c.ready) return;
    setPicked((prev) => {
      const next = new Set(many ? prev : []);
      if (next.has(c.plan.id)) next.delete(c.plan.id);
      else next.add(c.plan.id);
      return next;
    });
  };
  const go = async (ids: string[]) => {
    setBusy(true);
    try {
      await onPick(ids);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConsequenceSheet onClose={onClose}>
      <div data-pattern-pick-sheet>
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-xs text-gray-500 mb-2">One pattern, one shot. A pattern whose drill log is not accepted yet waits until it is.</p>
        {candidates === undefined && <p className="text-sm text-gray-400 py-2">Loading the job's patterns…</p>}
        <div className="space-y-1.5">
          {(candidates ?? []).map((c) => {
            const on = picked.has(c.plan.id);
            return (
              <button
                key={c.plan.id}
                type="button"
                disabled={!c.ready}
                aria-pressed={on}
                className={`w-full text-left rounded-lg border px-3 py-2.5 min-h-[52px] ${!c.ready ? 'border-gray-100 bg-gray-50 opacity-70' : on ? 'border-safety-orange bg-orange-50' : 'border-gray-200 bg-white'}`}
                data-pattern-pick={c.plan.id}
                data-pattern-pick-ready={c.ready ? '1' : '0'}
                onClick={() => toggle(c)}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-5 w-5 rounded-full border-2 shrink-0 ${on ? 'border-safety-orange bg-safety-orange' : 'border-gray-300 bg-white'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-sm truncate">
                      {c.plan.name} · {c.progress.planned} holes
                    </span>
                    <span className={`block text-xs ${c.ready ? 'text-green-700' : 'text-amber-800'}`}>{c.why}</span>
                  </span>
                </span>
              </button>
            );
          })}
          {candidates !== undefined && candidates.length === 0 && (
            <p className="text-sm text-gray-400 py-1" data-pattern-pick-none>No pattern on this job yet — plan the drilling from the + or the day's Drill plan tile.</p>
          )}
        </div>
        <Button className="w-full mt-3 min-h-[48px]" disabled={picked.size === 0 || busy} data-pattern-pick-go onClick={() => void go([...picked])}>
          {busy ? 'Working…' : many ? (picked.size > 1 ? `Make ${picked.size} shots` : 'Make the shot') : 'Use this pattern'}
        </Button>
        {allowBlank && (
          <Button variant="outline" className="w-full mt-2 min-h-[44px]" disabled={busy} data-pattern-pick-blank onClick={() => void go([])}>
            Drilled by others — a blank shot
          </Button>
        )}
        <Button variant="ghost" className="w-full mt-1" onClick={onClose}>Cancel</Button>
      </div>
    </ConsequenceSheet>
  );
}
