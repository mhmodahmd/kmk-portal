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

const SOON: Record<string, { label: string; phase: number }> = {
  attendance: { label: 'الحضور والانصراف', phase: 1 }, hr: { label: 'الموارد البشرية', phase: 1 },
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
  const { status, user, updateRequired } = useAuth();
  if (status === 'loading') return <div className="min-h-screen bg-bg"><Loader label="جارٍ فتح البوابة" /></div>;
  if (status === 'out') return <LoginPage />;
  if (user?.mustChangePassword) return <ForcedChangePassword />;
  const admin = !!user?.isSuperAdmin;
  return (
    <HashRouter>
      {updateRequired && <UpdateBanner />}
      <Shell>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/profile" element={<ProfilePage />} />
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
