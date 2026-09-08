import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Drill,
  FolderArchive,
  LayoutDashboard,
  BookOpen,
  Briefcase,
  MapPin,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  AlertTriangle,
  Users,
  Wrench,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useReconnectWatchdog } from '@/hooks/useReconnectWatchdog';
import { startFileUploader } from '@/lib/fileUploader';
import { getSessionUser, getRealSessionUser, getViewRole, setViewRole } from '@/lib/session';
import { hasCap, myHomeDashboard, useRoleDefsSync } from '@/lib/perms';
import { FirstSyncStrip, SessionExpiredBanner, SyncChip, UpdateChip } from './SyncChip';
import {
  SCREEN_TOUR_EVENT,
  START_TOUR_EVENT,
  Tour,
  shouldAutoRunScreenTour,
  shouldAutoRunTour,
  startTour,
  tourBucket,
} from './Tour';
import { screenTourFor, type ScreenTourKey } from '@/components/guidance/tourScripts';
import { HelpMenu } from '@/components/feedback/HelpMenu';
import { RehearsalBar } from '@/components/rehearsal/RehearsalBar';
import { ShotLogLogo } from '@/components/brand/ShotLogLogo';

/** Dev-only: `window.shotlogCrash()` throws during render so the harness
 *  can prove the root error boundary catches it (never shipped in prod) */
function CrashProbe() {
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).shotlogCrash = () => setBoom(true);
  }, []);
  if (boom) throw new Error('Harness-triggered render crash');
  return null;
}

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/records', icon: FolderArchive, label: 'Records' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/reference', icon: BookOpen, label: 'Reference' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

/** Role-specific rails (nav study, approved 2026-08-18): the rail names
 *  the role's NOUNS on one shared rhythm — home on top, work nouns, then
 *  Settings pinned. Keyed by homeDashboard bucket so custom roles inherit
 *  sensibly; admins keep the classic rail until the Admin round's
 *  fold-in. Nothing loses reachability — demoted items live behind the
 *  home or the routes they always had. */
function navItemsForRole() {
  const role = getSessionUser()?.role ?? '';
  const admin = hasCap('view_admin_area');
  const adminItem = { to: '/admin', icon: ShieldCheck, label: 'Admin' };
  if (role === 'admin') return [...baseNavItems, adminItem];

  const home = myHomeDashboard();
  const settings = { to: '/settings', icon: Settings, label: 'Settings' };

  if (home === 'driller')
    return [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/drilling', icon: Drill, label: 'Drilling' },
      { to: '/days', icon: CalendarDays, label: 'Work days' },
      { to: '/records', icon: FolderArchive, label: 'My records' },
      settings,
      ...(admin ? [adminItem] : []),
    ];

  if (home === 'mechanic')
    return [
      // Fleet is the registry promoted OUT of Admin — with it on the rail,
      // the mechanic's Admin door retires (its only tab moved here)
      { to: '/', icon: Wrench, label: 'Shop' },
      { to: '/admin/equipment', icon: Briefcase, label: 'Fleet' },
      { to: '/equipment-locator', icon: MapPin, label: 'Locator' },
      { to: '/records', icon: FolderArchive, label: 'Records' },
      settings,
    ];

  if (home === 'office')
    // Provisional (pending Evette's walkthrough): Incidents promoted, the
    // Admin door retires with it
    return [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/records', icon: FolderArchive, label: 'Records' },
      { to: '/jobs', icon: Briefcase, label: 'Jobs' },
      { to: '/admin/incidents', icon: AlertTriangle, label: 'Incidents' },
      // S4 (office study): a read-only roster so Evette can look up a
      // license or phone number without the Admin door
      { to: '/admin/people', icon: Users, label: 'People' },
      settings,
    ];

  // Field (blaster / supervisor / custom field-home roles)
  return [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/days', icon: CalendarDays, label: 'Work days' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/records', icon: FolderArchive, label: hasCap('approve_days') ? 'Records' : 'My records' },
    ...(hasCap('approve_days') ? [{ to: '/admin/approvals', icon: CheckCircle2, label: 'Approvals' }] : []),
    { to: '/reference', icon: BookOpen, label: 'Reference' },
    settings,
    ...(admin ? [adminItem] : []),
  ];
}

const VIEWABLE_ROLES = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'];

