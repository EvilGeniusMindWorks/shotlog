// Settings is PERSONAL (Round S7b order, Matthew: "export data should
// certainly not be the primary section"): You · Preferences · Help &
// feedback · Install · Rehearse (platform admin) · Data & device — last.
// Sign out lives in My Profile only. Company-level management (people,
// equipment, catalog, company details) lives under Admin.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, MessageSquarePlus, Moon, Route, Sun, UserRound } from 'lucide-react';
import { startTour } from '@/components/layout/Tour';
import { DataDeviceCard } from '@/components/forms/DataDeviceCard';
import { InstallCard } from '@/components/onboarding/InstallCard';
import { openFeedbackComposer } from '@/components/feedback/FeedbackComposer';
import { getLayoutPref, setLayoutPref, type LayoutPref } from '@/components/layout/RecordShell';
import { forgetUsualRig, rememberUsualRig, useUsualRigId } from '@/components/dashboard/RigPickerModal';
import { useLiveQuery, db } from '@/db';
import { useTheme } from '@/hooks/useTheme';
import { getRealSessionUser, getSessionUser } from '@/lib/session';
import { myHomeDashboard } from '@/lib/perms';
import { FEEDBACK_OUTBOX_EVENT, outboxCount } from '@/lib/feedback';
import { REHEARSAL_ROLES, rehearsalRole, startRehearsal } from '@/lib/rehearsal';
import { listCompanies, switchCompany, type CompanySummary } from '@/lib/companies';
import { EnvTag } from '@/pages/admin/AdminCompaniesPage';
import {
  COPY_SECTIONS,
  getCopySections,
  getDefaultWorkType,
  setCopySections,
  setDefaultWorkType,
  WORK_TYPES,
  WORK_TYPE_LABEL,
  type CopySectionKey,
} from '@/lib/prefs';
import type { WorkType } from '@/db/schema';
import { showToast } from '@/components/ui/undo-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Who you are — one line, and the door to everything about you */
function YouCard() {
  const me = getSessionUser();
  const real = getRealSessionUser();
  if (!me) return null;
  return (
    <Card data-you-card>
      <CardContent className="pt-4">
        <Link to="/profile" className="flex items-center gap-3 group" data-settings-profile>
          <span className="h-10 w-10 rounded-full bg-navy/10 text-navy flex items-center justify-center shrink-0">
            <UserRound className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-gray-900 truncate">{me.name}</span>
            <span className="block text-xs text-gray-500 truncate capitalize">
              {me.role} · {me.company}
              {real && real.id !== me.id ? ` · viewing as ${me.role}` : ''}
            </span>
            <span className="block text-xs text-navy mt-0.5">
              Profile, licenses, signature, PIN, password, sign out
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-navy" />
        </Link>
      </CardContent>
    </Card>
  );
}

const LAYOUT_OPTIONS = [
  { value: 'auto', label: 'Auto — fit this device' },
  { value: 'compact', label: 'Always compact (one scroll)' },
  { value: 'tabs', label: 'Always tabs (wide layout)' },
];

/** Per-DEVICE preferences plus the one account-level pick (usual rig) */
function PreferencesCard() {
  const { theme, set } = useTheme();
  const [workType, setWorkType] = useState<WorkType | ''>(getDefaultWorkType() ?? '');
  const [copy, setCopy] = useState<Record<CopySectionKey, boolean>>(getCopySections);
  const [layout, setLayout] = useState<LayoutPref>(getLayoutPref);
  const isDriller = myHomeDashboard() === 'driller';
  const usualRigId = useUsualRigId();
  const drills =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];
  return (
    <Card data-preferences-card>
      <CardHeader>
        <CardTitle className="text-base">Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-xs text-gray-400">Also on the rail. Saved on this device.</p>
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden" data-theme-switch>
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={
                  theme === t
                    ? 'px-3 py-1.5 text-sm font-medium bg-navy text-white inline-flex items-center gap-1'
                    : 'px-3 py-1.5 text-sm font-medium bg-white text-gray-600 inline-flex items-center gap-1'
                }
                data-theme-choice={t}
                onClick={() => set(t)}
              >
                {t === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>

        {isDriller && (
          <div>
            <Label className="text-xs">
              Your usual rig{' '}
              <span className="text-gray-400 font-normal">— follows your account to every device</span>
            </Label>
            <Select
              data-pref-usual-rig
              value={usualRigId && drills.some((d) => d.id === usualRigId) ? usualRigId : ''}
              onChange={(e) => {
                const id = e.target.value;
                void (id ? rememberUsualRig(id) : forgetUsualRig()).then(() =>
                  showToast(id ? 'Usual rig saved' : 'Usual rig cleared'),
                );
              }}
              options={[
                { value: '', label: 'Ask each time' },
                ...drills.map((d) => ({ value: d.id, label: `${d.assetNumber} · ${d.description}` })),
              ]}
            />
          </div>
        )}

        <div>
          <Label className="text-xs">
            What a new day starts as{' '}
            <span className="text-gray-400 font-normal">— when the job's last day and its default don't say</span>
          </Label>
          <Select
            data-pref-work-type
            value={workType}
            onChange={(e) => {
              const v = e.target.value as WorkType | '';
              setWorkType(v);
              setDefaultWorkType(v || null);
            }}
            options={[
              { value: '', label: 'Follow my role' },
              ...WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] })),
            ]}
          />
        </div>

        <div>
          <Label className="text-xs">Copy from previous ticks by default</Label>
          <div className="grid grid-cols-2 gap-1 pt-1" data-pref-copy>
            {COPY_SECTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-navy"
                  checked={copy[key]}
                  onChange={(e) => {
                    const next = { ...copy, [key]: e.target.checked };
                    setCopy(next);
                    setCopySections(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs">
            Record page layout{' '}
            <span className="text-gray-400 font-normal">— customer, site and job pages</span>
          </Label>
          <Select
            value={layout}
            onChange={(e) => {
              const next = e.target.value as LayoutPref;
              setLayout(next);
              setLayoutPref(next);
            }}
            options={LAYOUT_OPTIONS}
          />
        </div>
        <p className="text-xs text-gray-400">Saved on this device, except the usual rig.</p>
      </CardContent>
    </Card>
  );
}

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
          <Button variant="outline" onClick={startTour} data-settings-walkthrough>
            <Route className="h-4 w-4 mr-1.5" /> Walkthrough
          </Button>
          <Button variant="outline" asChild>
            <Link to="/help" data-settings-help-guide>
              <BookOpen className="h-4 w-4 mr-1.5" /> Help guide
            </Link>
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
      </CardContent>
    </Card>
  );
}

