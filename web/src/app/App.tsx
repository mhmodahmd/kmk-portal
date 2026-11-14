import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Shell from './Shell';
import LoginPage from './Login';
import ForcedChangePassword from './ChangePassword';
import HomePage from '../modules/home/HomePage';
import { Card, EmptyState, Loader } from '../ui/Display';

// كل وحدة تُحمَّل عند فتحها فقط
const InboxPage = lazy(() => import('../modules/inbox/InboxPage'));
const UsersPage = lazy(() => import('../modules/settings/UsersPage'));
const CompanyPage = lazy(() => import('../modules/settings/CompanyPage'));
const AuditPage = lazy(() => import('../modules/settings/AuditPage'));
const ProfilePage = lazy(() => import('../modules/profile/ProfilePage'));

const AttendanceLayout = lazy(() => import('../modules/attendance/AttendanceLayout'));
const PunchPage = lazy(() => import('../modules/attendance/PunchPage'));
const MyMonthPage = lazy(() => import('../modules/attendance/MyMonthPage'));
const BoardPage = lazy(() => import('../modules/attendance/BoardPage'));
const RecordsPage = lazy(() => import('../modules/attendance/RecordsPage'));
const ReportPage = lazy(() => import('../modules/attendance/ReportPage'));
const EmployeeReportPage = lazy(() => import('../modules/attendance/ReportPage').then((m) => ({ default: m.EmployeeReportPage })));
const CorrectionsPage = lazy(() => import('../modules/attendance/CorrectionsPage'));
const AttSettingsPage = lazy(() => import('../modules/attendance/SettingsPage'));

const HrLayout = lazy(() => import('../modules/hr/HrLayout'));
const MyProfilePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyProfilePage })));
const MyLeavePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyLeavePage })));
const MyOvertimePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyOvertimePage })));
const TeamPage = lazy(() => import('../modules/hr/TeamPage'));
const EmployeesPage = lazy(() => import('../modules/hr/EmployeesPage'));
const RequestsPage = lazy(() => import('../modules/hr/RequestsPage'));
const StructurePage = lazy(() => import('../modules/hr/StructurePage'));

const SOON: Record<string, { label: string; phase: number }> = {
  custody: { label: 'العهد والنثريات', phase: 2 }, tasks: { label: 'المهام', phase: 3 },
  crm: { label: 'العملاء', phase: 4 }, finance: { label: 'المالية', phase: 5 }
};

function Soon({ k }: { k: string }) {
  return <Card><EmptyState title={`${SOON[k].label} قريباً`} body={`تُبنى هذه الوحدة في المرحلة ${SOON[k].phase}. حتى ذلك الحين يستمر العمل على النظام الحالي.`} /></Card>;
}

function UpdateBanner() {
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 bg-accent px-4 py-2.5 text-on-accent">
      <span>يوجد إصدار أحدث من البوابة.</span>
      <button type="button" onClick={() => location.reload()} className="font-bold underline cursor-pointer">تحديث الآن</button>
    </div>
  );
}

export default function App() {
  const { status, user, roles, updateRequired } = useAuth();
  if (status === 'loading') return <div className="min-h-screen bg-bg"><Loader label="جارٍ فتح البوابة" /></div>;
  if (status === 'out') return <LoginPage />;
  if (user?.mustChangePassword) return <ForcedChangePassword />;
  const admin = !!user?.isSuperAdmin;
  const att = admin || !!roles.attendance;
  const hr = admin || !!roles.hr;
  const hrStaff = admin || roles.hr === 'hr';
  const attHr = admin || roles.attendance === 'hr';
  return (
    <HashRouter>
      {updateRequired && <UpdateBanner />}
      <Shell>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            {att && (
              <Route path="/attendance" element={<AttendanceLayout />}>
                <Route index element={<PunchPage />} />
                <Route path="me" element={<MyMonthPage />} />
                <Route path="today" element={<BoardPage />} />
                <Route path="records" element={<RecordsPage />} />
                <Route path="report" element={<ReportPage />} />
                <Route path="report/:id" element={<EmployeeReportPage />} />
                <Route path="corrections" element={<CorrectionsPage />} />
                {attHr && <Route path="settings" element={<AttSettingsPage />} />}
              </Route>
            )}
            {hr && (
              <Route path="/hr" element={<HrLayout />}>
                <Route index element={<MyProfilePage />} />
                <Route path="leave" element={<MyLeavePage />} />
                <Route path="overtime" element={<MyOvertimePage />} />
                <Route path="team" element={<TeamPage />} />
                {hrStaff && <Route path="employees" element={<EmployeesPage />} />}
                {hrStaff && <Route path="requests" element={<RequestsPage />} />}
                {hrStaff && <Route path="structure" element={<StructurePage />} />}
              </Route>
            )}
            {admin && <Route path="/settings/users" element={<UsersPage />} />}
            {admin && <Route path="/settings/company" element={<CompanyPage />} />}
            {admin && <Route path="/settings/audit" element={<AuditPage />} />}
            {Object.keys(SOON).map((k) => <Route key={k} path={'/' + k} element={<Soon k={k} />} />)}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </HashRouter>
  );
}
