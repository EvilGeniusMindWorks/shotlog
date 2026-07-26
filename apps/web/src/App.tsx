import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Dashboard } from '@/pages/Dashboard';
import { BlastDayPage } from '@/pages/BlastDayPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ReferencePage } from '@/pages/ReferencePage';
import { DesignPlanPage } from '@/pages/DesignPlanPage';
import { SeismoPage } from '@/pages/SeismoPage';
import { PrintBlastLogPage } from '@/pages/PrintBlastLogPage';
import { PrintDailyReportPage } from '@/pages/PrintDailyReportPage';
import { BlastReportPage } from '@/pages/BlastReportPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminApprovalsPage } from '@/pages/admin/AdminApprovalsPage';
import { AdminCatalogPage } from '@/pages/admin/AdminCatalogPage';
import { Navigate } from 'react-router-dom';
import { getSessionUser } from '@/lib/session';

function AdminIndexRedirect() {
  const role = getSessionUser()?.role;
  return <Navigate to={role === 'supervisor' ? '/admin/approvals' : '/admin/users'} replace />;
}

export function App() {
  return (
    <AuthGate>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/reference" element={<ReferencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/blast-day/:id" element={<BlastDayPage />} />
          <Route path="/blast-day/:id/design/:shotId" element={<DesignPlanPage />} />
          <Route path="/blast-day/:id/seismo/:shotId" element={<SeismoPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminIndexRedirect />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="approvals" element={<AdminApprovalsPage />} />
            <Route path="catalog" element={<AdminCatalogPage />} />
          </Route>
        </Route>
        <Route path="/blast-day/:id/print" element={<PrintBlastLogPage />} />
        <Route path="/blast-day/:id/print-daily" element={<PrintDailyReportPage />} />
        <Route path="/blast-day/:id/report" element={<BlastReportPage />} />
      </Routes>
    </BrowserRouter>
    </AuthGate>
  );
}
