// Pre-blast ritual placeholder (Round 2, blaster charter): nothing was
// requested, but the slot exists with editable language for future
// inclusion. Display-only — checks are ephemeral, nothing is recorded.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { db, useLiveQuery } from '@/db';

const DEFAULT_ITEMS = [
  'Notifications made (FD / abutters per site rules)',
  'Pre-blast surveys current for structures in range',
  'Blast area guarded · access controlled',
  'Warning signals sounded',
];

export function PreBlastCard() {
  const [open, setOpen] = useState(false);
  const items =
    useLiveQuery(async () => {
      const settings = await db.companySettings.toArray();
      const custom = settings[0]?.preBlastChecklist;
      return custom && custom.length > 0 ? custom : DEFAULT_ITEMS;
    }) ?? DEFAULT_ITEMS;

  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl px-4 py-3">
      <button className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="flex-1">
          <span className="font-semibold text-sm">Pre-blast checklist</span>
          <span className="text-xs text-gray-400 ml-2">placeholder — not recorded</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <label key={i} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-gray-300" />
              {item}
            </label>
          ))}
          <p className="text-[11px] text-gray-400">
            Language editable in Admin › Company. This list is a slot for the future — nothing is
            saved or enforced yet.
          </p>
        </div>
      )}
    </div>
  );
}
