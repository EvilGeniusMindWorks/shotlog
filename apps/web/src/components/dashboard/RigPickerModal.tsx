// Rig picker for starting a drill checklist — shared by DrillerHome,
// MechanicHome, and the StartGrid launcher (own file to avoid an import
// cycle between RoleCards and StartGrid).
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, X } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { Button } from '@/components/ui/button';

export const LAST_RIG_KEY = 'shotlog-last-rig';

export function RigPickerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">Which rig?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {rigs.map((r) => (
            <button
              key={r.id}
              className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg border border-gray-200 hover:bg-gray-50"
              onClick={() => {
                localStorage.setItem(LAST_RIG_KEY, r.id);
                navigate(`/drill-checklist/${r.id}`);
              }}
            >
              <ClipboardCheck className="h-5 w-5 text-navy shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.assetNumber}</span>
                <span className="block text-xs text-gray-400 truncate">{r.description}</span>
              </span>
            </button>
          ))}
          {rigs.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No drills in the equipment registry yet — ask the office to add your rig.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
