import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Collapsible section card matching the wireframe (§4.5):
 * [icon chip] Title + subtitle · completion dot · chevron
 *
 * - `complete`: true → green check · false → solid orange dot · undefined → none
 * - `icon`: colored icon chip (pass a styled node, e.g. <IconChip tint="red">…)
 * - `subtitle`: small gray line under the title (collapsed-state summary)
 * - `actions`: header-right controls (don't toggle the card)
 */
export function SectionCard({
  title,
  icon,
  subtitle,
  complete,
  summary,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
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
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer select-none min-h-[56px]"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}
      >
        {icon}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-tight">{title}</div>
          {subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</div>}
        </div>
        {summary && (
          <span className="text-xs text-gray-500 truncate max-w-[30%] shrink-0">{summary}</span>
        )}
        {actions && (
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            {actions}
          </span>
        )}
        {complete !== undefined &&
          (complete ? (
            <span
              className="h-5 w-5 rounded-full border-2 border-compliant text-compliant flex items-center justify-center shrink-0"
              title="Complete"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : (
            <span
              className="h-3.5 w-3.5 rounded-full bg-safety-orange shrink-0"
              title="Incomplete"
            />
          ))}
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </div>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

const TINTS = {
  red: 'bg-red-50 text-red-500',
  orange: 'bg-orange-50 text-orange-500',
  blue: 'bg-blue-50 text-blue-600',
  yellow: 'bg-yellow-50 text-yellow-600',
  green: 'bg-green-50 text-green-600',
  navy: 'bg-navy-50 text-navy',
  gray: 'bg-gray-100 text-gray-500',
} as const;

/** Rounded colored icon square used in section headers (wireframe style) */
export function IconChip({ tint, children }: { tint: keyof typeof TINTS; children: ReactNode }) {
  return (
    <span
      className={cn(
        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
        TINTS[tint],
      )}
    >
      {children}
    </span>
  );
}

/** Inline collapsible sub-section row inside a card (shot sub-sections) */
export function SubSection({
  icon,
  title,
  summary,
  navigate,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  summary?: ReactNode;
  /** if set, the row is a navigation link instead of a collapsible */
  navigate?: () => void;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isLink = Boolean(navigate);
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center gap-3 py-3 cursor-pointer select-none min-h-[48px]"
        onClick={() => (isLink ? navigate!() : setOpen(!open))}
        onKeyDown={(e) => e.key === 'Enter' && (isLink ? navigate!() : setOpen(!open))}
      >
        {icon}
        <span className="font-semibold text-sm flex-1">{title}</span>
        {summary && <span className="text-xs text-gray-500 truncate max-w-[45%]">{summary}</span>}
        {isLink ? (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        ) : open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </div>
      {!isLink && open && <div className="pb-3">{children}</div>}
    </div>
  );
}
