import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, duration, kwMonth, monthLabel } from '../../lib/format';
import { Badge, Card, EmptyState, ErrorBox } from '../../ui/Display';
import { MonthPicker } from '../../ui/Controls';
import { Bars, Kpi, Legend, MiniStats, PanelTitle, TrendBars } from '../../ui/Dashboard';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';

interface AttDashboard {
  month: string; today: string; scope: 'all' | 'team'; employees: number;
  todayCounts: Record<'in' | 'out' | 'absent' | 'none' | 'leave' | 'off' | 'total' | 'late', number>;
  kpis: { presentDays: number; absentDays: number; lateDays: number; lateMin: number; earlyMin: number; overtimeMin: number; incomplete: number; leaveDays: number; totalMinutes: number; attendanceRate: number | null; punctualityRate: number | null; pendingCorrections: number };
  byDay: { date: string; day: string; present: number; late: number; absent: number; leave: number }[];
  byDepartment: { department: string; employees: number; present: number; absent: number; late: number; rate: number | null }[];
  topLate: Person[]; topAbsent: Person[]; topOvertime: Person[];
}
interface Person { employeeId: string; name: string; lateDays: number; lateMin: number; absentDays: number; overtimeMin: number }

const SERIES = [{ key: 'present', label: tr("حاضر"), color: 'var(--c-ok)' }, { key: 'late', label: tr("متأخر"), color: 'var(--c-warn)' }, { key: 'absent', label: tr("غائب"), color: 'var(--c-bad)' }];

/** لوحة الحضور للمديرين والموارد البشرية: اليوم، الشهر، الاتجاه اليومي، الأقسام، الأكثر تأخراً وغياباً */
export default function AttendanceOverviewPage() {
  const [month, setMonth] = useState(kwMonth());
  const q = useApi<AttDashboard>('att.dashboard', { month }, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  const k = d?.kpis, t = d?.todayCounts;
  const pct = (v: number | null) => (v === null ? '—' : v + '%');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={setMonth} max={kwMonth()} />
        {d && <span className="text-[13px] text-muted">{d.scope === 'team' ? tr("فريقك · {0} موظف", d.employees) : tr("كل الموظفين · {0}", d.employees)}</span>}
      </div>
      {!d || !k || !t ? <DashboardSkeleton /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label={tr("حاضرون الآن")} value={t.in} icon="login" tone="ok" to="/attendance/today" foot={tr("{0} انصرفوا · {1} لم يسجّلوا بعد", t.out, t.none)} />
            <Kpi label={tr("غائبون اليوم")} value={t.absent} icon="alert" tone={t.absent ? 'bad' : 'ok'} strong to="/attendance/today" foot={tr("{0} في إجازة · {1} متأخرون", t.leave, t.late)} />
            <Kpi label={tr("نسبة الحضور · {0}", monthLabel(month))} value={pct(k.attendanceRate)} icon="check" tone={k.attendanceRate !== null && k.attendanceRate < 90 ? 'warn' : 'ok'} foot={tr("{0} يوم حضور · {1} يوم غياب", k.presentDays, k.absentDays)} />
            <Kpi label={tr("الالتزام بالوقت")} value={pct(k.punctualityRate)} icon="clock" tone={k.punctualityRate !== null && k.punctualityRate < 80 ? 'warn' : 'info'} foot={tr("{0} يوم تأخير · {1}", k.lateDays, duration(k.lateMin))} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الحضور اليومي · {0}", monthLabel(month))} action={<Legend series={SERIES} />} />
              {d.byDay.length === 0 ? <EmptyState title={tr("لا أيام عمل بعد في هذا الشهر")} /> : (
                <TrendBars data={d.byDay} series={SERIES} labelOf={(x) => dmy(String(x.date)).slice(0, 5)} label={tr("الحضور اليومي")} />
              )}
              <MiniStats items={[
                { label: tr("ساعات العمل"), value: duration(k.totalMinutes) }, { label: tr("عمل إضافي"), value: duration(k.overtimeMin) },
                { label: tr("انصراف مبكر"), value: duration(k.earlyMin) }, { label: tr("بلا انصراف"), value: k.incomplete }
              ]} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("حسب القسم")} action={<span className="text-[12px] text-muted">{tr("نسبة الحضور")}</span>} />
              <Bars max={100} rows={d.byDepartment.map((x) => ({ key: x.department, label: x.department, value: x.rate ?? 0, display: pct(x.rate), sub: tr("{0} موظف · {1} تأخير", x.employees, x.late), tone: x.rate !== null && x.rate < 90 ? 'warn' : 'ok' }))} />
              {k.pendingCorrections > 0 && <Link to="/attendance/corrections" className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn no-underline"><Badge tone="warn">{k.pendingCorrections}</Badge>{tr("طلبات تصحيح بصمة بانتظار القرار")}</Link>}
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الأكثر تأخراً")} />
              <Bars empty={tr("لا تأخير هذا الشهر")} rows={d.topLate.map((p) => ({ key: p.employeeId, label: p.name, value: p.lateMin, display: duration(p.lateMin), sub: tr("{0} يوم", p.lateDays), tone: 'warn', to: '/attendance/report/' + p.employeeId }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الأكثر غياباً")} />
              <Bars empty={tr("لا غياب هذا الشهر")} rows={d.topAbsent.map((p) => ({ key: p.employeeId, label: p.name, value: p.absentDays, sub: tr("{0} يوم", p.absentDays), tone: 'bad', to: '/attendance/report/' + p.employeeId }))} />
            </Card>
            <Card className="flex flex-col gap-3">
              <PanelTitle title={tr("الأكثر عملاً إضافياً")} />
              <Bars empty={tr("لا عمل إضافي هذا الشهر")} rows={d.topOvertime.map((p) => ({ key: p.employeeId, label: p.name, value: p.overtimeMin, display: duration(p.overtimeMin), tone: 'ok', to: '/attendance/report/' + p.employeeId }))} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
