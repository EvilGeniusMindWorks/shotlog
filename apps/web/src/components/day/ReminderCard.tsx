// "Mark asked for your time card" (Round S14): one line on the home per
// open reminder. Goes away on its own once a filed card exists for that
// job and date (resolved on read since S24 — the list never writes);
// the × closes it by hand, one write, and the line hides at once even if
// the write is still on its way.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { dismissReminder, useMyReminders } from '@/lib/dayHub';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ReminderCard() {
  const navigate = useNavigate();
  const rows = useMyReminders();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const shown = rows.filter(({ reminder }) => !closed.has(reminder.id));
  if (shown.length === 0) return null;
  const close = (id: string) => {
    if (closed.has(id)) return;
    setClosed((prev) => new Set(prev).add(id));
    void dismissReminder(id);
  };
  return (
    <div className="space-y-2" data-reminders>
      {shown.map(({ reminder: r, jobName }) => (
        <div key={r.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3" data-reminder={r.id}>
          <div className="flex-1 min-w-0">
            {r.what === 'moved' ? (
              <p className="font-bold text-amber-900" data-reminder-moved data-reminder-kind={r.what}>{r.fromName || 'Your blaster'} {r.text || 'moved this day to another date'}</p>
            ) : (
              <p className="font-bold text-amber-900" data-reminder-kind={r.what}>{r.fromName || 'Your blaster'} asked for your time card</p>
            )}
            <p className="text-sm text-amber-900/80">{jobName} · {formatDate(r.date)}</p>
            <Button size="sm" className="mt-2" data-reminder-open onClick={() => navigate(`/blast-day/${r.blastDayId}`)}>
              {r.what === 'timecard' ? 'Open my card' : 'Open the day'}
            </Button>
          </div>
          <button type="button" className="h-8 w-8 rounded-lg flex items-center justify-center text-amber-800 hover:bg-amber-100" aria-label="Dismiss" data-reminder-dismiss onClick={() => close(r.id)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
