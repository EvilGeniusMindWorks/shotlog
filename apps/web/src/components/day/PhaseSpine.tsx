// The day hub (Round 2, blaster study §2): phases in order down a spine —
// green dot done, orange ring current — each row one tap into its phase.
// The orange Continue always targets the current phase.
import type { DayPhaseModel } from '@/hooks/useDayPhases';
import { Badge } from '@/components/ui/badge';

export function PhaseSpine({
  model,
  onOpen,
}: {
  model: DayPhaseModel;
  onOpen: (view: string) => void;
}) {
  return (
    <div>
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-gray-200" />
        {model.phases.map((p) => (
          <div key={p.key} className="relative mb-2">
            <span
              className={
                'absolute -left-6 top-4 h-3 w-3 rounded-full border-[3px] ' +
                (p.state === 'done'
                  ? 'bg-compliant border-compliant'
                  : p.state === 'now'
                    ? 'bg-white border-safety-orange'
                    : 'bg-white border-gray-300')
              }
            />
            <button
              className={
                'w-full text-left bg-white border rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-gray-50 min-h-[56px] ' +
                (p.state === 'now' ? 'border-safety-orange' : 'border-gray-200')
              }
              onClick={() => onOpen(p.view)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.label}</p>
                <p className="text-xs text-gray-400 truncate">{p.sub}</p>
              </div>
              <Badge variant={p.chipVariant}>{p.chip}</Badge>
            </button>
          </div>
        ))}
      </div>
      {model.current && (
        <button
          className="w-full bg-safety-orange text-white rounded-xl py-3 font-bold text-sm mt-1 hover:bg-orange-600"
          onClick={() => onOpen(model.current!.view)}
        >
          {model.continueLabel}
        </button>
      )}
    </div>
  );
}
