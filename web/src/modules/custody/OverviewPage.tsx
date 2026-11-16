import { Link } from 'react-router-dom';
import { tr } from '../../lib/i18n';
import { useApi } from '../../lib/useApi';
import { dmy, monthLabel } from '../../lib/format';
import { Badge, Card, CardHeader, ErrorBox, ListRow } from '../../ui/Display';
import { Bars, Change, Kpi, MiniStats, PanelTitle, TrendBars } from '../../ui/Dashboard';
import { cx } from '../../ui/cx';
import { DashboardSkeleton } from '../correspondence/CorDashboardPage';
import { Money, STATUS_TONE, kwd } from './shared';
import type { CusRequest, CustodyView, VoucherView } from './types';

interface CusDashboard {
  today: string; month: string; alertPercent: number;
  kpis: { openCount: number; openBalance: number; activeCount: number; pendingActions: number; pendingClose: number; pendingRequests: number; voucherRequests: number; awaitingSign: number; monthSpent: number; prevMonthSpent: number; yearSpent: number; monthEntries: number; noAttachment: number; closedYear: number; avgCloseDays: number | null; alerts: number; monthVouchers: number; monthVouchersAmount: number; holders: number };
  spendByMonth: { month: string; spent: number; count: number }[];
  byCategory: { category: string; amount: number; count: number }[]; byProject: { project: string; amount: number; count: number }[];
  byMethod: { method: string; label: string; amount: number; count: number }[];
  custodies: CustodyView[]; pendingClose: CustodyView[]; pendingRequests: CusRequest[]; voucherRequests: VoucherView[];
}

const kwdShort = (f: number) => kwd(f, false);

