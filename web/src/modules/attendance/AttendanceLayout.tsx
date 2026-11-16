import { tr } from '../../lib/i18n';
import { Outlet } from 'react-router-dom';
import { PageHeader } from '../../ui/Display';
import { TabNav } from '../../ui/Controls';
import { useAttendanceScope } from './shared';

export default function AttendanceLayout() {
  const { canSeeTeam, isHr } = useAttendanceScope();
  const items = [
    { to: '/attendance', label: tr("تسجيل الحضور"), end: true },
    { to: '/attendance/me', label: tr("سجلي") },
    ...(canSeeTeam ? [
      { to: '/attendance/overview', label: tr("نظرة عامة") },
      { to: '/attendance/today', label: tr("حضور اليوم") },
      { to: '/attendance/records', label: tr("السجل") },
      { to: '/attendance/report', label: tr("التقرير الشهري") }
    ] : []),
    { to: '/attendance/corrections', label: tr("التصحيحات") },
    ...(isHr ? [{ to: '/attendance/settings', label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print"><PageHeader eyebrow={tr("الموظفون")} title={tr("الحضور والانصراف")} /></div>
      <TabNav label={tr("أقسام الحضور")} items={items} />
      <Outlet />
    </div>
  );
}