/** View-as options: the six built-ins plus this company's custom roles
 *  (Round 5) — Matthew's role-testing tool covers the whole engine now */
function useViewableRoles(): { key: string; name: string }[] {
  const defs = useLiveQuery(() => db.roleDefinitions.toArray()) ?? [];
  const out = VIEWABLE_ROLES.map((r) => ({ key: r, name: r }));
  for (const d of defs) {
    if (d.key && !VIEWABLE_ROLES.includes(d.key)) out.push({ key: d.key, name: d.name || d.key });
  }
  return out;
}

// S8b: the Jobs section is a drill-down (Customers › sites › jobs), so the
// former sidebar sub-items (All jobs · Customers · Sites) are gone.

/** Sidebar entry into role impersonation — built-ins + custom roles */
function ViewAsSelect() {
  const roles = useViewableRoles();
  return (
    <label className="flex items-center gap-2 px-3 py-1 text-[11px] text-navy-200">
      View as
      <select
        className="flex-1 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-xs text-white capitalize"
        value="admin"
        onChange={(e) => setViewRole(e.target.value)}
      >
        {roles.map((r) => (
          <option key={r.key} value={r.key} className="capitalize text-gray-900">
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Admin-only role impersonation banner — sticky so the exit is always reachable */
function ViewAsBanner() {
  const viewRole = getViewRole();
  const roles = useViewableRoles();
  if (!viewRole) return null;
  return (
    <div className="sticky top-0 z-30 bg-amber-400 text-amber-950 px-4 py-1.5 flex items-center gap-2 text-sm shadow-sm">
      <span className="font-semibold shrink-0">Viewing as</span>
      <select
        className="bg-amber-300 border border-amber-500 rounded-md px-2 py-0.5 text-sm font-medium capitalize"
        value={viewRole}
        onChange={(e) => setViewRole(e.target.value)}
      >
        {roles
          .filter((r) => r.key !== 'admin')
          .map((r) => (
            <option key={r.key} value={r.key} className="capitalize">
              {r.name}
            </option>
          ))}
      </select>
      <span className="hidden sm:inline text-amber-800 text-xs truncate">
        — still signed in as admin; everything you do is real
      </span>
      <button
        className="ml-auto shrink-0 rounded-md bg-amber-950 text-amber-50 px-2.5 py-0.5 text-xs font-semibold"
        onClick={() => setViewRole(null)}
      >
        Back to admin
      </button>
    </div>
  );
}

function Wordmark({ compact }: { compact?: boolean }) {
  return <ShotLogLogo size={compact ? 32 : 36} tone="light" />;
}

export function AppShell() {
  useReconnectWatchdog();
  useRoleDefsSync(); // keeps the capability cache live; re-renders nav on change
  useEffect(() => startFileUploader(), []);
  const { theme, toggle } = useTheme();
  const [touring, setTouring] = useState(false);
  const navigate = useNavigate();
  // Walkthrough: anyone can ask for it (startTour from Help/Settings); it
  // also auto-runs ONCE per account, a beat after the first HOME render —
  // never on a deep link (its first step would yank the person home)
  useEffect(() => {
    const open = () => setTouring(true);
    window.addEventListener(START_TOUR_EVENT, open);
    const auto =
      shouldAutoRunTour() && window.location.pathname === '/' ? window.setTimeout(open, 900) : 0;
    return () => {
      window.removeEventListener(START_TOUR_EVENT, open);
      window.clearTimeout(auto);
    };
  }, []);
  // Screen tours (S7c): asked for from Help, or auto-run once per account
  // the first time a screen with a tour opens — a beat after it renders,
  // never on top of the walkthrough, never right after another tour
  const shellLocation = useLocation();
  const [screenTour, setScreenTour] = useState<ScreenTourKey | null>(null);
  useEffect(() => {
    const open = (e: Event) => setScreenTour((e as CustomEvent<ScreenTourKey>).detail);
    window.addEventListener(SCREEN_TOUR_EVENT, open);
    return () => window.removeEventListener(SCREEN_TOUR_EVENT, open);
  }, []);
  useEffect(() => {
    if (touring || screenTour) return;
    if (shellLocation.pathname === '/' && shouldAutoRunTour()) return; // the walkthrough goes first
    const key = screenTourFor(shellLocation.pathname, shellLocation.search, tourBucket());
    if (!key || !shouldAutoRunScreenTour(key)) return;
    const t = window.setTimeout(() => setScreenTour(key), 1400);
    return () => window.clearTimeout(t);
  }, [shellLocation.pathname, shellLocation.search, touring, screenTour]);
  const profile = useLiveQuery(() => db.blasterProfiles.filter((b) => b.isCurrentUser).first());
  const session = getSessionUser();
  const realAdmin = getRealSessionUser()?.role === 'admin';
  const navItems = navItemsForRole();
  const displayName = session?.name || profile?.name || '';
  const displaySub = session
    ? `${session.role.charAt(0).toUpperCase()}${session.role.slice(1)} · ${session.company}`
    : profile?.company || '';

  const initials =
    displayName
      ?.split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Desktop sidebar (wireframe §2.1) ─────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-56 bg-navy text-white z-40">
        <div className="px-4 py-5">
          <Wordmark />
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {navItems.map((item) => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                data-tour={`nav-${item.to}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:text-white hover:bg-white/5',
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            </div>
          ))}
          <HelpMenu
            variant="sidebar"
            onWalkthrough={startTour}
          />
        </nav>
        <div className="px-2 pb-4 space-y-1 border-t border-white/10 pt-3 mx-2">
          {realAdmin && !getViewRole() && <ViewAsSelect />}
          <div className="px-1 py-1 flex items-center gap-2">
            <SyncChip variant="sidebar" />
            <UpdateChip />
          </div>
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:text-white hover:bg-white/5 transition-colors"
            onClick={toggle}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive ? 'bg-white/10' : 'hover:bg-white/5',
              )
            }
            title="My Profile"
          >
            <span className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">
                {displayName || 'Set up profile'}
              </span>
              <span className="block text-[11px] text-navy-200 truncate">{displaySub}</span>
            </span>
          </NavLink>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {/* min-w-0: flex children default to min-width:auto, so one wide widget
          stretches the whole shell past the viewport on phones */}
      <div className="flex-1 min-w-0 lg:pl-56 flex flex-col min-h-screen">
        {/* Installed on a phone: the status bar / notch area, painted navy so
            the header reads as one bar; height 0 in a browser */}
        <div className="lg:hidden bg-navy safe-area-top-strip shrink-0" data-safe-top aria-hidden />
        <RehearsalBar />
        <ViewAsBanner />
        <SessionExpiredBanner />
        <FirstSyncStrip />
        {/* Mobile header */}
        {/* side padding = 1 rem + the device's side inset (landscape corners) */}
        <header className="lg:hidden bg-navy text-white pl-[calc(1rem+var(--sal))] pr-[calc(1rem+var(--sar))] py-3 shadow-md flex items-center justify-between shrink-0">
          <Wordmark compact />
          <div className="flex items-center gap-1">
            <HelpMenu
              variant="header"
              onWalkthrough={startTour}
            />
            <button
              className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-100"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
            </button>
            <UpdateChip />
            <SyncChip variant="badge" />
            <button
              className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold ml-1"
              title="My Profile"
              onClick={() => navigate('/profile')}
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-auto pb-nav-safe lg:pb-4 safe-area-x">
          <Outlet />
        </main>
      </div>

      {touring && <Tour onEnd={() => setTouring(false)} />}
      {!touring && screenTour && <Tour screenKey={screenTour} onEnd={() => setScreenTour(null)} />}
      {import.meta.env.DEV && <CrashProbe />}

      {/* Mobile bottom navigation — each rail's top four, then Settings
          (the phone mirrors the rail, decision 2026-08-18) */}
      <nav
        data-tour="nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom-nav safe-area-x z-50"
      >
        {/* Like a native tab bar: a short body, labels just above the
            home-indicator zone (the inset padding), no dead band under them */}
        <div className="flex items-start justify-around pt-1.5 max-w-lg mx-auto">
          {[
            ...navItems.slice(0, 4),
            ...navItems.filter((i) => i.to === '/settings' || i.to === '/admin'),
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-tour={`nav-${item.to}`}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-start gap-1 px-3 py-0.5 rounded-lg transition-colors min-w-[64px]',
                  isActive ? 'text-navy font-semibold' : 'text-gray-400 hover:text-gray-600',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="text-xs leading-tight text-center">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
