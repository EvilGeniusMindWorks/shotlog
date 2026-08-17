// Admin area shell: role-gates the whole section, renders the tab bar,
// and shows the online-required banner. Admin actions are ONLINE-ONLY by
// design — office/admin staff always have a connection, and REST calls
// give immediate success/error feedback instead of offline queue-and-hope.
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { getSessionUser } from '@/lib/session';
import { hasCap, useRoleDefsSync } from '@/lib/perms';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

// Tabs follow CAPABILITIES (configurable roles) — a custom role sees
// exactly the areas its bundle grants. Roles itself is admin-only.
const TABS: { to: string; label: string; cap: string | null }[] = [
  { to: '/admin/people', label: 'People', cap: 'manage_people' },
  { to: '/admin/approvals', label: 'Approvals', cap: 'approve_days' },
  { to: '/admin/catalog', label: 'Catalog', cap: 'manage_company' },
  { to: '/admin/equipment', label: 'Equipment', cap: 'manage_equipment' },
  { to: '/admin/incidents', label: 'Incidents', cap: 'process_incidents' },
  { to: '/admin/roles', label: 'Roles', cap: null }, // admin only
  { to: '/admin/company', label: 'Company', cap: 'manage_company' },
];

export function AdminLayout() {
  const session = getSessionUser();
  const online = useOnlineStatus();
  const role = session?.role ?? '';
  const defsLoaded = useRoleDefsSync();

  // Custom-role users would be bounced by an empty capability cache on a
  // fresh page load — wait for the definitions before deciding
  if (defsLoaded === undefined) return null;
  if (!hasCap('view_admin_area')) {
    return <Navigate to="/" replace />;
  }
  const tabs = TABS.filter((t) => (t.cap === null ? role === 'admin' : hasCap(t.cap)));

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-900">Admin</h2>
      </div>
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-safety-orange text-safety-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 mb-4 text-sm text-safety-orange">
          <WifiOff className="h-4 w-4 shrink-0" />
          Admin changes need a connection — viewing works, but saving is disabled until
          you're back online.
        </div>
      )}
      <Outlet context={{ online, role }} />
    </div>
  );
}
