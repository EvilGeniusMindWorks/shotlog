// S21 — Print pack: the day's papers in one go. The browser prints one PDF
// at a time, so each filed copy opens in its own tab (six at a time, or a
// popup blocker eats the batch silently); the photos print from this page,
// captioned the way the filmstrip captions them (the context, who, when).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';
import { DOC_KIND_LABEL } from '@/lib/docRows';
import { getSubmissionAssetBlob, listSubmissionAssets, openSubmissionPdfById } from '@/lib/archive';
import { showToast } from '@/components/ui/undo-toast';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useRecRows } from '@/components/records/recRows';
import { dayPapers } from './ApprovalReviewPage';

interface Photo {
  subId: string;
  id: string;
  paper: string;
  hangsOn: string;
  by: string;
  fileName: string;
  url: string | null;
}

export function ApprovalPrintPackPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const day = useLiveQuery(() => (dayId ? db.blastDays.get(dayId) : undefined), [dayId]);
  const job = useLiveQuery(() => (day?.jobId ? db.jobs.get(day.jobId) : undefined), [day?.jobId]);
  const rows = useRecRows('company');
  const papers = useMemo(() => (rows && day ? dayPapers(rows, day) : []), [rows, day]);
  const filed = papers.filter((p) => p.filed);
  const [photos, setPhotos] = useState<Photo[] | undefined>(undefined);
  const filedIds = filed.map((p) => p.filed!.id).join(',');
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const out: Photo[] = [];
      for (const p of filed) {
        const listed = await listSubmissionAssets(p.filed!.id);
        for (const a of listed?.assets ?? []) {
          if (!a.mimeType.startsWith('image/')) continue;
          const blob = a.reachable ? await getSubmissionAssetBlob(p.filed!.id, a.id) : null;
          if (!alive) return;
          const url = blob ? URL.createObjectURL(blob) : null;
          if (url) urls.push(url);
          out.push({ subId: p.filed!.id, id: a.id, paper: `${DOC_KIND_LABEL[p.kind]}${p.head ? ` · ${p.head}` : ''}`, hangsOn: a.context?.hangsOn ?? '', by: [a.context?.capturedBy, a.context?.capturedAt ? new Date(a.context.capturedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''].filter(Boolean).join(' · '), fileName: a.fileName, url });
        }
      }
      if (alive) setPhotos(out);
    })().catch(() => { if (alive) setPhotos([]); });
    return () => { alive = false; for (const u of urls) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filedIds]);

  if (!dayId) return null;
  if (day === undefined || rows === undefined) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (day === null) return <div className="p-4 text-sm text-gray-500">This day is not on this device.</div>;
  const jobLabel = `${job?.jobNumber ? `${job.jobNumber} ` : ''}${job?.name ?? 'the job'}`;
  const openAll = () => {
    const batch = filed.slice(0, 6);
    for (const p of batch) openSubmissionPdfById(p.filed!.id);
    if (filed.length > batch.length) showToast(`Opened the first ${batch.length} — open the rest from the list.`);
  };

  return (
    <div data-print-pack={dayId}>
      <div className="print:hidden">
        <ScreenHeader parent={{ to: `/admin/approvals/${dayId}`, label: 'Review' }} title={`Print pack · ${jobLabel} · ${formatDate(day.date)}`} subtitle={`${filed.length} filed paper${filed.length === 1 ? '' : 's'}${photos ? ` · ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}`} maxWidth="max-w-4xl" />
      </div>
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <section className="print:hidden rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm flex-1">The papers · each PDF opens in its own tab, print from the viewer</p>
            <Button size="sm" disabled={filed.length === 0} onClick={openAll} data-print-pack-open-all><ExternalLink className="h-4 w-4 mr-1" /> Open all PDFs{filed.length > 6 ? ' (six at a time)' : ''}</Button>
          </div>
          <div className="divide-y divide-gray-100">
            {papers.map((p) => (
              <div key={p.key} className="py-2 flex items-center gap-2" data-print-pack-paper={p.key}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{DOC_KIND_LABEL[p.kind]}{p.head ? <span className="text-gray-500"> · {p.head}</span> : null}</p>
                  <p className="text-xs text-gray-400">{p.particulars}{p.person ? ` · ${p.person}` : ''}{p.filed ? ` · filed v${p.filed.version}` : ' · no filed copy'}</p>
                </div>
                {p.filed ? (
                  <Button size="sm" variant="outline" onClick={() => openSubmissionPdfById(p.filed!.id)}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open PDF</Button>
                ) : (
                  <span className="text-xs text-gray-400">not filed</span>
                )}
              </div>
            ))}
            {papers.length === 0 && <p className="text-sm text-gray-400 py-2">No papers on this day.</p>}
          </div>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 print:border-0 print:p-0" data-print-pack-photos={photos?.length ?? 0}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm flex-1">Photos · {jobLabel} · {formatDate(day.date)}{photos ? ` · ${photos.length}` : ''}</p>
            <Button size="sm" variant="outline" className="print:hidden" disabled={!photos || photos.length === 0} onClick={() => window.print()} data-print-pack-print-photos><Printer className="h-4 w-4 mr-1" /> Print the photos</Button>
          </div>
          {photos === undefined && <p className="text-xs text-gray-400">Reading the attachments…</p>}
          {photos && photos.length === 0 && <p className="text-xs text-gray-400">No photos on the filed copies.</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 print:grid-cols-2">
            {(photos ?? []).map((ph) => (
              <figure key={`${ph.subId}-${ph.id}`} className="break-inside-avoid rounded-lg border border-gray-200 overflow-hidden" data-print-pack-photo={ph.id}>
                <div className="bg-gray-100 h-44 flex items-center justify-center print:h-56">
                  {ph.url ? <img src={ph.url} alt={ph.fileName} className="h-full w-full object-contain" /> : <span className="text-xs text-gray-400 px-3 text-center">not reachable from this device</span>}
                </div>
                <figcaption className="p-2 text-[11px] leading-snug">
                  <p className="font-medium">{ph.hangsOn || ph.paper}</p>
                  <p className="text-gray-500">{ph.paper}{ph.by ? ` · ${ph.by}` : ''}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
