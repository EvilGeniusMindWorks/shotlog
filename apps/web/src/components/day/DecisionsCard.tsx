// "Needs your decision" (Round S13): a card fact I set while offline lost
// to someone who set the same fact first. Both values, who set each, one
// tap. "Use theirs" closes it; "Use mine" re-sends my value over theirs
// (they then see the yellow reconfirm line). Nothing shared is ever
// overwritten silently.
import { CARD_PATH_LABEL } from '@shotlog/shared';
import { db, useLiveQuery } from '@/db';
import type { BlastDay, Job } from '@/db/schema';
import { getJobView } from '@/lib/jobContext';
import { hhmm, resolveEdit, useHeldEdits } from '@/lib/dayCard';
import { cardValueLabel } from '@/lib/cardOptions';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function DecisionsCard() {
  const held = useHeldEdits();
  const key = held.map((e) => e.id).join(',');
  const context = useLiveQuery(async () => {
    const out = new Map<string, { day: BlastDay; job: Job | undefined }>();
    for (const id of new Set(held.map((e) => e.blastDayId))) {
      const day = await db.blastDays.get(id);
      if (day) out.set(id, { day, job: await getJobView(day.jobId) });
    }
    return out;
  }, [key]);
  if (held.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" data-decisions-card>
      <p className="font-bold text-amber-900">Needs your decision</p>
      <p className="text-xs text-amber-900/80">
        Someone set the same detail first while you were offline — pick which one stands.
      </p>
      <div className="mt-2 space-y-2">
        {held.map((e) => {
          const ctx = context?.get(e.blastDayId);
          return (
            <div key={e.id} className="rounded-lg bg-white border border-amber-200 p-2.5" data-decision={e.path}>
              <p className="text-xs text-gray-500">
                {ctx?.job?.name ?? 'Job'} · {ctx ? formatDate(ctx.day.date) : ''}
              </p>
              <p className="text-sm font-semibold text-gray-900">{CARD_PATH_LABEL[e.path]}</p>
              <p className="text-sm text-gray-700">
                {e.current?.byName || 'Someone'} set <b>{cardValueLabel(e.path, e.current?.value)}</b>
                {e.current?.at ? ` at ${hhmm(e.current.at)}` : ''}
              </p>
              <p className="text-sm text-gray-700">
                You set <b>{cardValueLabel(e.path, e.value)}</b> at {hhmm(e.at)}
              </p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="secondary" data-use-theirs onClick={() => void resolveEdit(e, 'theirs')}>
                  Use theirs
                </Button>
                <Button size="sm" data-use-mine onClick={() => void resolveEdit(e, 'mine')}>
                  Use mine
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
