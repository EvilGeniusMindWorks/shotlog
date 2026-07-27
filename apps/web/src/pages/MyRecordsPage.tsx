// Unified recall for every field role: everything YOU filed — blast logs,
// daily reports, drill logs, rig checklists, incidents — chronological and
// searchable, with "filed vN" chips that open the archived office PDF.
import { useLiveQuery } from '@/db';
import { getSessionUser } from '@/lib/session';
import { buildDocRows } from '@/lib/docRows';
import { DocList } from '@/components/records/DocList';

export function MyRecordsPage() {
  const me = getSessionUser();
  const rows = useLiveQuery(
    () =>
      buildDocRows({
        scope: 'mine',
        meId: me?.id,
        meName: me?.name,
        role: me?.role ?? 'blaster',
      }),
    [me?.id, me?.role],
  );

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Records</h2>
      <DocList rows={rows} />
    </div>
  );
}
