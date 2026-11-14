import { Outlet } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { PageHeader } from '../../ui/Display';
import { TabNav } from '../../ui/Controls';
import { useApi } from '../../lib/useApi';
import { useCustodyRole } from './shared';
import type { CusHome } from './types';

export default function CustodyLayout() {
  const { staff, admin } = useCustodyRole();
  const home = useApi<CusHome>('cus.home', {}, { staleTime: 30_000 });
  const s = home.data?.staff;
  const items = [
    { to: '/custody', label: tr("عهدتي"), end: true },
    ...(staff ? [{ to: '/custody/all', label: tr("كل العهد"), badge: s ? s.pendingClose.length + s.awaitingCloseSign.length + s.awaitingOpenSign.length : 0 }] : []),
    { to: '/custody/requests', label: tr("الطلبات"), badge: s?.pendingRequests.length || 0 },
    { to: '/custody/vouchers', label: tr("السندات"), badge: s?.voucherRequests.length || 0 },
    ...(admin ? [{ to: '/custody/settings', label: tr("الإعدادات") }] : [])
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print"><PageHeader eyebrow={tr("المالية")} title={tr("العهد والنثريات")} /></div>
      <div className="no-print"><TabNav label={tr("أقسام العهد")} items={items} /></div>
      <Outlet />
    </div>
  );
}