/** لوحة العهد للمحاسب: الأرصدة المفتوحة، ما ينتظر إجراءً، الصرف الشهري، التصنيفات والمشاريع، وأصحاب العهد */
export default function CustodyOverviewPage() {
  const q = useApi<CusDashboard>('cus.dashboard', {}, { staleTime: 30_000 });
  if (q.isError) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <DashboardSkeleton />;
  const k = d.kpis;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={tr("عهد مفتوحة")} value={k.openCount} icon="wallet" to="/custody/all" foot={<>{tr("رصيدها")} <Money fils={k.openBalance} strong /></>} />
        <Kpi label={tr("بانتظار إجرائك")} value={k.pendingActions} icon="inbox" tone={k.pendingActions ? 'warn' : 'ok'} strong to="/inbox" foot={tr("{0} إقفال · {1} طلب عهدة · {2} سند · {3} توقيع", k.pendingClose, k.pendingRequests, k.voucherRequests, k.awaitingSign)} />
        <Kpi label={tr("مصروف هذا الشهر")} value={<Money fils={k.monthSpent} />} icon="finance" foot={<>{tr("{0} بند", k.monthEntries)} · <Change now={k.monthSpent} prev={k.prevMonthSpent} format={kwdShort} invert /></>} />
        <Kpi label={tr("تنبيهات الصرف")} value={k.alerts} icon="alert" tone={k.alerts ? 'bad' : 'ok'} strong foot={tr("عهد تجاوزت {0}% من مبلغها أو تجاوزته", d.alertPercent)} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("الصرف الشهري · آخر 12 شهراً")} action={<span className="text-[12px] text-muted">{tr("بالدينار")}</span>} />
          <TrendBars data={d.spendByMonth} series={[{ key: 'spent', label: tr("المصروف"), color: 'var(--c-accent)' }]} labelOf={(x) => monthLabel(String(x.month)).replace(/ \d{4}$/, '')}
            format={(v) => Math.round(v / 1000).toLocaleString('en-US')} label={tr("الصرف الشهري · آخر 12 شهراً")} />
          <MiniStats items={[
            { label: tr("مصروف هذه السنة"), value: kwdShort(k.yearSpent) }, { label: tr("عهد أُقفلت هذه السنة"), value: k.closedYear, sub: k.avgCloseDays === null ? undefined : tr("متوسط {0} يوماً للإقفال", k.avgCloseDays) },
            { label: tr("سندات هذا الشهر"), value: k.monthVouchers, sub: kwdShort(k.monthVouchersAmount) }, { label: tr("بنود بلا مرفق"), value: k.noAttachment }
          ]} />
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حسب التصنيف · هذه السنة")} />
          <Bars rows={d.byCategory.map((x) => ({ key: x.category, label: x.category, value: x.amount, display: kwdShort(x.amount), sub: tr("{0} بند", x.count) }))} />
          {d.byMethod.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">{d.byMethod.map((x) => <span key={x.method} className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-[12px]">{x.label}<b className="num">{kwdShort(x.amount)}</b></span>)}</div>}
        </Card>
      </div>

      <Card padded={false}>
        <CardHeader title={tr("العهد النشطة · {0}", k.activeCount)} action={<Link to="/custody/all" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("كل العهد")}</Link>} />
        {d.custodies.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا عهد نشطة.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-right">
              <thead><tr className="border-b border-line text-[12px] text-muted"><th className="px-4 py-2.5 font-semibold">{tr("العهدة")}</th><th className="px-4 py-2.5 font-semibold">{tr("الحالة")}</th><th className="px-4 py-2.5 font-semibold">{tr("المتاح")}</th><th className="px-4 py-2.5 font-semibold">{tr("المصروف")}</th><th className="px-4 py-2.5 font-semibold">{tr("المتبقي")}</th><th className="px-4 py-2.5 font-semibold">{tr("نسبة الصرف")}</th></tr></thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5">
                {d.custodies.map((c) => (
                  <tr key={c.id} className="hover:bg-chip/40">
                    <td><Link to={'/custody/' + c.id} className="font-semibold text-fg no-underline">{c.employeeName}</Link><div className="text-[12px] text-muted"><span className="num">{c.id}</span> · {c.periodLabel} · {dmy(c.openDate)}</div></td>
                    <td><Badge tone={STATUS_TONE[c.status]}>{c.statusLabel}</Badge></td>
                    <td><Money fils={c.available} /></td>
                    <td><Money fils={c.totalSpent} /></td>
                    <td><Money fils={c.remaining} strong className={cx(c.overspent && 'text-bad')} /></td>
                    <td className="min-w-[140px]">
                      <span className="flex items-center gap-2"><span className="h-2 flex-1 overflow-hidden rounded-full bg-chip"><span className={cx('block h-full rounded-full', c.overspent ? 'bg-bad-solid' : c.alert ? 'bg-warn' : 'bg-ok')} style={{ width: Math.min(100, c.percent) + '%' }} /></span><span className={cx('num w-10 text-end text-[12px]', (c.alert || c.overspent) && 'font-semibold text-bad')}>{c.percent}%</span></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card padded={false}>
          <CardHeader title={tr("إقفالات بانتظار الاعتماد · {0}", k.pendingClose)} />
          {d.pendingClose.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا طلبات إقفال.")}</p> : d.pendingClose.map((c) => <ListRow key={c.id} to={'/custody/' + c.id} title={c.employeeName} sub={`${c.id} · ${c.periodLabel}`} badge={<Money fils={c.remaining} />} />)}
        </Card>
        <Card padded={false}>
          <CardHeader title={tr("طلبات عهد · {0}", k.pendingRequests)} action={<Link to="/custody/requests" className="text-[13px] font-semibold text-accent-fg no-underline">{tr("الطلبات")}</Link>} />
          {d.pendingRequests.length === 0 ? <p className="m-0 px-5 pb-4 text-[13px] text-muted">{tr("لا طلبات.")}</p> : d.pendingRequests.map((r) => <ListRow key={r.id} title={r.employeeName} sub={r.reason} badge={<Money fils={r.amount} />} />)}
        </Card>
        <Card className="flex flex-col gap-3">
          <PanelTitle title={tr("حسب المشروع · هذه السنة")} />
          <Bars empty={tr("لا بنود على مشاريع")} rows={d.byProject.map((x) => ({ key: x.project, label: x.project, value: x.amount, display: kwdShort(x.amount), sub: tr("{0} بند", x.count), tone: 'ok' }))} />
        </Card>
      </div>
    </div>
  );
}
