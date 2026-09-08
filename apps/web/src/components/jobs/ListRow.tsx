// One row shape for the whole Jobs section (S4 jobs study, kept for the S8b
// drill-down): title (wraps to two lines) with an optional mono number,
// a grey sub-line, chips only when they say something, and a right column
// (last worked · count). Tap opens; long-press / right-click peeks when the
// caller offers a peek.
import { useRef, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { daysUntil } from '@/lib/jobActivity';
import { formatDate } from '@/lib/utils';

/** Long-press (500ms) → onLong; a normal tap → onTap. Right-click = long. */
export function useLongPress(onTap: () => void, onLong?: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      if (!onLong) return;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (!onLong) return;
      e.preventDefault();
      clear();
      onLong();
    },
  };
}

export function ListRow({
  title,
  number,
  sub,
  chips,
  right,
  rightSub,
  onTap,
  onLong,
  testId,
}: {
  title: string;
  number?: string;
  sub: string;
  chips?: ReactNode;
  /** Right column, top line (e.g. last worked) */
  right?: string;
  /** Right column, small second line (e.g. "14 days") */
  rightSub?: string;
  onTap: () => void;
  onLong?: () => void;
  testId?: string;
}) {
  const press = useLongPress(onTap, onLong);
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full flex items-start gap-3 px-3 py-2.5 bg-white border-b border-gray-100 last:border-b-0 text-left hover:bg-gray-50 active:bg-gray-100 select-none cursor-pointer"
      onKeyDown={(e) => e.key === 'Enter' && onTap()}
      data-list-row={testId}
      {...press}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug line-clamp-2">
          {number && <span className="font-mono font-normal text-gray-500 mr-1.5">{number}</span>}
          {title}
        </p>
        <p className="text-sm text-gray-500 truncate">{sub}</p>
        {chips && <div className="flex flex-wrap gap-1 mt-1">{chips}</div>}
      </div>
      {(right || rightSub) && (
        <div className="shrink-0 text-right">
          {right && <p className="text-sm font-medium text-gray-800">{right}</p>}
          {rightSub && <p className="text-xs text-gray-400">{rightSub}</p>}
        </div>
      )}
    </div>
  );
}

export function StartsChip({ date }: { date: string }) {
  const d = daysUntil(date);
  return (
    <Badge variant="submitted" className="font-medium">
      starts {d === 0 ? 'today' : d === 1 ? 'tomorrow' : formatDate(date)}
    </Badge>
  );
}

/** "14 days" / "no days" for the right column */
export function dayCount(days: number): string {
  return days === 0 ? 'no days' : `${days} day${days === 1 ? '' : 's'}`;
}
