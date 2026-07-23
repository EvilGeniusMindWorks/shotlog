import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Collapsible section card with a completion indicator (wireframe §4.5).
 *
 * - `complete`: true → green check dot · false → hollow dot · undefined → none
 * - `summary`: small text shown in the header (visible when collapsed)
 * - `actions`: header-right controls (don't toggle the card)
 */
export function SectionCard({
  title,
  complete,
  summary,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  complete?: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none min-h-[52px]"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
        <span className="font-semibold text-[15px]">{title}</span>
        {complete !== undefined && (
          <span
            className={cn(
              'h-4.5 w-4.5 h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0',
              complete ? 'bg-compliant text-white' : 'border-2 border-gray-300',
            )}
            title={complete ? 'Complete' : 'Incomplete'}
          >
            {complete && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        )}
        <span className="flex-1" />
        {summary && <span className="text-xs text-gray-500 truncate max-w-[40%]">{summary}</span>}
        {actions && (
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            {actions}
          </span>
        )}
      </div>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}
