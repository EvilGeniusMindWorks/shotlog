// Rows that open a chooser (design week, Matthew Sep 14 2026: "no pills
// anywhere"). A fact is one row — its label, its value and where the value
// came from — and tapping it opens a full-height chooser with one big button
// per option, the same shape as the rig picker. Calm to read, big targets
// for gloves, one tap more than a chip and worth it.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';

export interface FactOption {
  value: string;
  label: string;
  hint?: string;
}

export function FactRow({
  path,
  label,
  value,
  source,
  onClick,
  disabled,
  children,
}: {
  /** the fact's path — also its test handle */
  path: string;
  label: string;
  /** the value as the person reads it */
  value: string;
  /** where the value came from — "NWS 6:28 am", "from Sep 12", "clock", "you" */
  source?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** an inline control instead of a chooser (a time, a note) */
  children?: ReactNode;
}) {
  const inner = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
          {source && <span className="ml-2 normal-case tracking-normal font-normal text-gray-400">{source}</span>}
        </span>
        {children ?? (
          <span className="block text-base font-semibold text-gray-900 truncate" data-fact-value>
            {value || '—'}
          </span>
        )}
      </span>
      {!children && <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
    </>
  );
  if (children) {
    return (
      <div className="w-full flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 min-h-[56px]" data-fact-row={path}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`w-full flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left min-h-[56px] ${disabled ? 'opacity-60' : 'hover:bg-gray-50'}`}
      data-fact-row={path}
      disabled={disabled}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}

export function ChooserSheet({
  path,
  title,
  legend,
  options,
  value,
  allowEmpty,
  onPick,
  onClose,
}: {
  path: string;
  title: string;
  legend?: string;
  options: FactOption[];
  value: string;
  /** offer "None" as a choice */
  allowEmpty?: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const all = allowEmpty ? [{ value: '', label: 'None' }, ...options] : options;
  return (
    <ConsequenceSheet onClose={onClose}>
      <div data-chooser={path}>
        <h3 className="font-bold text-lg">{title}</h3>
        {legend && <p className="text-xs text-gray-500 mb-2">{legend}</p>}
        <div className="space-y-2 mt-2">
          {all.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value || '__none'}
                type="button"
                className={`w-full text-left rounded-lg border px-3 py-3 min-h-[52px] text-base ${on ? 'border-safety-orange bg-orange-50 shadow-[inset_0_0_0_1px_#EE7A2E] font-semibold' : 'border-gray-200 bg-white font-medium'}`}
                data-option={o.value}
                aria-pressed={on}
                onClick={() => {
                  onPick(o.value);
                  onClose();
                }}
              >
                {o.label}
                {o.hint && <span className="block text-xs text-gray-500 font-normal">{o.hint}</span>}
              </button>
            );
          })}
        </div>
        <Button variant="outline" className="w-full mt-3" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </ConsequenceSheet>
  );
}
