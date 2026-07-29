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
            <TrimTrack
              duration={duration}
              time={time}
              inPoint={inPoint}
              outPoint={outPoint}
              canEdit={canEdit}
              onSeek={(t) => {
                const v = videoRef.current;
                if (v) v.currentTime = t;
                setTime(t);
              }}
              onSetIn={(t) => setInPoint(+t.toFixed(2))}
              onSetOut={(t) => setOutPoint(+t.toFixed(2))}
            />
          )}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="tabular-nums text-white/70">
              {fmtT(time)}{duration > 0 ? ` / ${fmtT(duration)}` : ''}
            </span>
            {canEdit && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setInPoint(+time.toFixed(2))}>
                  Start here
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setOutPoint(+time.toFixed(2))}>
                  End here
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
            Tap the bar to jump around · drag the orange handles (or use Start/End here) to frame
            the shot · Extract clip cuts that range into a small file the office can watch
            anywhere. The full video stays on{' '}
            {summary.originName ? `${summary.originName}'s` : 'this'} device.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Trimmer track: tap/drag anywhere to scrub; the in/out handles drag with
 * fat touch targets. Times derive from pointer x within the track.
 */
function TrimTrack({
  duration,
  time,
  inPoint,
  outPoint,
  canEdit,
  onSeek,
  onSetIn,
  onSetOut,
}: {
  duration: number;
  time: number;
  inPoint: number | null;
  outPoint: number | null;
  canEdit: boolean;
  onSeek: (t: number) => void;
  onSetIn: (t: number) => void;
  onSetOut: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'in' | 'out' | 'seek' | null>(null);

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * duration;
  };

  const move = (kind: 'in' | 'out' | 'seek', clientX: number) => {
    const t = timeAt(clientX);
    if (kind === 'in') onSetIn(Math.min(t, (outPoint ?? duration) - 0.1));
    else if (kind === 'out') onSetOut(Math.max(t, (inPoint ?? 0) + 0.1));
    else onSeek(t);
  };

  const startDrag = (kind: 'in' | 'out' | 'seek') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(kind);
    move(kind, e.clientX);
  };

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;

  return (
    <div className="px-2 pt-3 pb-1">
      <div
        ref={trackRef}
        className="relative h-3 rounded bg-white/20 cursor-pointer touch-none"
        onPointerDown={startDrag('seek')}
        onPointerMove={(e) => dragging && move(dragging, e.clientX)}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {inPoint !== null && outPoint !== null && (
          <div
            className="absolute h-full bg-safety-orange/70 rounded pointer-events-none"
            style={{ left: pct(inPoint), width: pct(Math.max(0, outPoint - inPoint)) }}
          />
        )}
        {/* playhead */}
        <div
          className="absolute -top-1 h-5 w-0.5 bg-white pointer-events-none"
          style={{ left: pct(time) }}
        />
        {canEdit && inPoint !== null && (
          <div
            className="absolute -top-2.5 h-8 w-8 -ml-4 flex items-center justify-center"
            style={{ left: pct(inPoint) }}
            onPointerDown={startDrag('in')}
          >
            <div className="h-7 w-2.5 rounded bg-safety-orange border border-white/70" />
          </div>
        )}
        {canEdit && outPoint !== null && (
          <div
            className="absolute -top-2.5 h-8 w-8 -ml-4 flex items-center justify-center"
            style={{ left: pct(outPoint) }}
            onPointerDown={startDrag('out')}
          >
            <div className="h-7 w-2.5 rounded bg-safety-orange border border-white/70" />
          </div>
        )}
      </div>
    </div>
  );
}
