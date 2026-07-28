// ATF binder export: date range → ZIP of filed PDFs + explosives summary CSV
// + audit-log CSV + a self-verifying manifest (SHA-256 per PDF). Submissions
// are fetched ONE at a time — the archive can grow forever without the
// export ever loading it all into memory.
import { useState } from 'react';
import JSZip from 'jszip';
import { FolderDown, X } from 'lucide-react';
import { db } from '@/db';
import { listSubmissionSummaries } from '@/lib/archive';
import { fetchAuditRange, describeEntry, tableLabel } from '@/lib/audit';
import { toCsv } from '@/lib/csv';
import { getSessionUser } from '@/lib/session';
import { todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildExplosivesCsv(from: string, to: string): Promise<string> {
  const rows: unknown[][] = [
    ['Date', 'Job', 'Product', 'Manufacturer', 'Category', 'Qty', 'Unit', 'Lbs'],
  ];
  const days = (await db.blastDays.toArray()).filter((d) => d.date >= from && d.date <= to);
  const jobs = new Map((await db.jobs.toArray()).map((j) => [j.id, j.name]));
  let totalLbs = 0;
  let totalDets = 0;
  for (const day of days.sort((a, b) => a.date.localeCompare(b.date))) {
    const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
    if (!log) continue;
    const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
    if (!usage) continue;
    const jobName = jobs.get(day.jobId) ?? '';
    for (const p of usage.products) {
      rows.push([day.date, jobName, p.productName, p.manufacturer, p.category, p.quantity, p.unitType, p.totalWeight.toFixed(1)]);
      totalLbs += p.totalWeight;
    }
    for (const d of usage.detonators) {
      rows.push([day.date, jobName, `Detonator: ${d.name} ${d.unitLength}`, '', 'detonator', d.quantity, 'each', '']);
      totalDets += d.quantity;
    }
  }
  rows.push([]);
  rows.push(['TOTAL LBS', totalLbs.toFixed(1)]);
  rows.push(['TOTAL DETONATORS', totalDets]);
  return toCsv(rows);
}

export function BinderExport() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(`${todayISO().slice(0, 8)}01`);
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      const zip = new JSZip();
      const manifest: string[] = [
        `ShotLog ATF binder`,
        `Range: ${from} to ${to}`,
        `Generated: ${new Date().toISOString()} by ${getSessionUser()?.name ?? ''}`,
        '',
        'Filed documents (SHA-256):',
      ];

      // Filed PDFs — one at a time, memory-safe
      const summaries = (await listSubmissionSummaries()).filter(
        (s) => s.date >= from && s.date <= to,
      );
      setStatus(`Packing ${summaries.length} filed document${summaries.length === 1 ? '' : 's'}…`);
      for (const [i, s] of summaries.entries()) {
        setStatus(`Packing PDFs… ${i + 1}/${summaries.length}`);
        const full = await db.submissions.get(s.id);
        if (!full) continue;
        // id suffix: two same-type docs filed the same day would otherwise
        // collide (e.g. two rigs' checklists, both v1)
        const name = `pdfs/${s.type}-${s.date}-v${s.version}-${s.id.slice(0, 8)}.pdf`;
        zip.file(name, full.pdf);
        manifest.push(`${name}  ${await sha256Hex(full.pdf)}`);
      }

      setStatus('Building explosives summary…');
      zip.file('explosives-summary.csv', await buildExplosivesCsv(from, to));

      setStatus('Fetching audit log…');
      try {
        const audit = await fetchAuditRange(from, to);
        const rows: unknown[][] = [['When (UTC)', 'Who', 'Role', 'Document', 'Action', 'Details']];
        for (const e of audit) {
          rows.push([e.at, e.actorName, e.actorRole, tableLabel(e.tableName), e.op, describeEntry(e)]);
        }
        zip.file('audit-log.csv', toCsv(rows));
        manifest.push('', `Audit entries: ${audit.length}`);
      } catch {
        manifest.push('', 'Audit log: UNAVAILABLE (offline at export time)');
      }

      zip.file('manifest.txt', manifest.join('\n'));
      setStatus('Zipping…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shotlog-binder-${from}-to-${to}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus(`Done — ${summaries.length} PDFs packed.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderDown className="h-4 w-4 mr-1" /> Export binder
      </Button>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">ATF binder export</p>
              <Button variant="ghost" size="icon" disabled={busy} onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              One ZIP: every filed PDF in the range, an explosives summary, the change log, and a
              checksum manifest — hand it to the auditor as-is.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            {status && <p className="text-sm text-gray-500">{status}</p>}
            <Button className="w-full" disabled={busy || !from || !to} onClick={() => void build()}>
              {busy ? 'Building…' : 'Build binder'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
