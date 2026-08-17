// Settings is PERSONAL: your account, sync, and sign-in preferences.
// Company-level management (people, equipment, catalog, company details)
// lives under Admin — one place, no duplicate lists.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountSyncCard } from '@/components/forms/AccountSyncCard';
import { getLayoutPref, setLayoutPref, type LayoutPref } from '@/components/layout/RecordShell';
import { getSessionUser } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const MANAGER_ROLES = ['admin', 'supervisor', 'mechanic', 'office'];

const LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Auto — fit this device' },
  { value: 'compact', label: 'Always compact (one scroll)' },
  { value: 'tabs', label: 'Always tabs (wide layout)' },
];

/** Per-DEVICE record-page layout override (stored locally, not synced) */
function LayoutCard() {
  const [pref, setPref] = useState<LayoutPref>(getLayoutPref);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record page layout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">
          Customer, site, and job pages
          <span className="text-gray-400 font-normal">
            {' '}
            — Auto uses tabs on wide screens and one compact scroll on phones
          </span>
        </Label>
        <Select
          value={pref}
          onChange={(e) => {
            const next = e.target.value as LayoutPref;
            setPref(next);
            setLayoutPref(next);
          }}
          options={LAYOUT_OPTIONS}
        />
        <p className="text-xs text-gray-400">Saved on this device only.</p>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const role = getSessionUser()?.role ?? '';
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      <AccountSyncCard />
      <LayoutCard />
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
