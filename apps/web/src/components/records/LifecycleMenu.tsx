// The ONE lifecycle UI shape (docs/deletion-pattern.md): an overflow ⋯
// menu → a consequence sheet that says exactly what happens in plain
// words. Archive confirms with a normal button; Delete is red and repeats
// the record's name. After archiving: a 10s Undo toast.
import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, MoreVertical, Trash2 } from 'lucide-react';
import { useLiveQuery } from '@/db';
import type { Archivable } from '@/db/schema';
import { can } from '@/lib/perms';
import {
  archiveRecord,
  countLifecycleChildren,
  deleteRecordPlain,
  describeChildren,
  everUsed,
  restoreRecord,
} from '@/lib/lifecycle';
import { showToast } from '@/components/ui/undo-toast';
import { Button } from '@/components/ui/button';

interface Props {
  /** Synced table name — also the permission key (archive rides DELETE) */
  table: string;
  record: { id: string } & Archivable;
  /** Display name, repeated on the red Delete button */
  label: string;
  /** Lowercase noun for the sheet copy: "customer", "site", "job"… */
  kind: string;
  /** Offer Archive at all (work days never archive — they're history) */
  allowArchive?: boolean;
  /** Extra delete eligibility beyond never-used (e.g. day must be draft) */
  canDeleteOverride?: boolean;
  /** Custom delete (cascades); default removes just this record */
  deleteFn?: () => Promise<void>;
  /** Called after a successful delete (navigate away) */
  onDeleted?: () => void;
  /** Consequence copy for Delete; default is the never-used wording */
  deleteDescription?: string;
  /** Trigger styling override (e.g. on dark headers) */
  buttonClassName?: string;
}

export function LifecycleMenu({
  table,
  record,
  label,
  kind,
  allowArchive = true,
  canDeleteOverride,
  deleteFn,
  onDeleted,
  deleteDescription,
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<'archive' | 'delete' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const counts = useLiveQuery(() => countLifecycleChildren(table, record.id), [table, record.id]);
  const supervisory = can(table, 'DELETE');
  if (!supervisory) return null;

  const archived = Boolean(record.archivedAt);
  const used = counts ? everUsed(counts) : true;
  const deletable = canDeleteOverride ?? !used;
  const childText = counts ? describeChildren(counts) : '';

  const doArchive = async () => {
    setSheet(null);
    await archiveRecord(table, record);
    showToast(`Archived ${label}`, {
      onUndo: () => restoreRecord(table, record),
    });
  };

  const doRestore = async () => {
    setOpen(false);
    await restoreRecord(table, record);
    showToast(`Restored ${label}`);
  };

  const doDelete = async () => {
    setSheet(null);
    if (deleteFn) await deleteFn();
    else await deleteRecordPlain(table, record.id);
    showToast(`Deleted ${label}`);
    onDeleted?.();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label="More actions"
        className={
          buttonClassName ??
          'h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        }
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
          {allowArchive && !archived && (
            <MenuItem
              icon={<Archive className="h-4 w-4" />}
              label="Archive…"
              onClick={() => {
                setOpen(false);
                setSheet('archive');
              }}
            />
          )}
          {allowArchive && archived && (
            <MenuItem
              icon={<ArchiveRestore className="h-4 w-4" />}
              label="Restore"
              onClick={doRestore}
            />
          )}
          {deletable && (
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete…"
              danger
              onClick={() => {
                setOpen(false);
                setSheet('delete');
              }}
            />
          )}
          {!deletable && (
            <p className="px-3 py-2 text-xs text-gray-400">
              Has history — archive instead of deleting.
            </p>
          )}
        </div>
      )}

      {sheet === 'archive' && (
        <ConsequenceSheet onClose={() => setSheet(null)}>
          <h3 className="font-bold text-lg">Archive {label}?</h3>
          <p className="text-sm text-gray-600 mt-2">
            It disappears from lists and pickers.
            {childText && (
              <>
                {' '}
                Its {childText} {counts!.filter((c) => c.count > 0).length === 1 && counts!.some((c) => c.count === 1) ? 'is' : 'are'} untouched.
              </>
            )}{' '}
            Restore it anytime from Archived.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={doArchive}>
              Archive
            </Button>
          </div>
        </ConsequenceSheet>
      )}

      {sheet === 'delete' && (
        <ConsequenceSheet onClose={() => setSheet(null)}>
          <h3 className="font-bold text-lg">Delete {label}?</h3>
          <p className="text-sm text-gray-600 mt-2">
            {deleteDescription ??
              `This ${kind} was never used — deleting removes it from the app everywhere. The server keeps a permanent audit record of everything that happened to it.`}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={doDelete}
            >
              Delete {label}
            </Button>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 ${
        danger ? 'text-red-600' : 'text-gray-700'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

export function ConsequenceSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-5 pb-8 sm:pb-5">
        {children}
      </div>
    </div>
  );
}
