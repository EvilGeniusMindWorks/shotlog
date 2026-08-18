// /drilling — the driller rail's thin page (nav round, 2026-08-18):
// every pattern they could work, one tap from anywhere. Same content as
// the trio home's drilling bands, reachable without scrolling home.
import { DrillingWork } from '@/components/dashboard/RoleCards';

export function DrillingPage() {
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <h2 className="text-xl font-bold text-gray-900">Drilling</h2>
      <p className="text-sm text-gray-400 -mt-2">
        Plans sent to you, open patterns, and shots ready to drill.
      </p>
      <DrillingWork />
    </div>
  );
}
