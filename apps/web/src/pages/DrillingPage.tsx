// /drilling — the driller rail's thin page (nav round, 2026-08-18):
// every pattern they could work, one tap from anywhere. Same content as
// the trio home's drilling bands, reachable without scrolling home.
// The Rig checklist door opens the checklist itself — the rig is chosen on
// the form (Matthew, 2026-09-07), never here.
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { DrillingWork } from '@/components/dashboard/RoleCards';
import { useMyChecklistsToday } from '@/hooks/useMaintenance';

export function DrillingPage() {
  const navigate = useNavigate();
  const mine = useMyChecklistsToday() ?? [];
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <h2 className="text-xl font-bold text-gray-900">Drilling</h2>
      <p className="text-sm text-gray-400 -mt-2">
        Plans sent to you, open patterns, and shots ready to drill.
      </p>
      <button
        className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left hover:bg-gray-50"
        data-checklist-door
        onClick={() => navigate('/drill-checklist')}
      >
        <ClipboardCheck className={`h-5 w-5 shrink-0 ${mine.length > 0 ? 'text-green-600' : 'text-navy'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{mine.length > 0 ? 'File another rig checklist' : 'File rig checklist'}</span>
          <span className="block text-xs text-gray-400 truncate">
            {mine.length > 0
              ? `Filed today: ${mine.map((m) => m.asset).join(', ')} — pick the rig on the form`
              : 'Pick the rig on the form — no job or plan needed'}
          </span>
        </span>
        <span className="text-gray-300">›</span>
      </button>
      <DrillingWork />
    </div>
  );
}
