import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CircleHelp,
  LayoutDashboard,
  BookOpen,
  Briefcase,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { db } from '@/db';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme } from '@/hooks/useTheme';
import { getSessionUser } from '@/lib/sync';
import { Tour } from './Tour';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/reference', icon: BookOpen, label: 'Reference' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 200 200" className={compact ? 'h-8 w-8' : 'h-9 w-9'} aria-hidden>
        <rect width="200" height="200" rx="44" fill="#DD6B20" />
        <g transform="translate(100,100)">
          <circle cx="0" cy="0" r="50" fill="none" stroke="#fff" strokeWidth="4" opacity="0.3" />
          <line x1="0" y1="-12" x2="0" y2="-34" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <line x1="0" y1="12" x2="0" y2="34" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <line x1="-12" y1="0" x2="-34" y2="0" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <line x1="12" y1="0" x2="12" y2="0" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <line x1="12" y1="0" x2="34" y2="0" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="13" fill="#fff" />
          <circle cx="0" cy="0" r="8" fill="#F6AD55" />
          <circle cx="0" cy="0" r="4" fill="#1a365d" />
        </g>
      </svg>
      <span className="text-lg tracking-widest leading-none">
        <span className="font-light">SHOT</span>
        <span className="font-extrabold text-safety-orange">LOG</span>
      </span>
    </div>
  );
}

export function AppShell() {
  const online = useOnlineStatus();
  const { theme, toggle } = useTheme();
  const [touring, setTouring] = useState(false);
  const navigate = useNavigate();
  const profile = useLiveQuery(() => db.blasterProfiles.filter((b) => b.isCurrentUser).first());
  const session = getSessionUser();
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
            <NavLink
              key={item.to}
              to={item.to}
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
          ))}
          <button
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-navy-200 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => {
              navigate('/');
              setTouring(true);
            }}
          >
            <CircleHelp className="h-5 w-5" />
            Walkthrough
          </button>
        </nav>
        <div className="px-2 pb-4 space-y-1 border-t border-white/10 pt-3 mx-2">
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
      <div className="flex-1 lg:pl-56 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden bg-navy text-white px-4 py-3 shadow-md flex items-center justify-between shrink-0">
          <Wordmark compact />
          <div className="flex items-center gap-1">
            <button
              className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200"
              title="Walkthrough"
              onClick={() => {
                navigate('/');
                setTouring(true);
              }}
            >
              <CircleHelp className="h-5 w-5" />
            </button>
            <button
              className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <Badge variant={online ? 'synced' : 'local'}>{online ? 'Online' : 'Offline'}</Badge>
            <button
              className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold ml-1"
              title="My Profile"
              onClick={() => navigate('/profile')}
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 lg:pb-4">
          <Outlet />
        </main>
      </div>

      {touring && <Tour onEnd={() => setTouring(false)} />}

      {/* Mobile bottom navigation */}
      <nav
        data-tour="nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50"
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]',
                  isActive ? 'text-navy font-semibold' : 'text-gray-400 hover:text-gray-600',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
