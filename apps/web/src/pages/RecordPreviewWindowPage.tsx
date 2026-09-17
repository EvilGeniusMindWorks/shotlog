// S21 — "Open in a window": the Records preview in its own browser window
// for a second monitor. One filed copy, its versions and its filmstrip.
import { useParams } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { useSubmissionSummaries } from '@/lib/archive';
import { RecordPreview } from '@/components/records/RecordPreview';
import { SUB_TYPE_TO_KIND, type RecRow } from '@/components/records/recRows';

export function RecordPreviewWindowPage() {
  const { id } = useParams<{ id: string }>();
  const subs = useSubmissionSummaries();
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const filed = subs?.find((s) => s.id === id);
  if (!subs) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (!filed) return <div className="p-4 text-sm text-gray-500">This copy is not on this device.</div>;
  const versions = subs.filter((s) => s.sourceId === filed.sourceId && s.type === filed.type).sort((a, b) => b.version - a.version);
  const job = filed.jobId ? jobs.find((j) => j.id === filed.jobId) : undefined;
  const row: RecRow = {
    key: `sub-${filed.id}`,
    kind: SUB_TYPE_TO_KIND[filed.type] ?? 'blast_log',
    date: filed.date,
    title: filed.title,
    sub: '',
    particulars: '',
    facts: { clips: filed.assetCount },
    jobId: filed.jobId,
    jobName: job?.name ?? '—',
    jobNumber: job?.jobNumber,
    customerId: filed.customerId,
    siteId: filed.siteId,
    dayId: filed.blastDayId,
    person: filed.submittedBy,
    status: 'filed',
    statusLabel: `Filed${filed.version > 1 ? ` v${filed.version}` : ''}`,
    statusVariant: 'approved',
    filed: versions.find((v) => v.id === filed.id) ?? filed,
    versions,
  };
  return (
    <div className="h-[100dvh] overflow-y-auto bg-white" data-records-window>
      <RecordPreview row={row} inWindow />
    </div>
  );
}
