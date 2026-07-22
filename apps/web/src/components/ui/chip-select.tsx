import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChipOption {
  value: string;
  label: string;
}

const chipBase =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors select-none';
const chipOff = 'border-gray-300 bg-white text-gray-700 active:bg-gray-100';
const chipOn = 'border-navy bg-navy text-white';

/**
 * Single-select chip row — glove-friendly replacement for <Select>.
 * Tapping the selected chip again clears it when `allowEmpty` is set.
 */
export function ChipSelect({
  value,
  onChange,
  options,
  allowEmpty = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  allowEmpty?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={cn(chipBase, selected ? chipOn : chipOff)}
            onClick={() => onChange(selected && allowEmpty ? '' : opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Parse a comma-separated multi-value string into trimmed entries */
export function splitChipValues(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Multi-select chip row storing its value as a comma-separated string —
 * compatible with the existing free-text schema fields and print output.
 * Values not in `options` (from old free-text data or custom adds) render
 * as removable chips.
 */
export function ChipMultiSelect({
  value,
  onChange,
  options,
  customLabel = 'Other',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  customLabel?: string;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState('');
  const selected = splitChipValues(value);
  const customValues = selected.filter((v) => !options.some((o) => o.label === v));

  const toggle = (label: string) => {
    const next = selected.includes(label)
      ? selected.filter((v) => v !== label)
      : [...selected, label];
    onChange(next.join(', '));
  };

  const addCustom = () => {
    const text = customText.trim();
    if (text && !selected.includes(text)) onChange([...selected, text].join(', '));
    setCustomText('');
    setAdding(false);
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const isOn = selected.includes(opt.label);
        return (
          <button
            key={opt.value}
            type="button"
            className={cn(chipBase, isOn ? chipOn : chipOff)}
            onClick={() => toggle(opt.label)}
          >
            {opt.label}
          </button>
        );
      })}
      {customValues.map((v) => (
        <button
          key={v}
          type="button"
          className={cn(chipBase, chipOn, 'gap-1.5')}
          onClick={() => toggle(v)}
          title="Remove"
        >
          {v}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          className="min-h-[44px] px-4 rounded-full border border-navy text-sm w-40 focus:outline-none focus:ring-2 focus:ring-navy-400"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={addCustom}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCustom();
            if (e.key === 'Escape') {
              setCustomText('');
              setAdding(false);
            }
          }}
          placeholder={customLabel}
        />
      ) : (
        <button
          type="button"
          className={cn(chipBase, chipOff, 'gap-1 border-dashed text-gray-500')}
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {customLabel}
        </button>
      )}
    </div>
  );
}
