// Typed attachments on any parent record. Tiles render from blob-free
// summaries (thumbs inline; binaries fetched on demand — local media store →
// legacy inline → R2 presigned download). Capture goes through the
// addAttachmentFiles pipeline (compression, thumbs, checksum, local-first
// storage) and the background uploader lands eligible binaries in R2.
import { useMemo, useRef, useState } from 'react';
import { Camera, CloudUpload, FileText, Play, Plus, Scissors, Smartphone, X } from 'lucide-react';
import { useLiveQuery, db, deleteWithTombstone } from '@/db';
import {
  addAttachmentFiles,
  getAttachmentBlob,
  kindLabel,
  mergeKinds,
  useAttachmentSummaries,
  type AttachmentSummary,
} from '@/lib/attachments';
import { runFileUploader } from '@/lib/fileUploader';
import { deleteLocalMedia } from '@/lib/localMedia';
import { canPerformOp, type Role } from '@shotlog/shared';
import { getSessionUser } from '@/lib/session';
import type { Attachment } from '@/db/schema';
import { SectionCard } from '@/components/ui/section-card';
import { VideoLightbox } from '@/components/media/VideoLightbox';
import { cn } from '@/lib/utils';

export function AttachmentsCard({
  parentId,
  parentType,
  title = 'Attachments',
  defaultKind,
}: {
  parentId: string;
  parentType: Attachment['parentType'];
  title?: string;
  defaultKind?: string;
}) {
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  const canEdit = canPerformOp('attachments', 'PUT', role);
  const parentIds = useMemo(() => [parentId], [parentId]);
  const attachments = useAttachmentSummaries(parentIds) ?? [];
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const kinds = mergeKinds(company?.attachmentTypes);
  const [kind, setKind] = useState(defaultKind ?? 'photo');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<{ summary: AttachmentSummary; blob: Blob } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await addAttachmentFiles(parentId, parentType, files, kind);
    void runFileUploader();
  };

  const open = async (s: AttachmentSummary) => {
    if (s.mimeType === 'application/pdf') {
      // PDFs keep the new-tab flow (Safari-safe: window opens synchronously)
      const w = window.open('', '_blank');
      const blob = await getAttachmentBlob(s);
      if (!blob) return w?.close();
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      return;
    }
    setOpening(s.id);
    try {
      const blob = await getAttachmentBlob(s);
      if (blob) setLightbox({ summary: s, blob });
      else alert(s.localOnly ? `The full file is on ${s.originName ?? 'another'}'s device.` : 'File unavailable — check your connection.');
    } finally {
      setOpening(null);
    }
  };

  return (
    // key: defaultOpen is decided at mount, which predates hydration — remount
    // when content first arrives so a card with files opens itself
    <SectionCard
      key={attachments.length > 0 ? 'has-files' : 'empty'}
      title={title}
      summary={attachments.length > 0 ? `${attachments.length} file${attachments.length > 1 ? 's' : ''}` : undefined}
      defaultOpen={attachments.length > 0}
    >
      <div className="space-y-2">
        {canEdit && (
          <div className="flex gap-1.5 flex-wrap">
            {kinds.map((k) => (
              <button
                key={k.value}
                className={cn(
                  'min-h-[32px] px-2.5 rounded-full border text-xs font-medium',
                  kind === k.value
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-600 border-gray-300',
                )}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {attachments.map((s) => (
            <AttachmentTile
              key={s.id}
              summary={s}
              canEdit={canEdit}
              opening={opening === s.id}
              onOpen={() => void open(s)}
            />
          ))}
          {canEdit && (
            <>
              <button
                className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-navy hover:text-navy transition-colors"
                title="Take a photo"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-6 w-6" />
                <span className="text-[9px]">Camera</span>
              </button>
              <button
                className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-navy hover:text-navy transition-colors"
                title="Add files"
                onClick={() => fileRef.current?.click()}
              >
                <Plus className="h-6 w-6" />
                <span className="text-[9px]">Add</span>
              </button>
            </>
          )}
        </div>
      </div>
      {lightbox && (
        <VideoLightbox
          summary={lightbox.summary}
          blob={lightbox.blob}
          canEdit={canEdit}
          onClose={() => setLightbox(null)}
        />
      )}
    </SectionCard>
  );
}

function fmtDur(s: number | null | undefined): string | null {
  if (!s || !Number.isFinite(s)) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function AttachmentTile({
  summary: s,
  canEdit,
  opening,
  onOpen,
}: {
  summary: AttachmentSummary;
  canEdit: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  const isVideo = s.mimeType.startsWith('video/');
  const dur = fmtDur(s.duration);
  return (
    <div className="relative group">
      <button
        className={cn(
          'block w-full aspect-square rounded-lg overflow-hidden border border-gray-200 text-left',
          opening && 'opacity-60',
        )}
        title={`${s.fileName} · ${kindLabel(s.kind)}`}
        onClick={onOpen}
      >
        {s.thumb ? (
          <div className="relative w-full h-full">
            <img src={s.thumb} alt={s.fileName} className="w-full h-full object-cover" />
            {isVideo && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Play className="h-7 w-7 text-white drop-shadow" fill="white" />
              </span>
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-1 p-1">
            <FileText className="h-6 w-6 text-gray-400" />
            <span className="text-[9px] text-gray-500 truncate w-full text-center">{s.fileName}</span>
          </div>
        )}
      </button>
      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 pointer-events-none">
        <span className="text-[8px] font-semibold bg-black/60 text-white rounded px-1 py-0.5 truncate">
          {s.sourceAttachmentId ? 'Clip' : kindLabel(s.kind)}
        </span>
        {dur && (
          <span className="text-[8px] bg-black/60 text-white rounded px-1 py-0.5 tabular-nums">{dur}</span>
        )}
        {s.clipStart !== undefined && s.clipEnd !== undefined && (
          <span className="text-[8px] bg-safety-orange text-white rounded px-1 py-0.5" title="Clip marked">
            <Scissors className="inline h-2.5 w-2.5" />
          </span>
        )}
        <span className="flex-1" />
        {s.localOnly ? (
          <span title={`Full file on ${s.originName ?? 'origin'}'s device`}>
            <Smartphone className="h-3 w-3 text-white drop-shadow" />
          </span>
        ) : s.storageStatus === 'stored' ? (
          <span title="Backed up">
            <CloudUpload className="h-3 w-3 text-white drop-shadow" />
          </span>
        ) : null}
      </div>
      {canEdit && (
        <button
          className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-gray-700 text-white items-center justify-center hidden group-hover:flex shadow"
          title="Remove"
          onClick={() => {
            if (confirm(`Remove ${s.fileName}?`)) {
              void deleteWithTombstone('attachments', s.id);
              void deleteLocalMedia(s.id).catch(() => undefined);
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
