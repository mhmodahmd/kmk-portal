import { tr } from '../lib/i18n';
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
const CrmImportPage = lazy(() => import('../modules/settings/CrmImportPage'));
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
const AttOverviewPage = lazy(() => import('../modules/attendance/OverviewPage'));

const HrLayout = lazy(() => import('../modules/hr/HrLayout'));
const HrIndex = lazy(() => import('../modules/hr/HrLayout').then((m) => ({ default: m.HrIndex })));
const MyProfilePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyProfilePage })));
const MyLeavePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyLeavePage })));
const MyOvertimePage = lazy(() => import('../modules/hr/MyHrPages').then((m) => ({ default: m.MyOvertimePage })));
const TeamPage = lazy(() => import('../modules/hr/TeamPage'));
const EmployeesPage = lazy(() => import('../modules/hr/EmployeesPage'));
const RequestsPage = lazy(() => import('../modules/hr/RequestsPage'));
const StructurePage = lazy(() => import('../modules/hr/StructurePage'));
const HrOverviewPage = lazy(() => import('../modules/hr/OverviewPage'));

const CustodyLayout = lazy(() => import('../modules/custody/CustodyLayout'));
const MyCustodyPage = lazy(() => import('../modules/custody/MyCustodyPage'));
const CustodiesPage = lazy(() => import('../modules/custody/CustodiesPage'));
const CustodyDetailPage = lazy(() => import('../modules/custody/CustodyDetailPage'));
const CusRequestsPage = lazy(() => import('../modules/custody/RequestsVouchersPages').then((m) => ({ default: m.CusRequestsPage })));
const VouchersPage = lazy(() => import('../modules/custody/RequestsVouchersPages').then((m) => ({ default: m.VouchersPage })));
const VoucherPrintPage = lazy(() => import('../modules/custody/Documents').then((m) => ({ default: m.VoucherPrintPage })));
const StatementPrintPage = lazy(() => import('../modules/custody/Documents').then((m) => ({ default: m.StatementPrintPage })));
const CusSettingsPage = lazy(() => import('../modules/custody/CusSettingsPage'));
const CustodyOverviewPage = lazy(() => import('../modules/custody/OverviewPage'));
const SignPage = lazy(() => import('../modules/custody/SignPage'));

const TasksLayout = lazy(() => import('../modules/tasks/TasksPages').then((m) => ({ default: m.TasksLayout })));
const MyTasksPage = lazy(() => import('../modules/tasks/TasksPages').then((m) => ({ default: m.MyTasksPage })));
const TaskListPage = lazy(() => import('../modules/tasks/TasksPages').then((m) => ({ default: m.TaskListPage })));
const TaskBoardPage = lazy(() => import('../modules/tasks/BoardPage'));
const TaskDetailPage = lazy(() => import('../modules/tasks/TaskDetailPage'));
const TasksOverviewPage = lazy(() => import('../modules/tasks/OverviewPage'));
const TaskBrowsePage = lazy(() => import('../modules/tasks/TasksPages').then((m) => ({ default: m.TaskBrowsePage })));

const CrmLayout = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.CrmLayout })));
const CrmHomePage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.CrmHomePage })));
const ClientsPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.ClientsPage })));
const PipelinePage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.PipelinePage })));
const CrmProjectsPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.ProjectsPage })));
const CrmPaymentsPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.PaymentsPage })));
const ProposalsPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.ProposalsPage })));
const ActivitiesPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.ActivitiesPage })));
const CrmReportsPage = lazy(() => import('../modules/crm/CrmPages').then((m) => ({ default: m.ReportsPage })));
const ClientPage = lazy(() => import('../modules/crm/DetailPages').then((m) => ({ default: m.ClientPage })));
const CrmProjectPage = lazy(() => import('../modules/crm/DetailPages').then((m) => ({ default: m.ProjectPage })));

