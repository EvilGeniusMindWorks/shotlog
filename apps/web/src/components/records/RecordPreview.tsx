// S21 — the preview: the filed PDF, who filed it, the version chain, the
// integrity line, and under it the filmstrip of attachments with their
// context. Rendered inside the Records drawer (a tap on a row), in the
// phone's sheet, and in its own browser window (Open in a window — a second
// monitor, as Matthew asked).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileDown, X, AppWindow } from 'lucide-react';
import { db } from '@/db';
import { DOC_KIND_LABEL } from '@/lib/docRows';
import {
  attachmentContext,
  downloadSubmissionPdfById,
  getSubmissionAssetBlob,
  getSubmissionPdfBlob,
  listSubmissionAssets,
  openSubmissionPdfById,
} from '@/lib/archive';
import { getAttachmentBlob, listAttachmentSummaries } from '@/lib/attachments';
import { cn, formatDate } from '@/lib/utils';
import { useFeedbackPaper } from '@/lib/feedbackPaper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttachmentStrip, type StripItem } from './AttachmentStrip';
import type { RecRow } from './recRows';

const pdfName = (s: { type: string; date: string; version: number; id: string }) => `${s.type}-${s.date}-v${s.version}-${s.id.slice(0, 8)}.pdf`;
const fmtBytes = (n?: number) => (n === undefined ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** The attachments a row shows: the filed copy's frozen assets, else the live paper's */
function useStripItems(row: RecRow): StripItem[] | undefined {
  const [items, setItems] = useState<StripItem[] | undefined>(undefined);
  const filedId = row.filed?.id;
  useEffect(() => {
    let alive = true;
    setItems(undefined);
    (async () => {
      if (filedId) {
        const listed = await listSubmissionAssets(filedId);
        if (!alive) return;
        const out: StripItem[] = (listed?.assets ?? []).map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          kind: a.context?.kind,
          hangsOn: a.context?.hangsOn,
          capturedBy: a.context?.capturedBy,
          capturedAt: a.context?.capturedAt,
          size: a.size,
          load: a.reachable ? () => getSubmissionAssetBlob(filedId, a.id) : undefined,
        }));
        for (const [i, v] of (listed?.skippedVideos ?? []).entries()) {
          out.push({ id: `video-${i}`, fileName: v.split(' · ')[0] ?? v, mimeType: 'video/*', kind: 'shot_video', hangsOn: 'Shot video', clipNote: v.split(' · ').slice(1).join(' · ') || undefined });
        }
        setItems(out);
        return;
      }
      // live paper: what hangs on it right now
      const parents: string[] = [];
      const sourceId = row.key.replace(/^[a-z]+-/, '');
      if (row.kind === 'blast_log') {
        parents.push(sourceId);
        const shots = await db.shots.where('blastLogId').equals(sourceId).toArray();
        for (const s of shots) {
          parents.push(s.id);
          for (const r of await db.seismoReadings.where('shotId').equals(s.id).toArray()) parents.push(r.id);
        }
      } else if (row.kind === 'daily_report') {
        if (row.dayId) {
          parents.push(row.dayId);
          const report = await db.dailyReports.where('blastDayId').equals(row.dayId).first();
          if (report) parents.push(report.id);
        }
      } else {
        parents.push(sourceId);
      }
      const summaries = await listAttachmentSummaries(parents);
      if (!alive) return;
      const out: StripItem[] = [];
      for (const s of summaries) {
        const ctx = await attachmentContext({ parentType: s.parentType as never, parentId: s.parentId, kind: s.kind, originName: s.originName, createdAt: s.createdAt });
        out.push({
          id: s.id,
          fileName: s.fileName,
          mimeType: s.mimeType,
          kind: s.kind,
          hangsOn: ctx?.hangsOn,
          capturedBy: ctx?.capturedBy,
          capturedAt: ctx?.capturedAt,
          size: s.size,
          thumb: s.thumb,
          clipNote: s.mimeType.startsWith('video/') && s.localOnly && s.originName ? `full video on ${s.originName}'s device` : undefined,
          load: () => getAttachmentBlob(s),
        });
      }
      if (alive) setItems(out);
    })().catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [filedId, row.key, row.kind, row.dayId]);
  return items;
}

export function openPreviewWindow(submissionId: string): void {
  window.open(`/records/preview/${submissionId}`, `shotlog-preview-${submissionId}`, 'popup=yes,width=980,height=1100');
}

