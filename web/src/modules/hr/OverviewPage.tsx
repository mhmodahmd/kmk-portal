import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, duration, monthLabel } from '../../lib/format';
import type { ExpiringDoc, LeaveView } from '../../lib/types';
import { Badge, Card, CardHeader, ErrorBox, ListRow } from '../../ui/Display';
import { Bars, Kpi, MiniStats, PanelTitle, StackBar, TrendBars } from '../../ui/Dashboard';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';

interface HrDashboard {
  today: string; scope: 'all' | 'team';
  kpis: { headcount: number; onLeaveToday: number; newHires90: number; newHiresYear: number; terminated: number; pendingLeaves: number; pendingManager: number; pendingOvertime: number; expiring30: number; expiring60: number; expired: number; leaveDaysYear: number; overtimeMinMonth: number; withoutAccount: number };
  byStatus: { status: string; label: string; count: number }[];
  byDepartment: { department: string; count: number }[]; byBranch: { branch: string; count: number }[];
  byNationality: { nationality: string; count: number }[]; byContract: { contract: string; count: number }[];
  leaveByType: { type: string; days: number }[]; hiresByMonth: { month: string; hires: number }[];
  onLeaveToday: LeaveView[]; upcomingLeaves: LeaveView[]; pendingLeaves: LeaveView[]; expiring: ExpiringDoc[];
}

const STATUS_BG: Record<string, string> = { active: 'bg-ok', leave: 'bg-warn', terminated: 'bg-line-strong' };

/** لوحة الموارد البشرية: القوى العاملة، الطلبات المعلقة، الإجازات، المستندات، التعيينات */
export default function HrOverviewPage() {
  const q = useApi<HrDashboard>('hr.dashboard', {}, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const k = d.kpis, total = d.byStatus.reduce((a, s) => a + s.count, 0);
  const leave = (l: LeaveView) => <ListRow key={l.id} title={l.name} sub={`${l.typeName} · ${dmy(l.from)} – ${dmy(l.to)}`} badge={<Badge tone={l.status === 'approved' ? 'ok' : 'warn'}>{l.status === 'approved' ? tr("{0} يوم", l.days) : l.statusLabel}</Badge>} />;
  return (
    <div className="flex flex-col gap-4">
      {d.scope === 'team' && <p className="m-0 text-[13px] text-muted">{tr("تعرض اللوحة فريقك فقط. الموارد البشرية ترى كل الموظفين.")}</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("الموظفون")} value={k.headcount} icon="users" to="/hr/employees" foot={tr("{0} تعيين خلال 90 يوماً · {1} هذه السنة", k.newHires90, k.newHiresYear)} />
        <Kpi label={tr("في إجازة اليوم")} value={k.onLeaveToday} icon="calendar" tone={k.onLeaveToday ? 'warn' : 'info'} foot={tr("{0} يوم إجازة معتمد هذه السنة", k.leaveDaysYear)} />
        <Kpi label={tr("طلبات بانتظار القرار")} value={k.pendingLeaves + k.pendingOvertime} icon="inbox" tone={k.pendingLeaves + k.pendingOvertime ? 'warn' : 'ok'} to="/hr/requests" foot={tr("{0} إجازة ({1} لدى المدير) · {2} عمل إضافي", k.pendingLeaves, k.pendingManager, k.pendingOvertime)} />
        <Kpi label={tr("مستندات تنتهي خلال 60 يوماً")} value={k.expiring60} icon="file" tone={k.expired ? 'bad' : k.expiring30 ? 'warn' : 'ok'} strong to="/hr/employees" foot={k.expired ? tr("{0} منتهية فعلاً · {1} خلال 30 يوماً", k.expired, k.expiring30) : tr("{0} خلال 30 يوماً", k.expiring30)} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("التعيينات · آخر 12 شهراً")} />
          <TrendBars data={d.hiresByMonth} series={[{ key: 'hires', label: tr("تعيينات"), color: 'var(--c-accent)' }]} labelOf={(x) => monthLabel(String(x.month)).replace(/ \d{4}$/, '')} label={tr("التعيينات · آخر 12 شهراً")} height={130} />
          <MiniStats items={[
            { label: tr("عمل إضافي هذا الشهر"), value: duration(k.overtimeMinMonth) }, { label: tr("بلا حساب دخول"), value: k.withoutAccount },
            { label: tr("انتهت خدمتهم"), value: k.terminated }
          ]} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حالة الموظفين")} />
          <StackBar label={tr("حالة الموظفين")} total={total} items={d.byStatus.map((s) => ({ key: s.status, label: s.label, count: s.count, className: STATUS_BG[s.status] || 'bg-chip' }))} />
          <PanelTitle title={tr("حسب القسم")} />
          <Bars rows={d.byDepartment.map((x) => ({ key: x.department, label: x.department, value: x.count }))} />
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card padded={false}>
          <CardHeader title={tr("في إجازة اليوم · {0}", k.onLeaveToday)} />
          {d.onLeaveToday.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("الجميع على رأس العمل.")}</p> : d.onLeaveToday.map(leave)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("إجازات خلال أسبوعين")} />
          {d.upcomingLeaves.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا إجازات قادمة.")}</p> : d.upcomingLeaves.map(leave)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("طلبات إجازة معلقة")} action={<Link to="/hr/requests" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل الطلبات")}</Link>} />
          {d.pendingLeaves.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا طلبات معلقة.")}</p> : d.pendingLeaves.map(leave)}
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card padded={false}>
          <CardHeader title={tr("مستندات قاربت على الانتهاء")} action={<Link to="/hr/employees" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("دليل الموظفين")}</Link>} />
          {d.expiring.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا مستندات قريبة الانتهاء.")}</p> : d.expiring.map((x) => (
            <ListRow key={x.employeeId + x.field} title={x.name} sub={`${x.doc} · ${dmy(x.date)}`} badge={<Badge tone={x.daysLeft < 0 ? 'bad' : 'warn'}>{x.daysLeft < 0 ? tr("منتهية") : tr("{0} يوم", x.daysLeft)}</Badge>} />
          ))}
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("أيام الإجازة هذه السنة حسب النوع")} />
          <Bars empty={tr("لا إجازات معتمدة هذه السنة")} rows={d.leaveByType.map((x) => ({ key: x.type, label: x.type, value: x.days, display: tr("{0} يوم", x.days), tone: 'warn' }))} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("الجنسيات والعقود")} />
          <Bars empty={tr("لا بيانات")} rows={d.byNationality.map((x) => ({ key: 'n' + x.nationality, label: x.nationality || tr("غير محدد"), value: x.count }))} />
          {d.byContract.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">{d.byContract.map((c) => <span key={c.contract} className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[12px]">{c.contract || tr("بلا نوع عقد")}<b className="num">{c.count}</b></span>)}</div>}
        </Card>
      </div>
    </div>
  );
}