const CorLayout = lazy(() => import('../modules/correspondence/CorPages').then((m) => ({ default: m.CorLayout })));
const LettersPage = lazy(() => import('../modules/correspondence/CorPages').then((m) => ({ default: m.LettersPage })));
const CorReportPage = lazy(() => import('../modules/correspondence/CorPages').then((m) => ({ default: m.CorReportPage })));
const CorSettingsPage = lazy(() => import('../modules/correspondence/CorSettingsPage'));
const CorDashboardPage = lazy(() => import('../modules/correspondence/CorDashboardPage'));
const LetterDetailPage = lazy(() => import('../modules/correspondence/LetterDetailPage'));
const PltLayout = lazy(() => import('../modules/platforms/shared').then((m) => ({ default: m.PltLayout })));
const PltOverviewPage = lazy(() => import('../modules/platforms/OverviewPage'));
const SalesMonthsPage = lazy(() => import('../modules/platforms/SalesPages').then((m) => ({ default: m.SalesMonthsPage })));
const SalesMonthPage = lazy(() => import('../modules/platforms/SalesPages').then((m) => ({ default: m.SalesMonthPage })));
const CentersPage = lazy(() => import('../modules/platforms/CentersPages').then((m) => ({ default: m.CentersPage })));
const CampaignsPage = lazy(() => import('../modules/platforms/CentersPages').then((m) => ({ default: m.CampaignsPage })));
const PltSettingsPage = lazy(() => import('../modules/platforms/PltSettingsPage'));
const SubLayout = lazy(() => import('../modules/subscribers/SubPages').then((m) => ({ default: m.SubLayout })));
const SubOverviewPage = lazy(() => import('../modules/subscribers/SubPages').then((m) => ({ default: m.SubOverviewPage })));
const SubListPage = lazy(() => import('../modules/subscribers/SubPages').then((m) => ({ default: m.SubListPage })));
const SubDetailPage = lazy(() => import('../modules/subscribers/SubPages').then((m) => ({ default: m.SubDetailPage })));
const SubSettingsPage = lazy(() => import('../modules/subscribers/SubPages').then((m) => ({ default: m.SubSettingsPage })));

const SOON: Record<string, { label: string; phase: number }> = {
  finance: { label: tr("المالية"), phase: 5 }
};

function Soon({ k }: { k: string }) {
  return <Card><EmptyState title={tr("{0} قريباً", SOON[k].label)} body={tr("تُبنى هذه الوحدة في المرحلة {0}. حتى ذلك الحين يستمر العمل على النظام الحالي.", SOON[k].phase)} /></Card>;
}

function UpdateBanner() {
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 bg-accent px-4 py-2.5 text-on-accent">
      <span>{tr("يوجد إصدار أحدث من البوابة.")}</span>
      <button type="button" onClick={() => location.reload()} className="font-bold underline cursor-pointer">{tr("تحديث الآن")}</button>
    </div>
  );
}

