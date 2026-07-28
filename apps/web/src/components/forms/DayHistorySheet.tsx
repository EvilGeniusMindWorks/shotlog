// The day's full change history: gathers every record id belonging to this
// work day from the local db, then asks the server's append-only audit trail
// for their timeline. Online-only (the trail lives server-side on purpose).
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { db } from '@/db';
import { fetchRecordAudit, type AuditEntryView } from '@/lib/audit';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { AuditRow } from '@/components/records/AuditLens';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/skeleton';

async function collectDayRecordIds(blastDayId: string): Promise<string[]> {
  const ids = [blastDayId];
  const log = await db.blastLogs.where('blastDayId').equals(blastDayId).first();
  const report = await db.dailyReports.where('blastDayId').equals(blastDayId).first();
  if (log) {
    ids.push(log.id);
    const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
    if (usage) ids.push(usage.id);
    const shots = await db.shots.where('blastLogId').equals(log.id).toArray();
    for (const s of shots) {
      ids.push(s.id);
      ids.push(...(await db.seismoReadings.where('shotId').equals(s.id).toArray()).map((r) => r.id));
      ids.push(...(await db.typicalColumns.where('shotId').equals(s.id).toArray()).map((c) => c.id));
    }
  }
  if (report) {
    ids.push(report.id);
    ids.push(...(await db.workForceEntries.where('dailyReportId').equals(report.id).toArray()).map((r) => r.id));
    ids.push(...(await db.equipmentEntries.where('dailyReportId').equals(report.id).toArray()).map((r) => r.id));
    ids.push(...(await db.materialEntries.where('dailyReportId').equals(report.id).toArray()).map((r) => r.id));
    ids.push(...(await db.subcontractorEntries.where('dailyReportId').equals(report.id).toArray()).map((r) => r.id));
  }
  const drillLogs = await db.drillLogs.filter((l) => l.blastDayId === blastDayId).toArray();
  for (const l of drillLogs) {
    ids.push(l.id);
    ids.push(...(await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()).map((h) => h.id));
  }
  ids.push(...(await db.attachments.filter((a) => ids.includes(a.parentId)).toArray()).map((a) => a.id));
  ids.push(...(await db.submissions.filter((s) => s.blastDayId === blastDayId).toArray()).map((s) => s.id));
  return [...new Set(ids)].slice(0, 300);
}

export function DayHistorySheet({
  blastDayId,
  onClose,
}: {
  blastDayId: string;
  onClose: () => void;
}) {
  const online = useOnlineStatus();
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    void (async () => {
      try {
        const ids = await collectDayRecordIds(blastDayId);
        setEntries(await fetchRecordAudit(ids));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'history fetch failed');
      }
    })();
  }, [blastDayId, online]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[85vh] overflow-y-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">Change history</p>
            <p className="text-xs text-gray-400">
              Every change to this day and its documents, from the server's append-only trail.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        {!online && (
          <p className="text-sm text-gray-500">Connect to view history — it lives on the server.</p>
        )}
        {error && <p className="text-sm text-violation">{error}</p>}
        {online && !error && entries === null && <ListSkeleton rows={4} />}
        {entries !== null && (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} />
            ))}
            {entries.length === 0 && (
              <p className="p-4 text-sm text-gray-400">
                No history yet — entries appear as changes sync to the server.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
