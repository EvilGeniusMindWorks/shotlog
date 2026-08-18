import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Dashboard, WorkDaysPage } from '@/pages/Dashboard';
import { BlastDayPage } from '@/pages/BlastDayPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { CustomerPage } from '@/pages/CustomerPage';
import { SitePage } from '@/pages/SitePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ReferencePage } from '@/pages/ReferencePage';
import { DesignPlanPage } from '@/pages/DesignPlanPage';
import { SeismoPage } from '@/pages/SeismoPage';
import { PrintBlastLogPage } from '@/pages/PrintBlastLogPage';
import { PrintDailyReportPage } from '@/pages/PrintDailyReportPage';
import { BlastReportPage } from '@/pages/BlastReportPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminPeoplePage } from '@/pages/admin/AdminPeoplePage';
import { AdminApprovalsPage } from '@/pages/admin/AdminApprovalsPage';
import { AdminCatalogPage } from '@/pages/admin/AdminCatalogPage';
import { AdminCompanyPage } from '@/pages/admin/AdminCompanyPage';
import { AdminEquipmentPage } from '@/pages/admin/AdminEquipmentPage';
import { EnrollPage } from '@/pages/EnrollPage';
import { DrillLogPage } from '@/pages/DrillLogPage';
import { DrillPlanPage } from '@/pages/DrillPlanPage';
import { MyRecordsPage } from '@/pages/MyRecordsPage';
import { CompanyRecordsPage } from '@/pages/CompanyRecordsPage';
import { EquipmentPage } from '@/pages/EquipmentPage';
import { CrewPage } from '@/pages/CrewPage';
import { SubmitDayPage } from '@/pages/SubmitDayPage';
import { SubmitDrillLogPage } from '@/pages/SubmitDrillLogPage';
import { PrintDrillChecklistPage, FileDrillChecklistPage } from '@/pages/PrintDrillChecklistPage';
import { PrintIncidentPage, SubmitIncidentPage } from '@/pages/PrintIncidentPage';
import { PrintDrillLogPage } from '@/pages/PrintDrillLogPage';
import { DrillChecklistPage } from '@/pages/DrillChecklistPage';
import { IncidentPage } from '@/pages/IncidentPage';
import { AdminIncidentsPage } from '@/pages/admin/AdminIncidentsPage';
import { Navigate } from 'react-router-dom';
import { getSessionUser } from '@/lib/session';
import { hasCap } from '@/lib/perms';
import { AdminRolesPage } from '@/pages/admin/AdminRolesPage';
import { UndoToastHost } from '@/components/ui/undo-toast';

function AdminIndexRedirect() {
  const role = getSessionUser()?.role;
  // First area the role can actually use (capability-resolved for
  // custom roles; built-ins keep their familiar landing tab)
  const target =
    role === 'supervisor' ? '/admin/approvals'
    : role === 'mechanic' ? '/admin/equipment'
    : role === 'office' ? '/admin/incidents'
    : role === 'admin' ? '/admin/people'
    : hasCap('manage_people') ? '/admin/people'
    : hasCap('approve_days') ? '/admin/approvals'
    : hasCap('manage_equipment') ? '/admin/equipment'
    : hasCap('process_incidents') ? '/admin/incidents'
    : '/admin/people';
  return <Navigate to={target} replace />;
}

/** /records: company-wide record book for admin/office/supervisor, the
 *  personal My Records page for field roles */
function RecordsRouter() {
  const role = getSessionUser()?.role;
  return role === 'admin' || role === 'office' || role === 'supervisor' ? (
    <CompanyRecordsPage />
  ) : (
    <MyRecordsPage />
  );
}

export function App() {
  // Public enrollment route — the ONLY page outside the auth gate: a crew
  // member with an invite link has no account yet by definition
  if (window.location.pathname.startsWith('/enroll/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/enroll/:token" element={<EnrollPage />} />
          <Route path="*" element={<EnrollPage />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return (
    <AuthGate>
    <UndoToastHost />
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/days" element={<WorkDaysPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/customers/:id" element={<CustomerPage />} />
          <Route path="/sites/:id" element={<SitePage />} />
          <Route path="/reference" element={<ReferencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/blast-day/:id" element={<BlastDayPage />} />
          <Route path="/blast-day/:id/design/:shotId" element={<DesignPlanPage />} />
          <Route path="/blast-day/:id/seismo/:shotId" element={<SeismoPage />} />
          <Route path="/blast-day/:id/drill-log/:logId" element={<DrillLogPage />} />
          <Route path="/jobs/:jobId/drill-plan/:planId" element={<DrillPlanPage />} />
          <Route path="/jobs/:jobId/drill-plan/:planId/log/:logId" element={<DrillLogPage />} />
          <Route path="/records" element={<RecordsRouter />} />
          <Route path="/drill-logs" element={<MyRecordsPage />} />
          <Route path="/equipment/:id" element={<EquipmentPage />} />
          <Route path="/crew/:id" element={<CrewPage />} />
          <Route path="/drill-checklist/:equipmentId" element={<DrillChecklistPage />} />
          <Route path="/incident/:incidentId" element={<IncidentPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminIndexRedirect />} />
            <Route path="people" element={<AdminPeoplePage />} />
            <Route path="users" element={<Navigate to="/admin/people" replace />} />
            <Route path="approvals" element={<AdminApprovalsPage />} />
            <Route path="catalog" element={<AdminCatalogPage />} />
            <Route path="equipment" element={<AdminEquipmentPage />} />
            <Route path="incidents" element={<AdminIncidentsPage />} />
            <Route path="roles" element={<AdminRolesPage />} />
            <Route path="company" element={<AdminCompanyPage />} />
          </Route>
        </Route>
        <Route path="/blast-day/:id/submit" element={<SubmitDayPage />} />
        <Route path="/blast-day/:id/drill-log/:logId/submit" element={<SubmitDrillLogPage />} />
        <Route path="/jobs/:jobId/drill-plan/:planId/log/:logId/submit" element={<SubmitDrillLogPage />} />
        <Route path="/drill-checklist-print/:checklistId" element={<PrintDrillChecklistPage />} />
        <Route path="/drill-checklist-file/:checklistId" element={<FileDrillChecklistPage />} />
        <Route path="/incident/:incidentId/print" element={<PrintIncidentPage />} />
        <Route path="/incident/:incidentId/submit" element={<SubmitIncidentPage />} />
        <Route path="/blast-day/:id/print" element={<PrintBlastLogPage />} />
        <Route path="/blast-day/:id/drill-log/:logId/print" element={<PrintDrillLogPage />} />
        <Route path="/jobs/:jobId/drill-plan/:planId/log/:logId/print" element={<PrintDrillLogPage />} />
        <Route path="/blast-day/:id/print-daily" element={<PrintDailyReportPage />} />
        <Route path="/blast-day/:id/report" element={<BlastReportPage />} />
      </Routes>
    </BrowserRouter>
    </AuthGate>
  );
}
