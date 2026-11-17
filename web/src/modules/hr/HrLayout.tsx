import { tr } from '../../lib/i18n';
import { Navigate, Outlet } from 'react-router-dom';
import { MyProfilePage } from './MyHrPages';
import { PageHeader } from '../../ui/Display';
import { TabNav } from '../../ui/Controls';
import { useHrMe, useHrRole } from './shared';

export default function HrLayout() {
  const { isHr } = useHrRole();
  const me = useHrMe();
  const overview = isHr || !!me.data?.isManager;
  const items = [
    ...(overview ? [{ to: '/hr/overview', label: tr("نظرة عامة") }] : []),
    { to: overview ? '/hr/me' : '/hr', label: tr("ملفي"), end: true },
    { to: '/hr/leave', label: tr("إجازاتي") },
    { to: '/hr/overtime', label: tr("العمل الإضافي") },
    ...(me.data?.isManager ? [{ to: '/hr/team', label: tr("فريقي") }] : []),
    ...(isHr ? [
      { to: '/hr/employees', label: tr("الموظفون") },
      { to: '/hr/requests', label: tr("كل الطلبات") },
      { to: '/hr/structure', label: tr("الهيكل والإعدادات") }
    ] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={tr("الموظفون")} title={tr("الموارد البشرية")} />
      <TabNav label={tr("أقسام الموارد البشرية")} items={items} />
      <Outlet />
    </div>
  );
}

/** مدخل الموارد البشرية: «نظرة عامة» لمن يراها، و«ملفي» لغيره */
export function HrIndex() {
  const { isHr } = useHrRole();
  const me = useHrMe();
  if (isHr || me.data?.isManager) return <Navigate to="/hr/overview" replace />;
  return <MyProfilePage />;
}
