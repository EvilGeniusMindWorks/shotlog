import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { BlastDayPage } from '@/pages/BlastDayPage';
import { JobsPage } from '@/pages/JobsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/blast-day/:id" element={<BlastDayPage />} />
      </Routes>
    </BrowserRouter>
  );
}
