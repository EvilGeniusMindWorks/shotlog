// Peek sheet (screen-studies nav decision): info-tap on a list row shows a
// handful of facts WITHOUT leaving the list — Open commits to navigation.
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function PeekSheet({
  title,
  subtitle,
  facts,
  badge,
  onOpen,
  onClose,
}: {
  title: string;
  subtitle?: string;
  facts: { label: string; value: string }[];
  badge?: ReactNode;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-4 pb-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-base truncate">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
          {badge}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {facts
            .filter((f) => f.value)
            .map((f) => (
              <div key={f.label}>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">{f.label}</p>
                <p className="text-sm font-medium truncate">{f.value}</p>
              </div>
            ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button className="flex-1" onClick={onOpen}>
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}