export function RecordPreview({ row, onClose, inWindow, compact }: { row: RecRow; onClose?: () => void; inWindow?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const filed = row.filed;
  const items = useStripItems(row);
  // S18: a report sent while this copy is open names it — a picture of the PDF viewer comes out blank
  useFeedbackPaper(filed ? { label: `${DOC_KIND_LABEL[row.kind]} · ${row.title} · ${formatDate(row.date)} · office copy v${filed.version}`, kind: String(row.kind), submissionId: filed.id } : null);
  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    setUrl(null);
    if (!filed) {
      setState('ready');
      return;
    }
    setState('loading');
    void getSubmissionPdfBlob(filed.id).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState('missing');
        return;
      }
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
      setState('ready');
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [filed?.id]);

  const stillOnDevice = useMemo(() => (items ?? []).filter((i) => !i.load && !i.mimeType.startsWith('video/') && !i.clipNote).length, [items]);

  return (
    <div className={cn('flex flex-col min-h-0', inWindow ? 'h-full' : '')} data-records-preview data-records-preview-for={row.key}>
      <div className="flex items-start justify-between gap-2 p-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{DOC_KIND_LABEL[row.kind]}{row.head ? ` · ${row.head}` : ''}</p>
          <p className="font-semibold text-sm leading-snug">{row.title}</p>
          <p className="text-xs text-gray-400">{formatDate(row.date)} · {row.jobName}{row.person ? ` · ${row.person}` : ''}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {filed && !inWindow && (
            <button className="h-8 px-2 rounded-md text-xs text-gray-600 hover:bg-gray-100 flex items-center gap-1" onClick={() => openPreviewWindow(filed.id)} title="Open the preview in its own window" data-records-open-window>
              <AppWindow className="h-4 w-4" /> <span className="hidden sm:inline">Open in a window</span>
            </button>
          )}
          {onClose && (
            <button className="p-1 text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close preview" data-records-close>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className={cn('bg-gray-100 flex items-center justify-center shrink-0', compact ? 'h-[50vh]' : inWindow ? 'h-[62vh]' : 'h-[56vh]')}>
        {filed ? (
          state === 'loading' ? (
            <p className="text-xs text-gray-400">Loading the filed PDF…</p>
          ) : state === 'missing' ? (
            <p className="text-xs text-gray-500 px-4 text-center">
              The PDF is not reachable from this device yet — it is still on the device that filed it, or needs signal to fetch.
            </p>
          ) : (
            <iframe title="Filed PDF" src={`${url}#toolbar=0&view=FitH`} className="w-full h-full bg-white" data-records-pdf />
          )
        ) : (
          <div className="p-4 text-sm text-gray-600 space-y-1 w-full">
            <p className="font-medium">{row.statusLabel} — no filed copy yet.</p>
            <p className="text-xs text-gray-500">{row.particulars || row.sub}</p>
            <p className="text-xs text-gray-400">Live records preview as a summary; the PDF appears here once the paper is filed.</p>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
          {row.facts.approvedBy && <span className="text-gray-500" data-records-approved-by>Approved by {row.facts.approvedBy}{row.facts.approvedAt ? ` · ${new Date(row.facts.approvedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span>}
        </div>
        {filed && (
          <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1">
            <dt className="text-gray-400">Filed by</dt>
            <dd className="text-gray-700">{filed.submittedBy} · {new Date(filed.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            <dt className="text-gray-400">Versions</dt>
            <dd className="text-gray-700">
              {row.versions.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ' · '}
                  <button className={cn('underline', v.id === filed.id && 'font-semibold')} onClick={() => openSubmissionPdfById(v.id)}>
                    v{v.version}
                  </button>
                  {v.id === filed.id ? ' (this)' : ' superseded'}
                </span>
              ))}
            </dd>
            <dt className="text-gray-400">Integrity</dt>
            <dd className="text-gray-700 font-mono break-all">
              {filed.pdfSha256 ? `sha256 ${filed.pdfSha256.slice(0, 8)}…${filed.pdfSha256.slice(-6)}` : 'no hash recorded'}
              {filed.pdfSize ? ` · ${fmtBytes(filed.pdfSize)}` : ''}
              {filed.storageStatus === 'stored' ? ' · in R2' : filed.storageStatus === 'device' ? ' · on the filing device' : ''}
              {stillOnDevice > 0 ? ` · ${stillOnDevice} of ${items?.length ?? 0} photo${(items?.length ?? 0) === 1 ? '' : 's'} still on ${filed.submittedBy}'s device` : ''}
            </dd>
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          {filed && (
            <>
              <Button size="sm" variant="outline" onClick={() => openSubmissionPdfById(filed.id)} data-records-open-pdf>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => void downloadSubmissionPdfById(filed.id, pdfName(filed))}>
                <FileDown className="h-3.5 w-3.5 mr-1" /> Download{filed.pdfSize ? ` · ${fmtBytes(filed.pdfSize)}` : ''}
              </Button>
            </>
          )}
          {row.to && !inWindow && (
            <Button size="sm" variant={filed ? 'ghost' : 'default'} onClick={() => navigate(row.to!)} data-records-open-live>
              Open live record
            </Button>
          )}
        </div>
        <AttachmentStrip
          items={items ?? []}
          title={filed ? 'Attachments on this copy' : 'Attachments on the live paper'}
          emptyText={items === undefined ? 'Reading the attachments…' : filed ? 'No attachments on this copy.' : 'Nothing attached yet.'}
        />
      </div>
    </div>
  );
}
