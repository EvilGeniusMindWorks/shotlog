// /drilling — the driller rail's thin page (nav round, 2026-08-18):
// every pattern they could work, one tap from anywhere. Same content as
// the trio home's drilling bands, reachable without scrolling home.
// S7a: a Rig checklist door here too — the checklist needs no plan, no
// job and no day (Matthew: "fill out a rig checklist without anything else").
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { DrillingWork } from '@/components/dashboard/RoleCards';
import { RigPickerModal, useUsualRigId } from '@/components/dashboard/RigPickerModal';
import { useTodayChecklist } from '@/hooks/useMaintenance';

export function DrillingPage() {
  const navigate = useNavigate();
  const [showRigs, setShowRigs] = useState(false);
  const usualRigId = useUsualRigId();
  const rig = useLiveQuery(() => (usualRigId ? db.equipment.get(usualRigId) : undefined), [usualRigId]);
  const today = useTodayChecklist(usualRigId);
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <h2 className="text-xl font-bold text-gray-900">Drilling</h2>
      <p className="text-sm text-gray-400 -mt-2">
        Plans sent to you, open patterns, and shots ready to drill.
      </p>
      <button
        className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left hover:bg-gray-50"
        data-checklist-door
        onClick={() => (usualRigId ? navigate(`/drill-checklist/${usualRigId}`) : setShowRigs(true))}
      >
        <ClipboardCheck className={`h-5 w-5 shrink-0 ${today ? 'text-green-600' : 'text-navy'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Rig checklist</span>
          <span className="block text-xs text-gray-400 truncate">
            {rig
              ? today
                ? `${rig.assetNumber} · filed today`
                : `${rig.assetNumber} · not filed today — no job or plan needed`
              : 'Pick your rig — no job or plan needed'}
          </span>
        </span>
        <span className="text-gray-300">›</span>
      </button>
      <DrillingWork />
      {showRigs && <RigPickerModal onClose={() => setShowRigs(false)} />}
    </div>
  );
}