export default function App() {
  const { status, user, roles, updateRequired } = useAuth();
  // صفحة توقيع المدير تُفتح بلا حساب: #/sign/<الرمز>
  const sign = /^#\/sign\/([0-9a-f]{64})$/.exec(location.hash);
  if (sign) return <Suspense fallback={<Loader />}><SignPage token={sign[1]} /></Suspense>;
  if (status === 'loading') return <div className="min-h-screen bg-bg"><Loader label={tr("جارٍ فتح البوابة")} /></div>;
  if (status === 'out') return <LoginPage />;
  if (user?.mustChangePassword) return <ForcedChangePassword />;
  const admin = !!user?.isSuperAdmin;
  const att = admin || !!roles.attendance;
  const hr = admin || !!roles.hr;
  const hrStaff = admin || roles.hr === 'hr';
  const attHr = admin || roles.attendance === 'hr';
  const cus = admin || !!roles.custody;
  const cusStaff = admin || roles.custody === 'accountant';
  const tasks = admin || !!roles.tasks;
  const crm = admin || !!roles.crm;
  const cor = admin || !!roles.correspondence;
  const corMgr = admin || roles.correspondence === 'manager';
  const plt = admin || !!roles.platforms;
  const pltMgr = admin || roles.platforms === 'manager';
  const sub = admin || !!roles.subscribers;
  const subStaff = admin || roles.subscribers === 'agent' || roles.subscribers === 'manager';
  const subMgr = admin || roles.subscribers === 'manager';
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
                <Route path="overview" element={<AttOverviewPage />} />
                {attHr && <Route path="settings" element={<AttSettingsPage />} />}
              </Route>
            )}
            {hr && (
              <Route path="/hr" element={<HrLayout />}>
                <Route index element={<HrIndex />} />
                <Route path="me" element={<MyProfilePage />} />
                <Route path="leave" element={<MyLeavePage />} />
                <Route path="overtime" element={<MyOvertimePage />} />
                <Route path="team" element={<TeamPage />} />
                {hrStaff && <Route path="employees" element={<EmployeesPage />} />}
                {hrStaff && <Route path="requests" element={<RequestsPage />} />}
                {hrStaff && <Route path="structure" element={<StructurePage />} />}
                <Route path="overview" element={<HrOverviewPage />} />
              </Route>
            )}
            {cus && (
              <Route path="/custody" element={<CustodyLayout />}>
                <Route index element={<MyCustodyPage />} />
                {cusStaff && <Route path="all" element={<CustodiesPage />} />}
                {cusStaff && <Route path="overview" element={<CustodyOverviewPage />} />}
                <Route path="requests" element={<CusRequestsPage />} />
                <Route path="vouchers" element={<VouchersPage />} />
                {admin && <Route path="settings" element={<CusSettingsPage />} />}
                <Route path="print/voucher/:id" element={<VoucherPrintPage />} />
                <Route path="print/statement/:id" element={<StatementPrintPage />} />
                <Route path=":id" element={<CustodyDetailPage />} />
              </Route>
            )}
            {tasks && (
              <Route path="/tasks" element={<TasksLayout />}>
                <Route index element={<MyTasksPage />} />
                <Route path="board" element={<TaskBoardPage />} />
                <Route path="overview" element={<TasksOverviewPage />} />
                <Route path="browse" element={<TaskBrowsePage />} />
                <Route path="assigned" element={<TaskListPage view="created" />} />
                <Route path="watching" element={<TaskListPage view="watching" />} />
                <Route path="team" element={<TaskListPage view="team" />} />
                <Route path="all" element={<TaskListPage view="all" />} />
                <Route path=":id" element={<TaskDetailPage />} />
              </Route>
            )}
            {crm && (
              <Route path="/crm" element={<CrmLayout />}>
                <Route index element={<CrmHomePage />} />
                <Route path="clients" element={<ClientsPage />} />
                <Route path="clients/:id" element={<ClientPage />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="projects" element={<CrmProjectsPage />} />
                <Route path="projects/:id" element={<CrmProjectPage />} />
                <Route path="payments" element={<CrmPaymentsPage />} />
                <Route path="proposals" element={<ProposalsPage />} />
                <Route path="activities" element={<ActivitiesPage />} />
                <Route path="reports" element={<CrmReportsPage />} />
              </Route>
            )}
            {cor && (
              <Route path="/correspondence" element={<CorLayout />}>
                <Route index element={<CorDashboardPage />} />
                <Route path="in" element={<LettersPage view="in" />} />
                <Route path="out" element={<LettersPage view="out" />} />
                <Route path="archive" element={<LettersPage view="archive" />} />
                <Route path="report" element={<CorReportPage />} />
                {corMgr && <Route path="settings" element={<CorSettingsPage />} />}
                <Route path=":id" element={<LetterDetailPage />} />
              </Route>
            )}
            {plt && (
              <Route path="/platforms" element={<PltLayout />}>
                <Route index element={<PltOverviewPage />} />
                <Route path="sales" element={<SalesMonthsPage />} />
                <Route path="sales/:month" element={<SalesMonthPage />} />
                <Route path="centers" element={<CentersPage />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                {pltMgr && <Route path="settings" element={<PltSettingsPage />} />}
              </Route>
            )}
            {sub && (
              <Route path="/subscribers" element={<SubLayout />}>
                <Route index element={<SubOverviewPage />} />
                {subStaff && <Route path="list" element={<SubListPage />} />}
                {subStaff && <Route path="s/:ref" element={<SubDetailPage />} />}
                {subMgr && <Route path="settings" element={<SubSettingsPage />} />}
              </Route>
            )}
            {admin && <Route path="/settings/users" element={<UsersPage />} />}
            {admin && <Route path="/settings/company" element={<CompanyPage />} />}
            {admin && <Route path="/settings/audit" element={<AuditPage />} />}
            {admin && <Route path="/settings/crm-import" element={<CrmImportPage />} />}
            {Object.keys(SOON).map((k) => <Route key={k} path={'/' + k} element={<Soon k={k} />} />)}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </HashRouter>
  );
}
