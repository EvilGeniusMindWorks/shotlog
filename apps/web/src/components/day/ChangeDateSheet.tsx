// "Change the date" (Round S16): tap the date in the day's header, pick where
// the day belongs, read what moves with it, move. One sheet, two steps.
import { useEffect, useState } from 'react';
import type { BlastDay, Job } from '@/db/schema';
import { canMoveDay, moveDay, movePlan, nearbyDates, whoMayMove, type MovePlan } from '@/lib/dayMove';
import { formatDate } from '@/lib/utils';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/undo-toast';

export function ChangeDateSheet({ day, job, onClose }: { day: BlastDay; job: Job | undefined; onClose: () => void }) {
  const allowed = canMoveDay(day);
  const [pick, setPick] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [moveChecklists, setMoveChecklists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = pick ?? (showCustom && /^\d{4}-\d{2}-\d{2}$/.test(custom) ? custom : null);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    if (!target) return;
    void movePlan(day, target).then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, [target, day.id, day.date]);

  const go = async () => {
    if (!target || !plan || plan.blocks.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await moveDay(day, target, { moveChecklists });
      showToast(`Moved to ${formatDate(target)}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The move did not go through');
      setBusy(false);
    }
  };

  return (
    <ConsequenceSheet onClose={onClose}>
      <div data-change-date>
        <h3 className="font-bold text-lg">Change the date</h3>
        <p className="text-xs text-gray-500 mb-2">
          {job?.name ? `${job.name} · ` : ''}this day is <b>{formatDate(day.date)}</b>. Every paper on it moves with it.
        </p>
        {!allowed && (
          <p className="text-sm text-amber-800 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 mb-2" data-move-denied>
            Only {whoMayMove(day)} can change this day’s date.
          </p>
        )}
        <div className="space-y-2">
          {nearbyDates().map((d) => {
            const on = pick === d.date;
            const same = d.date === day.date;
            return (
              <button
                key={d.key}
                type="button"
                className={`w-full text-left rounded-lg border px-3 py-3 min-h-[52px] text-base ${on ? 'border-safety-orange bg-orange-50 font-semibold' : 'border-gray-200 bg-white font-medium'} ${same ? 'opacity-60' : ''}`}
                data-move-pick={d.key}
                aria-pressed={on}
                disabled={!allowed || same}
                onClick={() => {
                  setShowCustom(false);
                  setPick(d.date);
                }}
              >
                {formatDate(d.date)}
                <span className="block text-xs text-gray-500 font-normal">
                  {d.label}
                  {same ? ' · this day’s date' : ''}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className={`w-full text-left rounded-lg border px-3 py-3 min-h-[52px] text-base ${showCustom ? 'border-safety-orange bg-orange-50 font-semibold' : 'border-gray-200 bg-white font-medium'}`}
            data-move-pick="custom"
            disabled={!allowed}
            onClick={() => {
              setPick(null);
              setShowCustom(true);
            }}
          >
            Pick a date…
          </button>
          {showCustom && (
            <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} data-move-date-input className="min-h-[48px]" />
          )}
        </div>

        {target && plan && (
          <div className="mt-3" data-move-plan data-move-blocked={plan.blocks.length > 0 ? '1' : '0'}>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 mb-1">What moves to {formatDate(target)}</p>
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 text-sm">
              {plan.blocks.map((b) => (
                <p key={b} className="px-3 py-2 text-red-800 font-medium" data-move-block>
                  ⊗ {b}
                </p>
              ))}
              {plan.rows.map((r, i) => (
                <p key={i} className={`px-3 py-2 ${r.tone === 'warn' ? 'text-amber-800' : 'text-gray-800'}`} data-move-row>
                  {r.tone === 'warn' ? '△' : '✓'} {r.label}
                </p>
              ))}
              {plan.checklists.length > 0 && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-gray-800"
                  data-move-checklists={moveChecklists ? '1' : '0'}
                  onClick={() => setMoveChecklists(!moveChecklists)}
                >
                  {moveChecklists ? '✓' : '○'} Rig checklist{plan.checklists.length === 1 ? '' : 's'} at this job ({plan.checklists.map((c) => c.drillerName).join(', ')}) —{' '}
                  <b>{moveChecklists ? 'move with the day' : `stay on ${formatDate(day.date)}`}</b>
                </button>
              )}
              {plan.target && plan.targetEmpty && (
                <p className="px-3 py-2 text-gray-600" data-move-absorb>
                  ✓ The empty day already on {formatDate(target)} is absorbed
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-800 mt-2" data-move-error>
                {error}
              </p>
            )}
            <Button className="w-full mt-3 min-h-[48px]" disabled={!allowed || busy || plan.blocks.length > 0} data-move-go onClick={() => void go()}>
              {busy ? 'Moving…' : `Move to ${formatDate(target)}`}
            </Button>
          </div>
        )}
        <Button variant="outline" className="w-full mt-2" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </ConsequenceSheet>
  );
}
