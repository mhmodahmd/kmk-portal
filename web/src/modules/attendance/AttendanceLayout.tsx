import { Outlet } from 'react-router-dom';
import { PageHeader } from '../../ui/Display';
import { TabNav } from '../../ui/Controls';
import { useAttendanceScope } from './shared';

export default function AttendanceLayout() {
  const { canSeeTeam, isHr } = useAttendanceScope();
  const items = [
    { to: '/attendance', label: 'البصمة', end: true },
    { to: '/attendance/me', label: 'سجلي' },
    ...(canSeeTeam ? [
      { to: '/attendance/today', label: 'حضور اليوم' },
      { to: '/attendance/records', label: 'السجل' },
      { to: '/attendance/report', label: 'التقرير الشهري' }
    ] : []),
    { to: '/attendance/corrections', label: 'التصحيحات' },
    ...(isHr ? [{ to: '/attendance/settings', label: 'الإعدادات' }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print"><PageHeader eyebrow="الموظفون" title="الحضور والانصراف" /></div>
      <TabNav label="أقسام الحضور" items={items} />
      <Outlet />
    </div>
  );
}
