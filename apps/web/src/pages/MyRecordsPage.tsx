// Unified recall for every field role: everything YOU filed — blast logs,
// daily reports, drill logs, rig checklists, incidents — chronological and
// searchable, with "filed vN" chips that open the archived office PDF.
// S21: the same manager the office has — the page fills the window, only
// the list scrolls, the preview is a drawer.
import { useRef } from 'react';
import { RecordsManager } from '@/components/records/RecordsManager';
import { useFillHeight } from '@/components/records/useFillHeight';

export function MyRecordsPage() {
  const ref = useRef<HTMLDivElement>(null);
  useFillHeight(ref);
  return (
    <div ref={ref} className="p-3 flex flex-col gap-2 min-h-0" data-records-page>
      <h2 className="text-xl font-bold text-gray-900 shrink-0">My Records</h2>
      <div className="flex-1 min-h-0"><RecordsManager scope="mine" /></div>
    </div>
  );
}
