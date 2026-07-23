import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Plus, X } from 'lucide-react';
import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { Attachment } from '@/db/schema';
import { SectionCard } from '@/components/ui/section-card';

/** Photo/document attachments for a blast day (Spec §4.8) */
export function AttachmentsCard({ blastDayId }: { blastDayId: string }) {
  const attachments =
    useLiveQuery(
      () => db.attachments.where('parentId').equals(blastDayId).toArray(),
      [blastDayId],
    ) ?? [];
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const now = nowISO();
    for (const file of Array.from(files)) {
      await db.attachments.add({
        id: generateId(),
        parentId: blastDayId,
        parentType: 'blast_day',
        fileName: file.name,
        mimeType: file.type,
        data: file,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      } satisfies Attachment);
    }
  };

  return (
    <SectionCard
      title="Attachments"
      summary={attachments.length > 0 ? `${attachments.length} file${attachments.length > 1 ? 's' : ''}` : undefined}
      defaultOpen={attachments.length > 0}
    >
      <div>
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
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {attachments.map((att) => (
            <AttachmentTile key={att.id} attachment={att} />
          ))}
          <button
            className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-navy hover:text-navy transition-colors"
            title="Add attachment"
            onClick={() => fileRef.current?.click()}
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function AttachmentTile({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.data]);

  return (
    <div className="relative aspect-square group">
      <a
        href={url ?? '#'}
        target="_blank"
        rel="noreferrer"
        className="block w-full h-full rounded-lg overflow-hidden border border-gray-200"
        title={attachment.fileName}
      >
        {isImage && url ? (
          <img src={url} alt={attachment.fileName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-1 p-1">
            <FileText className="h-6 w-6 text-gray-400" />
            <span className="text-[9px] text-gray-500 truncate w-full text-center">
              {attachment.fileName}
            </span>
          </div>
        )}
      </a>
      <button
        className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-gray-700 text-white items-center justify-center hidden group-hover:flex shadow"
        title="Remove"
        onClick={() => {
          if (confirm(`Remove ${attachment.fileName}?`)) void db.attachments.delete(attachment.id);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
