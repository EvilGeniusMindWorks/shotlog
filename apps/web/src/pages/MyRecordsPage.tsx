// Unified recall for every field role: everything YOU filed — blast logs,
// daily reports, drill logs, rig checklists, incidents — chronological and
// searchable, with "filed vN" chips that open the archived office PDF.
import { RecordsManager } from '@/components/records/RecordsManager';

export function MyRecordsPage() {
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-3">
      <h2 className="text-xl font-bold text-gray-900">My Records</h2>
      <RecordsManager scope="mine" />
    </div>
  );
}
