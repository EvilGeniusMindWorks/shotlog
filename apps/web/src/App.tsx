import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { BlastDayPage } from '@/pages/BlastDayPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { PrintBlastLogPage } from '@/pages/PrintBlastLogPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/blast-day/:id" element={<BlastDayPage />} />
        <Route path="/blast-day/:id/print" element={<PrintBlastLogPage />} />
      </Routes>
    </BrowserRouter>
  );
}
