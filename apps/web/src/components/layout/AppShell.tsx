import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { CircleHelp, LayoutDashboard, BookOpen, Briefcase, Moon, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme } from '@/hooks/useTheme';
import { Tour } from './Tour';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
  { to: '/reference', icon: BookOpen, label: 'Reference' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppShell() {
  const online = useOnlineStatus();
  const { theme, toggle } = useTheme();
  const [touring, setTouring] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-navy text-white px-4 py-3 shadow-md flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ShotLog</h1>
          <p className="text-sm text-navy-200">Blasting Log & Daily Report</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10 transition-colors"
            title="Take the tour"
            onClick={() => {
              navigate('/');
              setTouring(true);
            }}
          >
            <CircleHelp className="h-5 w-5" />
          </button>
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10 transition-colors"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggle}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Badge variant={online ? 'synced' : 'local'}>
            {online ? 'Online' : 'Offline'}
          </Badge>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {touring && <Tour onEnd={() => setTouring(false)} />}

      {/* Bottom navigation — thumb-friendly */}
      <nav
        data-tour="nav"
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50"
      >
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[64px]',
                  isActive
                    ? 'text-navy font-semibold'
                    : 'text-gray-400 hover:text-gray-600',
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