/** Platform admin only (Round S8c): which company this device is in.
 *  Switching mints a session for the hidden admin twin there, carries the
 *  PIN over, clears this device's copy and downloads the other company. */
function CompanyCard() {
  const me = getRealSessionUser();
  const [companies, setCompanies] = useState<CompanySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const show = Boolean(me?.platformAdmin) && !rehearsalRole();
  useEffect(() => {
    if (!show) return;
    listCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, [show]);
  if (!show) return null;
  const current = companies?.find((c) => c.current);
  return (
    <Card data-company-card>
      <CardHeader>
        <CardTitle className="text-base">Company</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">
          Platform admin only. Switching clears this device's copy of the current company and downloads the other one; invites you send afterwards go there.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            className="flex-1 min-w-[200px]"
            value={current?.id ?? ''}
            disabled={!companies || busy}
            data-company-select
            onChange={(e) => {
              const id = e.target.value;
              if (!id || id === current?.id) return;
              setBusy(true);
              void switchCompany(id).catch((err: Error) => {
                showToast(err.message);
                setBusy(false);
              });
            }}
            options={(companies ?? []).map((c) => ({
              value: c.id,
              label: `${c.name}${c.environment === 'sandbox' ? ' — rehearsal only' : c.environment === 'production' ? '' : ` (${c.environment})`}`,
              disabled: c.environment === 'sandbox',
            }))}
          />
          {current && <EnvTag environment={current.environment} />}
        </div>
        <p className="text-xs text-gray-400">
          {busy ? 'Switching — clearing this device\'s copy, then downloading…' : <Link to="/admin/companies" className="text-safety-orange underline" data-company-manage>Manage companies ›</Link>}
        </p>
      </CardContent>
    </Card>
  );
}

/** Platform admin only (Round S6): become a brand-new person of a role in
 *  the sandbox company — PIN, welcome, walkthrough, their home — to judge
 *  the experience as often as you like. End wipes the sandbox. */
function RehearsalCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [withData, setWithData] = useState(true);
  if (!getRealSessionUser()?.platformAdmin || rehearsalRole()) return null;
  return (
    <Card data-rehearsal-card>
      <CardHeader>
        <CardTitle className="text-base">Rehearse as…</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">
          Sign into the sandbox company as a brand-new person of that role: PIN, welcome,
          walkthrough, then their home. Nothing you do there is real; ending wipes it.
        </p>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={withData}
            data-rehearsal-with-data
            onChange={(e) => setWithData(e.target.checked)}
          />
          <span>
            Start with your company's equipment, people and catalog
            <span className="block text-xs text-gray-400">
              A copy — people arrive without logins, nothing is written back. Untick for the true
              blank slate a brand-new company sees.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {REHEARSAL_ROLES.map((r) => (
            <Button
              key={r}
              variant="outline"
              className="capitalize"
              disabled={busy !== null}
              data-rehearse-as={r}
              onClick={() => {
                setBusy(r);
                void startRehearsal(r, withData).catch((e: Error) => {
                  showToast(e.message);
                  setBusy(null);
                });
              }}
            >
              {busy === r ? 'Starting…' : r}
            </Button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Not rehearsed: the invite email and the install prompt — they are the same for every
          role; send yourself one real invite to see them.
        </p>
      </CardContent>
    </Card>
  );
}

const MANAGER_ROLES = ['admin', 'supervisor', 'mechanic', 'office'];

export function SettingsPage() {
  const role = getSessionUser()?.role ?? '';
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" data-settings-page>
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      <YouCard />
      <PreferencesCard />
      <HelpCard />
      <InstallCard always />
      <CompanyCard />
      <RehearsalCard />
      <DataDeviceCard />
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
