import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { BlastDayPage } from '@/pages/BlastDayPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ReferencePage } from '@/pages/ReferencePage';
import { DesignPlanPage } from '@/pages/DesignPlanPage';
import { SeismoPage } from '@/pages/SeismoPage';
import { PrintBlastLogPage } from '@/pages/PrintBlastLogPage';
import { PrintDailyReportPage } from '@/pages/PrintDailyReportPage';
import { BlastReportPage } from '@/pages/BlastReportPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/reference" element={<ReferencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/blast-day/:id" element={<BlastDayPage />} />
        <Route path="/blast-day/:id/design/:shotId" element={<DesignPlanPage />} />
        <Route path="/blast-day/:id/seismo/:shotId" element={<SeismoPage />} />
        <Route path="/blast-day/:id/print" element={<PrintBlastLogPage />} />
        <Route path="/blast-day/:id/print-daily" element={<PrintDailyReportPage />} />
        <Route path="/blast-day/:id/report" element={<BlastReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
