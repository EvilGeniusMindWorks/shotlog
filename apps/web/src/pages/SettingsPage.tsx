// Settings is PERSONAL: your account, sync, and sign-in preferences.
// Company-level management (people, equipment, catalog, company details)
// lives under Admin — one place, no duplicate lists.
import { Link } from 'react-router-dom';
import { AccountSyncCard } from '@/components/forms/AccountSyncCard';
import { getSessionUser } from '@/lib/session';

const MANAGER_ROLES = ['admin', 'supervisor', 'mechanic', 'office'];

export function SettingsPage() {
  const role = getSessionUser()?.role ?? '';
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      <AccountSyncCard />
      {MANAGER_ROLES.includes(role) && (
        <p className="text-sm text-gray-500 rounded-lg border border-gray-200 bg-white px-3 py-2">
          People, equipment, and company setup are managed in{' '}
          <Link to="/admin" className="text-safety-orange underline">
            Admin
          </Link>
          .
        </p>
      )}
    </div>
  );
}
