// Settings is PERSONAL: your account, sync, and sign-in preferences.
// Company-level management (people, equipment, catalog, company details)
// lives under Admin — one place, no duplicate lists.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MessageSquarePlus } from 'lucide-react';
import { AccountSyncCard } from '@/components/forms/AccountSyncCard';
import { InstallCard } from '@/components/onboarding/InstallCard';
import { openFeedbackComposer } from '@/components/feedback/FeedbackComposer';
import { getLayoutPref, setLayoutPref, type LayoutPref } from '@/components/layout/RecordShell';
import { getSessionUser } from '@/lib/session';
import { FEEDBACK_OUTBOX_EVENT, outboxCount } from '@/lib/feedback';
import { buildId } from '@/lib/diagnostics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Help & feedback (Round S3; S2 adds Walkthrough + coach sheets here) */
function HelpCard() {
  const [queued, setQueued] = useState(outboxCount);
  useEffect(() => {
    const refresh = () => setQueued(outboxCount());
    window.addEventListener(FEEDBACK_OUTBOX_EVENT, refresh);
    return () => window.removeEventListener(FEEDBACK_OUTBOX_EVENT, refresh);
  }, []);
  return (
    <Card data-help-card>
      <CardHeader>
        <CardTitle className="text-base">Help &amp; feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">
          Stuck, or something looks wrong? Tell Matthew — it goes straight to him, works without
          signal, and includes which screen you were on.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openFeedbackComposer()} data-settings-feedback>
            <MessageSquarePlus className="h-4 w-4 mr-1.5" /> Send feedback
          </Button>
          <Button variant="outline" asChild>
            <Link to="/reference">
              <BookOpen className="h-4 w-4 mr-1.5" /> Reference
            </Link>
          </Button>
        </div>
        {queued > 0 && (
          <p className="text-xs text-amber-700" data-feedback-queued>
            {queued} report{queued === 1 ? '' : 's'} waiting for signal — sends automatically.
          </p>
        )}
        <p className="text-xs text-gray-400">Build {buildId()}</p>
      </CardContent>
    </Card>
  );
}

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
      <InstallCard always />
      <HelpCard />
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
