// "Mark asked for your time card" (Round S14): one line on the home per
// open reminder. Goes away on its own once a filed card exists for that
// job and date; Dismiss closes it by hand.
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { dismissReminder, useMyReminders } from '@/lib/dayHub';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ReminderCard() {
  const navigate = useNavigate();
  const rows = useMyReminders();
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2" data-reminders>
      {rows.map(({ reminder: r, jobName }) => (
        <div key={r.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-3" data-reminder={r.id}>
          <div className="flex-1 min-w-0">
            {r.what === 'moved' || r.what === 'sentback' ? (
              <p className="font-bold text-amber-900" data-reminder-moved data-reminder-kind={r.what}>{r.fromName || 'Your blaster'} {r.text || (r.what === 'sentback' ? 'sent your drill log back' : 'moved this day to another date')}</p>
            ) : (
              <p className="font-bold text-amber-900">{r.fromName || 'Your blaster'} asked for your time card</p>
            )}
            <p className="text-sm text-amber-900/80">{jobName} · {formatDate(r.date)}</p>
            <Button size="sm" className="mt-2" data-reminder-open onClick={() => navigate(`/blast-day/${r.blastDayId}`)}>
              {r.what === 'timecard' ? 'Open my card' : 'Open the day'}
            </Button>
          </div>
          <button type="button" className="h-8 w-8 rounded-lg flex items-center justify-center text-amber-800 hover:bg-amber-100" aria-label="Dismiss" data-reminder-dismiss onClick={() => void dismissReminder(r.id)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
