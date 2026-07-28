// Full-screen media viewer. Videos get the clip-marking treatment: scrub the
// timeline, set in/out at the playhead, preview just the clip, save marks
// (tiny metadata — syncs everywhere instantly). Physical clip extraction to
// a small synced file is phase 2.
import { useEffect, useRef, useState } from 'react';
import { Scissors, Upload, X } from 'lucide-react';
import { addAttachmentFiles, saveClipMarks, type AttachmentSummary } from '@/lib/attachments';
import { clipExtension, extractClip, pickRecorderType } from '@/lib/clipExtractor';
import { runFileUploader } from '@/lib/fileUploader';
import type { Attachment } from '@/db/schema';
import { Button } from '@/components/ui/button';

function fmtT(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function VideoLightbox({
  summary,
  blob,
  canEdit,
  onClose,
}: {
  summary: AttachmentSummary;
  blob: Blob;
  canEdit: boolean;
  onClose: () => void;
}) {
  const isVideo = summary.mimeType.startsWith('video/');
  // Object URL lives in an effect (NOT a state initializer): StrictMode's
  // mount→cleanup→remount would revoke an initializer-created URL for good.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number>(summary.duration ?? 0);
  const [time, setTime] = useState(0);
  const [inPoint, setInPoint] = useState<number | null>(summary.clipStart ?? null);
  const [outPoint, setOutPoint] = useState<number | null>(summary.clipEnd ?? null);
  const [previewing, setPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractDone, setExtractDone] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Preview mode: stop at the out point
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setTime(v.currentTime);
      if (previewing && outPoint !== null && v.currentTime >= outPoint) {
        v.pause();
        setPreviewing(false);
      }
    };
    const onMeta = () => {
      if (Number.isFinite(v.duration)) setDuration(v.duration);
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onTime); // scrubbing while paused must move the playhead state
    v.addEventListener('loadedmetadata', onMeta);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('seeked', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
    };
  }, [previewing, outPoint]);

  const clipLen = inPoint !== null && outPoint !== null ? Math.max(0, outPoint - inPoint) : null;
  const estBytes =
    clipLen !== null && duration > 0 && summary.size ? (summary.size * clipLen) / duration : null;

  const previewClip = () => {
    const v = videoRef.current;
    if (!v || inPoint === null) return;
    v.currentTime = inPoint;
    setPreviewing(true);
    void v.play();
  };

  const save = async () => {
    if (inPoint === null || outPoint === null || outPoint <= inPoint) return;
    await saveClipMarks(summary.id, +inPoint.toFixed(2), +outPoint.toFixed(2));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Phase-2: physically extract the marked range into a small file that
  // uploads to R2 — the office-visible record of the shot.
  const extract = async () => {
    if (inPoint === null || outPoint === null || outPoint <= inPoint || extracting) return;
    setExtractError(null);
    setExtracting('starting…');
    try {
      await saveClipMarks(summary.id, +inPoint.toFixed(2), +outPoint.toFixed(2));
      videoRef.current?.pause();
      const clip = await extractClip(blob, inPoint, outPoint, (p) =>
        setExtracting(`${Math.floor(p.done)}s / ${Math.ceil(p.total)}s`),
      );
      const type = pickRecorderType() ?? 'video/webm';
      const base = summary.fileName.replace(/\.[A-Za-z0-9]+$/, '') || 'shot';
      const file = new File([clip], `${base}-clip.${clipExtension(type)}`, { type: clip.type });
      await addAttachmentFiles(
        summary.parentId,
        summary.parentType as Attachment['parentType'],
        [file],
        'shot_video',
        { sourceAttachmentId: summary.id },
      );
      void runFileUploader();
      setExtractDone(true);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'extraction failed');
    } finally {
      setExtracting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium truncate flex-1">{summary.fileName}</p>
        <button className="p-2" onClick={onClose} aria-label="Close">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        className="flex-1 min-h-0 flex items-center justify-center px-3"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video ref={videoRef} src={url ?? undefined} controls playsInline className="max-h-full max-w-full" />
        ) : (
          <img src={url ?? undefined} alt={summary.fileName} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      {isVideo && (
        <div className="p-3 space-y-2 text-white" onClick={(e) => e.stopPropagation()}>
          {duration > 0 && (
            <div className="relative h-2 rounded bg-white/20">
              {inPoint !== null && outPoint !== null && (
                <div
                  className="absolute h-full bg-safety-orange/80 rounded"
                  style={{
                    left: `${(inPoint / duration) * 100}%`,
                    width: `${(Math.max(0, outPoint - inPoint) / duration) * 100}%`,
                  }}
                />
              )}
              <div
                className="absolute -top-1 h-4 w-1 bg-white rounded"
                style={{ left: `${Math.min(100, (time / duration) * 100)}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="tabular-nums text-white/70">
              {fmtT(time)}{duration > 0 ? ` / ${fmtT(duration)}` : ''}
            </span>
            {canEdit && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setInPoint(+time.toFixed(2))}>
                  Mark in
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setOutPoint(+time.toFixed(2))}>
                  Mark out
                </Button>
              </>
            )}
            {clipLen !== null && (
              <span className="text-xs text-white/80">
                <Scissors className="inline h-3.5 w-3.5 mr-1" />
                clip {fmtT(inPoint!)}–{fmtT(outPoint!)} · {Math.round(clipLen)}s
                {estBytes ? ` · ~${(estBytes / 1024 / 1024).toFixed(1)} MB` : ''}
              </span>
            )}
            <span className="flex-1" />
            {inPoint !== null && (
              <Button size="sm" variant="secondary" onClick={previewClip}>
                ▶ Preview clip
              </Button>
            )}
            {canEdit && clipLen !== null && clipLen > 0 && (
              <Button size="sm" variant="secondary" onClick={() => void save()}>
                {saved ? 'Saved ✓' : 'Save marks'}
              </Button>
            )}
            {canEdit && clipLen !== null && clipLen > 0 && !summary.sourceAttachmentId && (
              <Button size="sm" variant="safety" disabled={Boolean(extracting)} onClick={() => void extract()}>
                <Upload className="h-4 w-4 mr-1" />
                {extracting
                  ? `Extracting ${extracting}`
                  : extractDone
                    ? 'Clip created ✓'
                    : 'Extract clip'}
              </Button>
            )}
          </div>
          {extractError && <p className="text-xs text-red-300">{extractError}</p>}
          {extractDone && (
            <p className="text-xs text-green-300">
              Clip added to this {summary.parentType === 'shot' ? 'shot' : 'day'} — it uploads and
              syncs like any photo, so the office can watch it.
            </p>
          )}
          <p className="text-[11px] text-white/50">
            The full video stays on {summary.originName ? `${summary.originName}'s` : 'this'} device —
            Extract clip cuts the marked range into a small file the office can watch anywhere.
          </p>
        </div>
      )}
    </div>
  );
}
