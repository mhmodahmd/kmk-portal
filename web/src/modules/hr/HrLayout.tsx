import { Outlet } from 'react-router-dom';
import { PageHeader } from '../../ui/Display';
import { TabNav } from '../../ui/Controls';
import { useHrMe, useHrRole } from './shared';

export default function HrLayout() {
  const { isHr } = useHrRole();
  const me = useHrMe();
  const items = [
    { to: '/hr', label: 'ملفي', end: true },
    { to: '/hr/leave', label: 'إجازاتي' },
    { to: '/hr/overtime', label: 'العمل الإضافي' },
    ...(me.data?.isManager ? [{ to: '/hr/team', label: 'فريقي' }] : []),
    ...(isHr ? [
      { to: '/hr/employees', label: 'الموظفون' },
      { to: '/hr/requests', label: 'كل الطلبات' },
      { to: '/hr/structure', label: 'الهيكل والإعدادات' }
    ] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="الموظفون" title="الموارد البشرية" />
      <TabNav label="أقسام الموارد البشرية" items={items} />
      <Outlet />
    </div>
  );
}
