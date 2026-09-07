// Sticky bar while rehearsing (Round S6): who you are pretending to be,
// that nothing here is real, one tap for sample data, one tap to end.
import { useState } from 'react';
import { Drama } from 'lucide-react';
import { addSampleJob, endRehearsal, rehearsalRole } from '@/lib/rehearsal';
import { showToast } from '@/components/ui/undo-toast';

export function RehearsalBar() {
  const role = rehearsalRole();
  const [busy, setBusy] = useState<'sample' | 'end' | null>(null);
  if (!role) return null;
  return (
    <div
      className="sticky top-0 z-30 bg-violet-600 text-white px-4 py-1.5 flex items-center gap-2 text-sm shadow-sm"
      data-rehearsal-bar={role}
    >
      <Drama className="h-4 w-4 shrink-0" />
      <span className="font-semibold shrink-0 capitalize">Rehearsing as {role}</span>
      <span className="hidden sm:inline text-violet-100 text-xs truncate">
        — ShotLog Sandbox · nothing here is real; End wipes it
      </span>
      <button
        className="ml-auto shrink-0 rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-0.5 text-xs font-semibold"
        disabled={busy !== null}
        data-rehearsal-sample
        onClick={() => {
          setBusy('sample');
          void addSampleJob()
            .then((r) => showToast(r === 'added' ? 'Added Granite Ridge · Ledgeville Pit · job 26-001 · rig R-101' : 'The sample job is already there'))
            .catch(() => showToast("Couldn't add the sample — are you online?"))
            .finally(() => setBusy(null));
        }}
      >
        {busy === 'sample' ? 'Adding…' : 'Add sample job'}
      </button>
      <button
        className="shrink-0 rounded-md bg-violet-950 text-violet-50 px-2.5 py-0.5 text-xs font-semibold"
        disabled={busy !== null}
        data-rehearsal-end
        onClick={() => {
          setBusy('end');
          void endRehearsal();
        }}
      >
        {busy === 'end' ? 'Ending…' : 'End rehearsal'}
      </button>
    </div>
  );
}
