// Read-only means read-only (Round S9a, 2026-09-09). The evaluation's office
// manager typed into a customer's COI date — the card was dimmed and
// pointer-events were off, but keyboard focus still reached the field, the
// server discarded the write, sync put the old value back, and nothing said
// why. A disabled <fieldset> stops every control inside it (keyboard too),
// and one line says who can change it.
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { readOnlyLine, type WriteOp } from '@/lib/perms';

export function ReadOnlyWrap({
  readOnly,
  table,
  op = 'PATCH',
  children,
}: {
  readOnly: boolean;
  /** the synced table the form writes — names who can, in the line */
  table: string;
  op?: WriteOp;
  children: ReactNode;
}) {
  if (!readOnly) return <>{children}</>;
  return (
    <div className="space-y-2" data-read-only={table}>
      <p className="text-xs text-gray-500 inline-flex items-center gap-1" data-read-only-line>
        <Lock className="h-3 w-3" /> {readOnlyLine(table, op)}
      </p>
      <fieldset disabled className="min-w-0 border-0 p-0 m-0">
        {children}
      </fieldset>
    </div>
  );
}
